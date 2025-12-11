const path = require('node:path');

function databaseConfig(serviceName) {
  const user = process.env.POSTGRES_USER ?? 'postgres';
  const password = process.env.POSTGRES_PASSWORD ?? 'postgres';
  const host = process.env.POSTGRES_HOST ?? 'localhost';
  const port = process.env.POSTGRES_PORT ?? '5432';
  const database = process.env.POSTGRES_DB ?? `${serviceName}_db`;
  const schema = process.env.DB_SCHEMA ?? serviceName;
  const connection = process.env.DATABASE_URL ?? `postgresql://${user}:${password}@${host}:${port}/${database}`;

  return {
    client: 'pg',
    connection,
    searchPath: [schema],
    migrations: {
      directory: path.resolve(__dirname, '..', serviceName, 'migrations'),
      tableName: `${serviceName}_knex_migrations`,
      schemaName: schema
    }
  };
}

module.exports = { databaseConfig };
