import knex from 'knex';

export function createKnexClient(serviceName) {
  const user = process.env.POSTGRES_USER ?? 'postgres';
  const password = process.env.POSTGRES_PASSWORD ?? 'postgres';
  const host = process.env.POSTGRES_HOST ?? 'localhost';
  const port = process.env.POSTGRES_PORT ?? '5432';
  const database = process.env.POSTGRES_DB ?? `${serviceName}_db`;
  const schema = process.env.DB_SCHEMA ?? serviceName;
  const connection = process.env.DATABASE_URL ?? `postgresql://${user}:${password}@${host}:${port}/${database}`;

  return knex({
    client: 'pg',
    connection,
    searchPath: [schema],
    pool: { min: 0, max: 10 }
  });
}
