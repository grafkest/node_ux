const schema = process.env.DB_SCHEMA ?? 'graph';

exports.up = async function up(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  await knex.raw(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);

  await knex.schema.withSchema(schema).createTable('graphs', (table) => {
    table.string('id').primary();
    table.string('name').notNullable();
    table.boolean('is_default').notNullable().defaultTo(false);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at');
  });

  await knex.schema.withSchema(schema).createTable('domains', (table) => {
    table.uuid('node_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('graph_id').notNullable().references('id').inTable(`${schema}.graphs`).onDelete('CASCADE');
    table.string('external_id').notNullable();
    table.string('name').notNullable();
    table.text('description');
    table.string('parent_external_id');
    table.integer('position').notNullable().defaultTo(0);
    table.jsonb('payload').notNullable().defaultTo('{}');
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['graph_id', 'external_id']);
  });

  await knex.schema.withSchema(schema).createTable('modules', (table) => {
    table.uuid('node_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('graph_id').notNullable().references('id').inTable(`${schema}.graphs`).onDelete('CASCADE');
    table.string('external_id').notNullable();
    table.integer('position').notNullable().defaultTo(0);
    table.jsonb('payload').notNullable().defaultTo('{}');
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['graph_id', 'external_id']);
  });

  await knex.schema.withSchema(schema).createTable('artifacts', (table) => {
    table.uuid('node_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('graph_id').notNullable().references('id').inTable(`${schema}.graphs`).onDelete('CASCADE');
    table.string('external_id').notNullable();
    table.integer('position').notNullable().defaultTo(0);
    table.jsonb('payload').notNullable().defaultTo('{}');
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['graph_id', 'external_id']);
  });

  await knex.schema.withSchema(schema).createTable('relations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('graph_id').notNullable().references('id').inTable(`${schema}.graphs`).onDelete('CASCADE');
    table.uuid('source_node_id').notNullable();
    table.uuid('target_node_id').notNullable();
    table.string('relation_type').notNullable().defaultTo('linked');
    table.jsonb('metadata').notNullable().defaultTo('{}');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.withSchema(schema).createTable('layouts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('graph_id').notNullable().references('id').inTable(`${schema}.graphs`).onDelete('CASCADE');
    table.string('external_id').notNullable();
    table.uuid('node_id').notNullable();
    table.jsonb('position').notNullable();
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['graph_id', 'external_id']);
  });

  await knex.schema.withSchema(schema).createTable('snapshots', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('graph_id').notNullable().references('id').inTable(`${schema}.graphs`).onDelete('CASCADE');
    table.jsonb('payload').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = async function down(knex) {
  await knex.schema.withSchema(schema).dropTableIfExists('snapshots');
  await knex.schema.withSchema(schema).dropTableIfExists('layouts');
  await knex.schema.withSchema(schema).dropTableIfExists('relations');
  await knex.schema.withSchema(schema).dropTableIfExists('artifacts');
  await knex.schema.withSchema(schema).dropTableIfExists('modules');
  await knex.schema.withSchema(schema).dropTableIfExists('domains');
  await knex.schema.withSchema(schema).dropTableIfExists('graphs');
};
