const schema = process.env.DB_SCHEMA ?? 'workforce';

exports.up = async function up(knex) {
  await knex.raw(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await knex.schema.withSchema(schema).createTable('health_checks', (table) => {
    table.increments('id').primary();
    table.string('status').notNullable();
    table.timestamp('checked_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function down(knex) {
  await knex.schema.withSchema(schema).dropTableIfExists('health_checks');
};
