import cors from 'cors';
import express from 'express';
import type { Request, Response } from 'express';
import process from 'node:process';
import {
  closeGraphStore,
  createGraph,
  deleteGraph,
  initializeGraphStore,
  isGraphSnapshotPayload,
  listGraphs,
  loadSnapshot,
  persistSnapshot
} from './graphStore';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/api/graphs', (_req: Request, res: Response) => {
  try {
    const graphs = listGraphs();
    res.json(graphs);
  } catch (error) {
    console.error('Failed to list graphs', error);
    res.status(500).json({ message: 'Не удалось получить список графов.' });
  }
});

app.post('/api/graphs', (req: Request, res: Response) => {
  const {
    name,
    sourceGraphId,
    includeDomains,
    includeModules,
    includeArtifacts,
    includeInitiatives
  } = req.body ?? {};

  if (typeof name !== 'string') {
    res.status(400).json({ message: 'Название графа обязательно.' });
    return;
  }

  const payload = {
    name,
    sourceGraphId: typeof sourceGraphId === 'string' && sourceGraphId.length > 0 ? sourceGraphId : undefined,
    includeDomains: Boolean(includeDomains ?? true),
    includeModules: Boolean(includeModules ?? true),
    includeArtifacts: Boolean(includeArtifacts ?? true),
    includeInitiatives: Boolean(includeInitiatives ?? true)
  } as const;

  try {
    const created = createGraph(payload);
    res.status(201).json(created);
  } catch (error) {
    console.error('Failed to create graph', error);
    const message = error instanceof Error ? error.message : 'Не удалось создать граф.';
    res.status(500).json({ message });
  }
});

app.delete('/api/graphs/:graphId', (req: Request, res: Response) => {
  const { graphId } = req.params;

  try {
    deleteGraph(graphId);
    res.status(204).end();
  } catch (error) {
    console.error('Failed to delete graph', error);
    const message = error instanceof Error ? error.message : 'Не удалось удалить граф.';
    res.status(message.includes('Нельзя удалить') || message.includes('не найден') ? 400 : 500).json({ message });
  }
});

app.get('/api/graphs/:graphId', (req: Request, res: Response) => {
  const { graphId } = req.params;

  try {
    const snapshot = loadSnapshot(graphId);
    res.json(snapshot);
  } catch (error) {
    console.error('Failed to load graph snapshot', error);
    const message = error instanceof Error ? error.message : 'Не удалось получить данные графа.';
    res.status(message.includes('не найден') ? 404 : 500).json({ message });
  }
});

app.post('/api/graphs/:graphId', (req: Request, res: Response) => {
  const { graphId } = req.params;
  const payload = req.body;

  if (!isGraphSnapshotPayload(payload)) {
    res.status(400).json({ message: 'Некорректный формат данных графа.' });
    return;
  }

  try {
    persistSnapshot(graphId, payload);
    res.status(204).end();
  } catch (error) {
    console.error('Failed to save graph snapshot', error);
    const message = error instanceof Error ? error.message : 'Не удалось сохранить данные графа.';
    res.status(message.includes('не найден') ? 404 : 500).json({ message });
  }
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

void initializeGraphStore()
  .then(() => {
    const port = Number.parseInt(process.env.PORT ?? '4000', 10);
    const server = app.listen(port, () => {
      console.log(`Graph storage server listening on port ${port}`);
    });

    const shutdown = () => {
      console.log('Shutting down graph storage server');
      closeGraphStore();
      server.close(() => {
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  })
  .catch((error) => {
    console.error('Failed to initialize database', error);
    process.exit(1);
  });
