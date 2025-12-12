import express from 'express';
import process from 'node:process';
import { createKnexClient } from '../common/knexClient.js';
import { createAuthMiddleware } from '../common/authMiddleware.js';

const GRAPH_API_URL = process.env.GRAPH_API_URL ?? 'http://localhost:4001';
const port = Number.parseInt(process.env.PORT ?? '4002', 10);
const knexClient = createKnexClient('initiatives');
const authMiddleware = createAuthMiddleware();

const app = express();
app.use(express.json());

app.get('/health', async (_req, res) => {
  try {
    await knexClient.raw('select 1');
    res.json({ status: 'ok', service: 'initiatives' });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      service: 'initiatives',
      message: error instanceof Error ? error.message : 'Health check failed'
    });
  }
});

app.use(authMiddleware.protect());

app.get('/initiatives', async (req, res) => {
  const { graphId, nodeId } = req.query;

  try {
    const query = knexClient('initiatives as i')
      .select(
        'i.id',
        'i.title',
        'i.description',
        'i.status',
        'i.created_at as createdAt',
        'i.updated_at as updatedAt'
      )
      .orderBy('i.created_at', 'desc');

    if (graphId || nodeId) {
      query.join('links_to_graph as l', 'l.initiative_id', 'i.id').distinct();
    }

    if (graphId && typeof graphId === 'string') {
      query.where('l.graph_id', graphId);
    }

    if (nodeId && typeof nodeId === 'string') {
      query.where('l.node_id', nodeId);
    }

    const initiatives = await query;
    const links = await knexClient('links_to_graph')
      .select(
        'initiative_id as initiativeId',
        'graph_id as graphId',
        'node_id as nodeId',
        'node_type as nodeType'
      )
      .whereIn(
        'initiative_id',
        initiatives.length ? initiatives.map((item) => item.id) : ['__none__']
      );

    const linksByInitiative = links.reduce((acc, link) => {
      const bucket = acc.get(link.initiativeId) ?? [];
      bucket.push({ graphId: link.graphId, nodeId: link.nodeId, nodeType: link.nodeType });
      acc.set(link.initiativeId, bucket);
      return acc;
    }, new Map());

    res.json(
      initiatives.map((initiative) => ({
        ...formatInitiativeRow(initiative),
        links: linksByInitiative.get(initiative.id) ?? []
      }))
    );
  } catch (error) {
    console.error('Failed to list initiatives', error);
    res.status(500).json({ message: 'Не удалось получить список инициатив.' });
  }
});

app.post('/initiatives', async (req, res) => {
  const { title, description, status, links } = req.body ?? {};

  if (!title || typeof title !== 'string') {
    res.status(400).json({ message: 'Поле title обязательно.' });
    return;
  }

  try {
    if (Array.isArray(links)) {
      for (const link of links) {
        await ensureNodeExists(link.graphId, link.nodeId);
      }
    }

    const [created] = await knexClient('initiatives')
      .insert({ title, description, status, updated_at: knexClient.fn.now() })
      .returning(['id', 'title', 'description', 'status', 'created_at as createdAt', 'updated_at as updatedAt']);

    if (Array.isArray(links) && links.length > 0) {
      await knexClient('links_to_graph').insert(
        links.map((link) => ({
          initiative_id: created.id,
          graph_id: link.graphId,
          node_id: link.nodeId,
          node_type: link.nodeType ?? 'artifact'
        }))
      );
    }

    const formatted = formatInitiativeRow(created);
    formatted.links = Array.isArray(links)
      ? links.map((item) => ({ graphId: item.graphId, nodeId: item.nodeId, nodeType: item.nodeType ?? 'artifact' }))
      : [];

    res.status(201).json(formatted);
  } catch (error) {
    console.error('Failed to create initiative', error);
    res.status(500).json({ message: 'Не удалось создать инициативу.' });
  }
});

