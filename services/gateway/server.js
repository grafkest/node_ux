import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';
import process from 'node:process';
import { createAuthMiddleware } from '../common/authMiddleware.js';
import { createMemoryCache, getOrSet } from '../common/cache.js';

const port = Number.parseInt(process.env.PORT ?? '4000', 10);
const targets = {
  auth: process.env.AUTH_SERVICE_URL ?? 'http://auth:4004',
  graph: process.env.GRAPH_SERVICE_URL ?? 'http://graph:4001',
  initiatives: process.env.INITIATIVES_SERVICE_URL ?? 'http://initiatives:4002',
  workforce: process.env.WORKFORCE_SERVICE_URL ?? 'http://workforce:4003'
};

const metrics = { requestCount: 0, startedAt: Date.now() };
const authMiddleware = createAuthMiddleware();

const limiter = rateLimit({
  windowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? `${15 * 60 * 1000}`, 10),
  limit: Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '600', 10),
  standardHeaders: true,
  legacyHeaders: false
});
const graphCache = createMemoryCache({ ttlMs: Number.parseInt(process.env.GRAPH_CACHE_TTL_MS ?? '60000', 10) });
const workforceCache = createMemoryCache({ ttlMs: Number.parseInt(process.env.WORKFORCE_CACHE_TTL_MS ?? '90000', 10) });
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const app = express();
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true
  })
);
app.use(express.json());
app.use(limiter);
app.use((req, _res, next) => {
  metrics.requestCount += 1;
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'gateway', uptime: process.uptime(), requestsTotal: metrics.requestCount });
});

app.get('/metrics', (_req, res) => {
  res.json({
    service: 'gateway',
    uptimeSeconds: Math.round(process.uptime()),
    requestsTotal: metrics.requestCount,
    startedAt: new Date(metrics.startedAt).toISOString()
  });
});

function applyProxy(path, target, { requireAuth = true } = {}) {
  const middleware = [];
  if (requireAuth) {
    middleware.push(authMiddleware.protect());
  }

  middleware.push(
    createProxyMiddleware({
      target,
      changeOrigin: true,
      logLevel: 'warn',
      pathRewrite: { '^/api': '' }
    })
  );

  app.use(path, ...middleware);
}

app.get('/api/initiatives/:id', authMiddleware.protect(), async (req, res) => {
  const { id } = req.params;

  try {
    const headers = buildAuthHeaders(req.headers.authorization);
    const initiativePromise = fetchJson(`${targets.initiatives}/initiatives/${id}`, headers);
    const assignmentsPromise = fetchAssignments(id, headers);

    const initiativePayload = await initiativePromise;
    if (initiativePayload.status === 404) {
      res.status(404).json({ message: 'Инициатива не найдена.' });
      return;
    }

    const initiative = initiativePayload.data;
    const graphIds = Array.from(new Set((initiative.links ?? []).map((link) => link.graphId).filter(Boolean)));
    const nodePromises = graphIds.map(async (graphId) => ({
      graphId,
      nodes: await fetchGraphNodes(graphId, headers)
    }));

    const [assignments, nodesByGraph] = await Promise.all([assignmentsPromise, Promise.all(nodePromises)]);
    const nodeLookupByGraph = new Map(
      nodesByGraph.map((chunk) => [chunk.graphId, new Map(chunk.nodes.map((node) => [node.nodeId ?? node.id, node]))])
    );

    const linkedNodes = (initiative.links ?? []).map((link) => {
      const node = nodeLookupByGraph.get(link.graphId)?.get(link.nodeId) ?? null;
      return { ...link, node };
    });

    const seenNodes = new Set();
    const relatedNodes = linkedNodes
      .map((link) => link.node)
      .filter(Boolean)
      .filter((node) => {
        const key = `${node.graphId ?? 'graph'}:${node.nodeId ?? node.id}`;
        if (seenNodes.has(key)) {
          return false;
        }
        seenNodes.add(key);
        return true;
      });

    res.json({
      initiative: { ...initiative, links: linkedNodes },
      relatedNodes,
      team: assignments
    });
  } catch (error) {
    console.error('Failed to aggregate initiative card', error);
    res.status(500).json({ message: 'Не удалось получить карточку инициативы.' });
  }
});

applyProxy('/api/login', targets.auth, { requireAuth: false });
applyProxy('/api/users', targets.auth);
applyProxy('/api/graphs', targets.graph);
applyProxy('/api/initiatives', targets.initiatives);
applyProxy('/api/employees', targets.workforce);
applyProxy('/api/assignments', targets.workforce);

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Gateway service listening on port ${port}`);
});

const shutdown = () => {
  console.log('Shutting down gateway service');
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function buildAuthHeaders(authHeader) {
  const headers = {};
  if (authHeader) {
    headers.Authorization = authHeader;
  }
  return headers;
}

async function fetchJson(url, headers) {
  const response = await fetch(url, { headers });
  const isJson = (response.headers.get('content-type') ?? '').includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (response.status === 404) {
    return { status: 404, data: payload };
  }

  if (!response.ok) {
    throw new Error(`Request to ${url} failed with status ${response.status}`);
  }

  return { status: response.status, data: payload };
}

async function fetchGraphNodes(graphId, headers) {
  return getOrSet(graphCache, `graph:nodes:${graphId}`, async () => {
    const response = await fetchJson(`${targets.graph}/graphs/${graphId}/nodes`, headers);
    if (response.status === 404) {
      return [];
    }
    return Array.isArray(response.data) ? response.data : [];
  });
}

async function fetchAssignments(initiativeId, headers) {
  return getOrSet(workforceCache, `assignments:${initiativeId}`, async () => {
    const response = await fetchJson(`${targets.workforce}/assignments?initiativeId=${initiativeId}`, headers);
    return Array.isArray(response.data) ? response.data : [];
  });
}
