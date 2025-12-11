import express from 'express';

export function createServiceServer({ serviceName, port, knexClient }) {
  const app = express();
  app.use(express.json());

  app.get('/health', async (_req, res) => {
    try {
      await knexClient.raw('select 1');
      res.json({ status: 'ok', service: serviceName });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        service: serviceName,
        message: error instanceof Error ? error.message : 'Health check failed'
      });
    }
  });

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`${serviceName} service listening on port ${port}`);
  });

  const shutdown = () => {
    console.log(`Shutting down ${serviceName} service`);
    void knexClient.destroy().finally(() => {
      server.close(() => {
        process.exit(0);
      });
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
