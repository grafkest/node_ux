import { createKnexClient } from '../common/knexClient.js';
import { createServiceServer } from '../common/serverFactory.js';

const port = Number.parseInt(process.env.PORT ?? '4002', 10);
const knexClient = createKnexClient('initiatives');

createServiceServer({ serviceName: 'initiatives', port, knexClient });
