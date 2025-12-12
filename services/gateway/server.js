import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';
import process from 'node:process';
import { createAuthMiddleware } from '../common/authMiddleware.js';

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
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false
});

const app = express();
app.use(cors());
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
