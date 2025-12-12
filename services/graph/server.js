import crypto from 'node:crypto';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import process from 'node:process';
import { createAuthMiddleware } from '../common/authMiddleware.js';
import { createMemoryCache, getOrSet } from '../common/cache.js';
import { createKnexClient } from '../common/knexClient.js';

const DEFAULT_GRAPH_ID = 'main';
const DEFAULT_GRAPH_NAME = 'Основной';
const GRAPH_PUBLISHED_WEBHOOK = process.env.GRAPH_PUBLISHED_WEBHOOK_URL ?? process.env.GRAPH_PUBLISH_WEBHOOK_URL;

const port = Number.parseInt(process.env.PORT ?? '4001', 10);
const knexClient = createKnexClient('graph');
const authMiddleware = createAuthMiddleware();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 400,
  standardHeaders: true,
  legacyHeaders: false
});
const directoryCache = createMemoryCache({ ttlMs: 2 * 60 * 1000 });
const nodesCache = createMemoryCache({ ttlMs: 60 * 1000 });

const app = express();
app.use(cors());
app.use(limiter);
app.use(express.json({ limit: '5mb' }));

app.get('/health', async (_req, res) => {
  try {
    await knexClient.raw('select 1');
    res.json({ status: 'ok', service: 'graph' });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      service: 'graph',
      message: error instanceof Error ? error.message : 'Health check failed'
    });
  }
});

app.use(authMiddleware.protect());

app.get('/graphs', async (_req, res) => {
  try {
    const graphs = await getOrSet(directoryCache, 'graphs:list', async () =>
      knexClient('graphs')
        .select('id', 'name', 'is_default as isDefault', 'created_at as createdAt', 'updated_at as updatedAt')
        .orderBy([{ column: 'is_default', order: 'desc' }, { column: 'created_at', order: 'asc' }])
    );

    res.json(graphs.map(normalizeGraphRow));
  } catch (error) {
    console.error('Failed to list graphs', error);
    res.status(500).json({ message: 'Не удалось получить список графов.' });
  }
});

app.post('/graphs', async (req, res) => {
  const { name, sourceGraphId, includeDomains, includeModules, includeArtifacts, includeInitiatives } = req.body ?? {};

  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ message: 'Название графа обязательно.' });
    return;
  }

  const payload = {
    name: name.trim(),
    sourceGraphId: typeof sourceGraphId === 'string' && sourceGraphId.length > 0 ? sourceGraphId : undefined,
    includeDomains: Boolean(includeDomains ?? true),
    includeModules: Boolean(includeModules ?? true),
    includeArtifacts: Boolean(includeArtifacts ?? true),
    includeInitiatives: Boolean(includeInitiatives ?? true)
  };

  try {
    const created = await createGraph(payload);
    directoryCache.clear();
    nodesCache.clear();
    res.status(201).json(created);
  } catch (error) {
    console.error('Failed to create graph', error);
    const message = error instanceof Error ? error.message : 'Не удалось создать граф.';
    res.status(message.includes('не найден') ? 404 : 500).json({ message });
  }
});

app.get('/graphs/:graphId', async (req, res) => {
  const { graphId } = req.params;

  try {
    const snapshot = await loadLatestSnapshot(graphId);
    if (!snapshot) {
      res.status(404).json({ message: `Граф с идентификатором ${graphId} не найден.` });
      return;
    }
    res.json(snapshot);
  } catch (error) {
    console.error('Failed to load graph snapshot', error);
    const message = error instanceof Error ? error.message : 'Не удалось получить данные графа.';
    res.status(message.includes('не найден') ? 404 : 500).json({ message });
  }
});

app.get('/graphs/:graphId/snapshots', async (req, res) => {
  const { graphId } = req.params;

  try {
    const snapshots = await listSnapshots(graphId);
    if (snapshots.length === 0) {
      res.status(404).json({ message: `Граф с идентификатором ${graphId} не найден.` });
      return;
    }

    res.json(snapshots);
  } catch (error) {
    console.error('Failed to list graph snapshots', error);
    const message = error instanceof Error ? error.message : 'Не удалось получить список снапшотов.';
    res.status(message.includes('не найден') ? 404 : 500).json({ message });
  }
});

app.get('/graphs/:graphId/nodes', async (req, res) => {
  const { graphId } = req.params;

  try {
    const nodes = await getOrSet(nodesCache, `nodes:${graphId}`, () => listNodes(graphId));
    res.json(nodes);
  } catch (error) {
    console.error('Failed to list nodes', error);
    const message = error instanceof Error ? error.message : 'Не удалось получить узлы графа.';
    res.status(message.includes('не найден') ? 404 : 500).json({ message });
  }
});

