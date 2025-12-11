import { createKnexClient } from '../common/knexClient.js';
import { createServiceServer } from '../common/serverFactory.js';

const port = Number.parseInt(process.env.PORT ?? '4004', 10);
const knexClient = createKnexClient('auth');

createServiceServer({ serviceName: 'auth', port, knexClient });
