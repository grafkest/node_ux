const schema = process.env.DB_SCHEMA ?? 'initiatives';

exports.up = async function up(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  await knex.raw(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);

  await knex.schema.withSchema(schema).createTable('initiatives', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('title').notNullable();
    table.text('description');
    table.string('status').notNullable().defaultTo('draft');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.withSchema(schema).createTable('milestones', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('initiative_id')
      .notNullable()
      .references('id')
      .inTable(`${schema}.initiatives`)
      .onDelete('CASCADE');
    table.string('title').notNullable();
    table.date('due_date');
    table.string('status').notNullable().defaultTo('planned');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.withSchema(schema).createTable('links_to_graph', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('initiative_id')
      .notNullable()
      .references('id')
      .inTable(`${schema}.initiatives`)
      .onDelete('CASCADE');
    table.string('graph_id').notNullable();
    table.uuid('node_id').notNullable();
    table.string('node_type').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['initiative_id', 'graph_id', 'node_id']);
  });

  await knex.schema.withSchema(schema).createTable('risks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('initiative_id')
      .notNullable()
      .references('id')
      .inTable(`${schema}.initiatives`)
      .onDelete('CASCADE');
    table.string('graph_id').notNullable();
    table.uuid('node_id');
    table.string('risk_type').notNullable().defaultTo('missing_node');
    table.string('severity').notNullable().defaultTo('medium');
    table.text('message').notNullable();
    table.boolean('resolved').notNullable().defaultTo(false);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['initiative_id', 'graph_id', 'node_id', 'risk_type']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.withSchema(schema).dropTableIfExists('risks');
  await knex.schema.withSchema(schema).dropTableIfExists('links_to_graph');
  await knex.schema.withSchema(schema).dropTableIfExists('milestones');
  await knex.schema.withSchema(schema).dropTableIfExists('initiatives');
};