app.get('/graphs/:graphId/nodes/:nodeId', async (req, res) => {
  const { graphId, nodeId } = req.params;

  try {
    const node = await findNode(graphId, nodeId);
    if (!node) {
      res.status(404).json({ message: 'Узел не найден.' });
      return;
    }

    res.json(node);
  } catch (error) {
    console.error('Failed to load node', error);
    const message = error instanceof Error ? error.message : 'Не удалось получить узел графа.';
    res.status(message.includes('не найден') ? 404 : 500).json({ message });
  }
});

app.put('/graphs/:graphId', async (req, res) => {
  const { graphId } = req.params;
  const payload = req.body;

  if (!isGraphSnapshotPayload(payload)) {
    res.status(400).json({ message: 'Некорректный формат данных графа.' });
    return;
  }

  try {
    await persistSnapshot(graphId, payload);
    nodesCache.clear();
    res.status(204).end();
  } catch (error) {
    console.error('Failed to save graph snapshot', error);
    const message = error instanceof Error ? error.message : 'Не удалось сохранить данные графа.';
    res.status(message.includes('не найден') ? 404 : 500).json({ message });
  }
});

app.delete('/graphs/:graphId', async (req, res) => {
  const { graphId } = req.params;

  try {
    await deleteGraph(graphId);
    directoryCache.clear();
    nodesCache.clear();
    res.status(204).end();
  } catch (error) {
    console.error('Failed to delete graph', error);
    const message = error instanceof Error ? error.message : 'Не удалось удалить граф.';
    res.status(message.includes('Нельзя удалить') || message.includes('не найден') ? 400 : 500).json({ message });
  }
});

