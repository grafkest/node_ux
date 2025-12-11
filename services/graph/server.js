import { createKnexClient } from '../common/knexClient.js';
import { createServiceServer } from '../common/serverFactory.js';

const port = Number.parseInt(process.env.PORT ?? '4001', 10);
const knexClient = createKnexClient('graph');

createServiceServer({ serviceName: 'graph', port, knexClient });
