const schema = process.env.DB_SCHEMA ?? 'workforce';

exports.up = async function up(knex) {
  await knex.raw(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);

  await knex.schema.withSchema(schema).createTable('employees', (table) => {
    table.uuid('id').primary();
    table.string('full_name').notNullable();
    table.string('position').notNullable();
    table.string('email').unique();
    table.string('location');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.withSchema(schema).createTable('skills', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable().unique();
    table.string('category');
    table.text('description');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.withSchema(schema).createTable('employee_skills', (table) => {
    table
      .uuid('employee_id')
      .references('id')
      .inTable(`${schema}.employees`)
      .onDelete('CASCADE')
      .notNullable();
    table
      .integer('skill_id')
      .references('id')
      .inTable(`${schema}.skills`)
      .onDelete('CASCADE')
      .notNullable();
    table.string('proficiency');
    table.primary(['employee_id', 'skill_id']);
  });

  await knex.schema.withSchema(schema).createTable('assignments', (table) => {
    table.uuid('id').primary();
    table
      .uuid('employee_id')
      .references('id')
      .inTable(`${schema}.employees`)
      .onDelete('CASCADE')
      .notNullable();
    table.string('initiative_id').notNullable();
    table.string('role').notNullable();
    table.decimal('load', 5, 2).notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.withSchema(schema).createTable('availability', (table) => {
    table.uuid('id').primary();
    table
      .uuid('employee_id')
      .references('id')
      .inTable(`${schema}.employees`)
      .onDelete('CASCADE')
      .notNullable();
    table.date('date').notNullable();
    table.integer('available_hours').notNullable().defaultTo(0);
    table.string('note');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = async function down(knex) {
  await knex.schema.withSchema(schema).dropTableIfExists('availability');
  await knex.schema.withSchema(schema).dropTableIfExists('assignments');
  await knex.schema.withSchema(schema).dropTableIfExists('employee_skills');
  await knex.schema.withSchema(schema).dropTableIfExists('skills');
  await knex.schema.withSchema(schema).dropTableIfExists('employees');
};