async function start() {
  try {
    await ensureDefaultGraph();
  } catch (error) {
    console.error('Failed to ensure default graph', error);
    process.exit(1);
  }

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Graph service listening on port ${port}`);
  });

  const shutdown = () => {
    console.log('Shutting down graph service');
    void knexClient.destroy().finally(() => {
      server.close(() => {
        process.exit(0);
      });
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void start();

async function ensureDefaultGraph() {
  const existing = await knexClient('graphs').where({ id: DEFAULT_GRAPH_ID }).first();
  if (!existing) {
    await knexClient('graphs').insert({
      id: DEFAULT_GRAPH_ID,
      name: DEFAULT_GRAPH_NAME,
      is_default: true,
      created_at: new Date().toISOString(),
      updated_at: null
    });
  }
}

async function createGraph(options) {
  const now = new Date().toISOString();
  const graphId = crypto.randomUUID();

  await knexClient('graphs').insert({
    id: graphId,
    name: options.name,
    is_default: false,
    created_at: now,
    updated_at: null
  });

  if (options.sourceGraphId) {
    const sourceSnapshot = await loadLatestSnapshot(options.sourceGraphId);
    if (!sourceSnapshot) {
      throw new Error(`Граф с идентификатором ${options.sourceGraphId} не найден.`);
    }

    const snapshot = {
      version: sourceSnapshot.version,
      exportedAt: now,
      domains: options.includeDomains ? sourceSnapshot.domains : [],
      modules: options.includeModules ? sourceSnapshot.modules : [],
      artifacts: options.includeArtifacts ? sourceSnapshot.artifacts : [],
      experts: sourceSnapshot.experts ?? [],
      initiatives: options.includeInitiatives ? sourceSnapshot.initiatives ?? [] : [],
      layout: options.includeModules && sourceSnapshot.layout ? sourceSnapshot.layout : undefined,
      scopesIncluded: sourceSnapshot.scopesIncluded
    };

    await persistSnapshot(graphId, snapshot);
  }

  const created = await knexClient('graphs')
    .select('id', 'name', 'is_default as isDefault', 'created_at as createdAt', 'updated_at as updatedAt')
    .where({ id: graphId })
    .first();

  return normalizeGraphRow(created);
}

async function deleteGraph(graphId) {
  if (graphId === DEFAULT_GRAPH_ID) {
    throw new Error('Нельзя удалить основной граф.');
  }

  const graph = await knexClient('graphs').where({ id: graphId }).first();
  if (!graph) {
    throw new Error(`Граф с идентификатором ${graphId} не найден.`);
  }

  await knexClient('graphs').where({ id: graphId }).del();
}

async function loadLatestSnapshot(graphId) {
  const graph = await knexClient('graphs').where({ id: graphId }).first();
  if (!graph) {
    return null;
  }

  const snapshot = await knexClient('snapshots')
    .select('payload')
    .where({ graph_id: graphId })
    .orderBy('created_at', 'desc')
    .first();

  return snapshot?.payload ?? null;
}

async function listSnapshots(graphId) {
  const graph = await knexClient('graphs').where({ id: graphId }).first();
  if (!graph) {
    throw new Error(`Граф с идентификатором ${graphId} не найден.`);
  }

  const snapshots = await knexClient('snapshots')
    .select('id', 'payload', 'created_at as createdAt')
    .where({ graph_id: graphId })
    .orderBy('created_at', 'desc');

  return snapshots.map((row) => ({
    id: row.id,
    createdAt: toIso(row.createdAt),
    payload: row.payload
  }));
}

async function listNodes(graphId) {
  const graph = await knexClient('graphs').where({ id: graphId }).first();
  if (!graph) {
    throw new Error(`Граф с идентификатором ${graphId} не найден.`);
  }

  const [domains, modules, artifacts] = await Promise.all([
    knexClient('domains')
      .select('node_id as nodeId', 'graph_id as graphId', 'external_id as externalId', knexClient.raw("'domain' as type"))
      .where({ graph_id: graphId }),
    knexClient('modules')
      .select('node_id as nodeId', 'graph_id as graphId', 'external_id as externalId', knexClient.raw("'module' as type"))
      .where({ graph_id: graphId }),
    knexClient('artifacts')
      .select('node_id as nodeId', 'graph_id as graphId', 'external_id as externalId', knexClient.raw("'artifact' as type"))
      .where({ graph_id: graphId })
  ]);

  return [...domains, ...modules, ...artifacts];
}

async function findNode(graphId, nodeId) {
  const nodes = await listNodes(graphId);
  return nodes.find((node) => node.nodeId === nodeId) ?? null;
}

async function persistSnapshot(graphId, snapshot) {
  const now = new Date().toISOString();
  const trx = await knexClient.transaction();

  try {
    const graph = await trx('graphs').where({ id: graphId }).first();
    if (!graph) {
      throw new Error(`Граф с идентификатором ${graphId} не найден.`);
    }

    const domainMap = await syncDomains(trx, graphId, snapshot.domains ?? []);
    const moduleMap = await syncModules(trx, graphId, snapshot.modules ?? []);
    const artifactMap = await syncArtifacts(trx, graphId, snapshot.artifacts ?? []);
    const nodeIdLookup = new Map([...domainMap.entries(), ...moduleMap.entries(), ...artifactMap.entries()]);

    await syncLayouts(trx, graphId, snapshot.layout, nodeIdLookup);

    await trx('relations').where({ graph_id: graphId }).del();

    const snapshotId = crypto.randomUUID();
    await trx('snapshots').insert({ id: snapshotId, graph_id: graphId, payload: snapshot, created_at: now });
    await trx('graphs').where({ id: graphId }).update({ updated_at: now });

    await trx.commit();

    void sendGraphPublishedEvent({ graphId, snapshotId, publishedAt: now, snapshot });
    return { snapshotId, publishedAt: now };
  } catch (error) {
    await trx.rollback();
    throw error;
  }
}

async function syncDomains(trx, graphId, domains) {
  const flattened = flattenDomains(domains);
  const externalIds = flattened.map((item) => item.domain.id);

  const existing = await trx('domains')
    .select('external_id as externalId', 'node_id as nodeId')
    .where({ graph_id: graphId })
    .whereIn('external_id', externalIds);

  const existingMap = new Map(existing.map((row) => [row.externalId, row.nodeId]));
  const nodeMap = new Map();

  for (const item of flattened) {
    const domain = item.domain;
    const nodeId = existingMap.get(domain.id) ?? crypto.randomUUID();

    if (existingMap.has(domain.id)) {
      await trx('domains')
        .where({ graph_id: graphId, external_id: domain.id })
        .update({
          name: domain.name,
          description: domain.description ?? null,
          parent_external_id: item.parentId,
          position: item.position,
          payload: domain,
          updated_at: trx.fn.now()
        });
    } else {
      await trx('domains').insert({
        node_id: nodeId,
        graph_id: graphId,
        external_id: domain.id,
        name: domain.name,
        description: domain.description ?? null,
        parent_external_id: item.parentId,
        position: item.position,
        payload: domain,
        updated_at: trx.fn.now()
      });
    }

    nodeMap.set(domain.id, nodeId);
  }

  const idsToKeep = externalIds.length > 0 ? externalIds : ['__none__'];
  await trx('domains').where({ graph_id: graphId }).whereNotIn('external_id', idsToKeep).del();

  return nodeMap;
}

async function syncModules(trx, graphId, modules) {
  const externalIds = modules.map((module) => module.id);
  const existing = await trx('modules')
    .select('external_id as externalId', 'node_id as nodeId')
    .where({ graph_id: graphId })
    .whereIn('external_id', externalIds);

  const existingMap = new Map(existing.map((row) => [row.externalId, row.nodeId]));
  const nodeMap = new Map();

  for (const [index, module] of modules.entries()) {
    const nodeId = existingMap.get(module.id) ?? crypto.randomUUID();

    if (existingMap.has(module.id)) {
      await trx('modules')
        .where({ graph_id: graphId, external_id: module.id })
        .update({ payload: module, position: index, updated_at: trx.fn.now() });
    } else {
      await trx('modules').insert({
        node_id: nodeId,
        graph_id: graphId,
        external_id: module.id,
        position: index,
        payload: module,
        updated_at: trx.fn.now()
      });
    }

    nodeMap.set(module.id, nodeId);
  }

  const idsToKeep = externalIds.length > 0 ? externalIds : ['__none__'];
  await trx('modules').where({ graph_id: graphId }).whereNotIn('external_id', idsToKeep).del();

  return nodeMap;
}

async function syncArtifacts(trx, graphId, artifacts) {
  const externalIds = artifacts.map((artifact) => artifact.id);
  const existing = await trx('artifacts')
    .select('external_id as externalId', 'node_id as nodeId')
    .where({ graph_id: graphId })
    .whereIn('external_id', externalIds);

  const existingMap = new Map(existing.map((row) => [row.externalId, row.nodeId]));
  const nodeMap = new Map();

  for (const [index, artifact] of artifacts.entries()) {
    const nodeId = existingMap.get(artifact.id) ?? crypto.randomUUID();

    if (existingMap.has(artifact.id)) {
      await trx('artifacts')
        .where({ graph_id: graphId, external_id: artifact.id })
        .update({ payload: artifact, position: index, updated_at: trx.fn.now() });
    } else {
      await trx('artifacts').insert({
        node_id: nodeId,
        graph_id: graphId,
        external_id: artifact.id,
        position: index,
        payload: artifact,
        updated_at: trx.fn.now()
      });
    }

    nodeMap.set(artifact.id, nodeId);
  }

  const idsToKeep = externalIds.length > 0 ? externalIds : ['__none__'];
  await trx('artifacts').where({ graph_id: graphId }).whereNotIn('external_id', idsToKeep).del();

  return nodeMap;
}

async function syncLayouts(trx, graphId, layout, nodeIdLookup) {
  const layoutNodes = layout?.nodes ?? {};
  const externalIds = Object.keys(layoutNodes);

  const existingLayouts = await trx('layouts')
    .select('external_id as externalId', 'node_id as nodeId')
    .where({ graph_id: graphId })
    .whereIn('external_id', externalIds);

  const existingMap = new Map(existingLayouts.map((row) => [row.externalId, row.nodeId]));

  for (const [externalId, position] of Object.entries(layoutNodes)) {
    const nodeId = nodeIdLookup.get(externalId) ?? existingMap.get(externalId) ?? crypto.randomUUID();
    nodeIdLookup.set(externalId, nodeId);

    if (existingMap.has(externalId)) {
      await trx('layouts').where({ graph_id: graphId, external_id: externalId }).update({
        node_id: nodeId,
        position,
        updated_at: trx.fn.now()
      });
    } else {
      await trx('layouts').insert({
        id: crypto.randomUUID(),
        graph_id: graphId,
        external_id: externalId,
        node_id: nodeId,
        position,
        updated_at: trx.fn.now()
      });
    }
  }

  const idsToKeep = externalIds.length > 0 ? externalIds : ['__none__'];
  await trx('layouts').where({ graph_id: graphId }).whereNotIn('external_id', idsToKeep).del();
}

function flattenDomains(domains, parentId = null, position = 0, acc = []) {
  domains.forEach((domain, index) => {
    const entry = { domain, parentId, position: index + position };
    acc.push(entry);

    if (Array.isArray(domain.children) && domain.children.length > 0) {
      flattenDomains(domain.children, domain.id, 0, acc);
    }
  });
  return acc;
}

function isGraphSnapshotPayload(value) {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value;
  if (
    !Array.isArray(candidate.domains) ||
    !Array.isArray(candidate.modules) ||
    !Array.isArray(candidate.artifacts) ||
    (candidate.initiatives !== undefined && !Array.isArray(candidate.initiatives)) ||
    (candidate.experts !== undefined && !Array.isArray(candidate.experts))
  ) {
    return false;
  }

  return true;
}

function normalizeGraphRow(row) {
  return {
    id: row.id,
    name: row.name,
    isDefault: Boolean(row.isDefault ?? row.is_default),
    createdAt: toIso(row.createdAt ?? row.created_at),
    updatedAt: row.updatedAt ? toIso(row.updatedAt) : row.updated_at ? toIso(row.updated_at) : undefined
  };
}

function toIso(value) {
  if (!value) return undefined;
  return typeof value === 'string' ? value : value.toISOString();
}

async function sendGraphPublishedEvent(event) {
  if (!GRAPH_PUBLISHED_WEBHOOK) {
    console.info('graph.published event', event);
    return;
  }

  try {
    await fetch(GRAPH_PUBLISHED_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'graph.published', data: event })
    });
  } catch (error) {
    console.warn('Failed to deliver graph.published webhook', error);
  }
}