app.get('/initiatives/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const initiative = await knexClient('initiatives')
      .select('id', 'title', 'description', 'status', 'created_at as createdAt', 'updated_at as updatedAt')
      .where({ id })
      .first();

    if (!initiative) {
      res.status(404).json({ message: 'Инициатива не найдена.' });
      return;
    }

    const [links, milestones] = await Promise.all([
      knexClient('links_to_graph')
        .select('graph_id as graphId', 'node_id as nodeId', 'node_type as nodeType')
        .where({ initiative_id: id }),
      loadMilestones(id)
    ]);

    res.json({ ...formatInitiativeRow(initiative), links, milestones });
  } catch (error) {
    console.error('Failed to load initiative', error);
    res.status(500).json({ message: 'Не удалось получить инициативу.' });
  }
});

app.put('/initiatives/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, status, links } = req.body ?? {};

  try {
    const existing = await knexClient('initiatives').where({ id }).first();
    if (!existing) {
      res.status(404).json({ message: 'Инициатива не найдена.' });
      return;
    }

    if (Array.isArray(links)) {
      for (const link of links) {
        await ensureNodeExists(link.graphId, link.nodeId);
      }
    }

    await knexClient('initiatives').where({ id }).update({
      title: typeof title === 'string' ? title : existing.title,
      description: typeof description === 'string' ? description : existing.description,
      status: typeof status === 'string' ? status : existing.status,
      updated_at: knexClient.fn.now()
    });

    if (Array.isArray(links)) {
      await knexClient('links_to_graph').where({ initiative_id: id }).del();
      if (links.length > 0) {
        await knexClient('links_to_graph').insert(
          links.map((link) => ({
            initiative_id: id,
            graph_id: link.graphId,
            node_id: link.nodeId,
            node_type: link.nodeType ?? 'artifact'
          }))
        );
      }
    }

    const [updated] = await knexClient('initiatives')
      .select('id', 'title', 'description', 'status', 'created_at as createdAt', 'updated_at as updatedAt')
      .where({ id });
    const loadedLinks = await knexClient('links_to_graph')
      .select('graph_id as graphId', 'node_id as nodeId', 'node_type as nodeType')
      .where({ initiative_id: id });

    res.json({ ...formatInitiativeRow(updated), links: loadedLinks });
  } catch (error) {
    console.error('Failed to update initiative', error);
    res.status(500).json({ message: 'Не удалось обновить инициативу.' });
  }
});

app.get('/initiatives/:id/milestones', async (req, res) => {
  const { id } = req.params;

  try {
    const initiative = await knexClient('initiatives').where({ id }).first();
    if (!initiative) {
      res.status(404).json({ message: 'Инициатива не найдена.' });
      return;
    }

    const milestones = await loadMilestones(id);
    res.json(milestones);
  } catch (error) {
    console.error('Failed to load milestones', error);
    res.status(500).json({ message: 'Не удалось получить список контрольных точек.' });
  }
});

app.post('/initiatives/:id/milestones', async (req, res) => {
  const { id } = req.params;
  const { title, dueDate, status } = req.body ?? {};

  if (!title || typeof title !== 'string') {
    res.status(400).json({ message: 'Поле title обязательно.' });
    return;
  }

  try {
    const initiative = await knexClient('initiatives').where({ id }).first();
    if (!initiative) {
      res.status(404).json({ message: 'Инициатива не найдена.' });
      return;
    }

    const [created] = await knexClient('milestones')
      .insert({
        initiative_id: id,
        title,
        due_date: typeof dueDate === 'string' ? dueDate : null,
        status: typeof status === 'string' ? status : 'planned',
        updated_at: knexClient.fn.now()
      })
      .returning(['id', 'title', 'due_date as dueDate', 'status', 'created_at as createdAt', 'updated_at as updatedAt']);

    res.status(201).json(created);
  } catch (error) {
    console.error('Failed to create milestone', error);
    res.status(500).json({ message: 'Не удалось создать контрольную точку.' });
  }
});

