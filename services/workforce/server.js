import { createKnexClient } from '../common/knexClient.js';
import { createServiceServer } from '../common/serverFactory.js';

const port = Number.parseInt(process.env.PORT ?? '4003', 10);
const knexClient = createKnexClient('workforce');

createServiceServer({ serviceName: 'workforce', port, knexClient });