app.post('/events/graph', async (req, res) => {
  const { type, data } = req.body ?? {};

  if (type !== 'graph.published') {
    res.status(202).json({ status: 'ignored' });
    return;
  }

  if (!data?.graphId) {
    res.status(400).json({ message: 'graphId обязателен для события graph.published' });
    return;
  }

  try {
    await recomputeRisksForGraph(data.graphId);
    res.status(202).json({ status: 'recalculated' });
  } catch (error) {
    console.error('Failed to recompute risks', error);
    res.status(500).json({ message: 'Не удалось пересчитать риски.' });
  }
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`initiatives service listening on port ${port}`);
});

const shutdown = () => {
  console.log('Shutting down initiatives service');
  void knexClient.destroy().finally(() => {
    server.close(() => {
      process.exit(0);
    });
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function formatInitiativeRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status,
    createdAt: toIso(row.createdAt ?? row.created_at),
    updatedAt: toIso(row.updatedAt ?? row.updated_at)
  };
}

function toIso(value) {
  if (!value) return undefined;
  return typeof value === 'string' ? value : value.toISOString();
}

async function ensureNodeExists(graphId, nodeId) {
  if (!graphId || !nodeId) {
    throw new Error('graphId и nodeId обязательны для ссылки на граф.');
  }

  const response = await fetch(`${GRAPH_API_URL}/graphs/${graphId}/nodes/${nodeId}`);

  if (response.status === 404) {
    throw new Error(`Узел ${nodeId} не найден в графе ${graphId}.`);
  }

  if (!response.ok) {
    throw new Error(`Graph API вернул ошибку: ${response.status}`);
  }
}

async function loadMilestones(initiativeId) {
  const milestones = await knexClient('milestones')
    .select('id', 'title', 'due_date as dueDate', 'status', 'created_at as createdAt', 'updated_at as updatedAt')
    .where({ initiative_id: initiativeId })
    .orderBy('due_date', 'asc');

  return milestones.map((row) => ({
    ...row,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  }));
}

async function fetchGraphNodes(graphId) {
  const response = await fetch(`${GRAPH_API_URL}/graphs/${graphId}/nodes`);

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`Graph API вернул ошибку: ${response.status}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) return [];
  return payload;
}

async function recomputeRisksForGraph(graphId) {
  const nodes = await fetchGraphNodes(graphId);
  const nodeSet = new Set(nodes.map((node) => node.nodeId));

  const links = await knexClient('links_to_graph')
    .select('initiative_id as initiativeId', 'node_id as nodeId', 'node_type as nodeType')
    .where({ graph_id: graphId });

  const trx = await knexClient.transaction();

  try {
    const existingRisks = await trx('risks')
      .select('id', 'initiative_id as initiativeId', 'node_id as nodeId', 'risk_type as riskType')
      .where({ graph_id: graphId });

    const missingLinks = links.filter((link) => !nodeSet.has(link.nodeId));
    const missingKeys = new Set(missingLinks.map((link) => `${link.initiativeId}:${link.nodeId}`));

    const idsToResolve = existingRisks
      .filter((risk) => risk.riskType === 'missing_node' && !missingKeys.has(`${risk.initiativeId}:${risk.nodeId}`))
      .map((risk) => risk.id);

    if (idsToResolve.length > 0) {
      await trx('risks').whereIn('id', idsToResolve).update({ resolved: true, updated_at: trx.fn.now() });
    }

    for (const link of missingLinks) {
      const existing = existingRisks.find(
        (risk) => risk.initiativeId === link.initiativeId && risk.nodeId === link.nodeId && risk.riskType === 'missing_node'
      );

      if (existing) {
        await trx('risks')
          .where({ id: existing.id })
          .update({ resolved: false, updated_at: trx.fn.now(), message: `Узел ${link.nodeId} отсутствует в графе ${graphId}` });
      } else {
        await trx('risks').insert({
          initiative_id: link.initiativeId,
          graph_id: graphId,
          node_id: link.nodeId,
          risk_type: 'missing_node',
          severity: 'high',
          message: `Узел ${link.nodeId} отсутствует в графе ${graphId}`,
          resolved: false,
          created_at: trx.fn.now(),
          updated_at: trx.fn.now()
        });
      }
    }

    await trx.commit();
  } catch (error) {
    await trx.rollback();
    throw error;
  }
}
