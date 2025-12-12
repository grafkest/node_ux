const bcrypt = require('bcryptjs');

const schema = process.env.DB_SCHEMA ?? 'auth';

const defaultPermissions = [
  { code: 'users:read', description: 'List users' },
  { code: 'users:write', description: 'Create or update users' },
  { code: 'users:delete', description: 'Delete users' },
  { code: 'tokens:issue', description: 'Issue authentication tokens' }
];

exports.up = async function up(knex) {
  await knex.raw(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);

  await knex.schema.withSchema(schema).createTable('roles', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable().unique();
    table.string('description');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.withSchema(schema).createTable('permissions', (table) => {
    table.increments('id').primary();
    table.string('code').notNullable().unique();
    table.string('description');
  });

  await knex.schema.withSchema(schema).createTable('role_permissions', (table) => {
    table.integer('role_id').unsigned().notNullable();
    table.integer('permission_id').unsigned().notNullable();
    table.primary(['role_id', 'permission_id']);
    table
      .foreign('role_id')
      .references('roles.id')
      .onUpdate('CASCADE')
      .onDelete('CASCADE');
    table
      .foreign('permission_id')
      .references('permissions.id')
      .onUpdate('CASCADE')
      .onDelete('CASCADE');
  });

  await knex.schema.withSchema(schema).createTable('users', (table) => {
    table.increments('id').primary();
    table.string('username').notNullable().unique();
    table.string('password_hash').notNullable();
    table.integer('role_id').unsigned().notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table
      .foreign('role_id')
      .references('roles.id')
      .onUpdate('CASCADE')
      .onDelete('RESTRICT');
  });

  await knex.schema.withSchema(schema).createTable('login_audit', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned();
    table.string('username').notNullable();
    table.boolean('success').notNullable();
    table.string('ip');
    table.string('user_agent');
    table.timestamp('occurred_at').defaultTo(knex.fn.now());
    table
      .foreign('user_id')
      .references('users.id')
      .onUpdate('CASCADE')
      .onDelete('SET NULL');
  });

  await knex.schema.withSchema(schema).createTable('refresh_tokens', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('token_hash').notNullable();
    table.timestamp('expires_at').notNullable();
    table.boolean('revoked').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.string('ip');
    table.string('user_agent');
    table
      .foreign('user_id')
      .references('users.id')
      .onUpdate('CASCADE')
      .onDelete('CASCADE');
  });

  const [adminRoleId, userRoleId] = await knex
    .withSchema(schema)('roles')
    .insert(
      [
        { name: 'admin', description: 'Полный доступ к управлению пользователями' },
        { name: 'user', description: 'Базовый доступ для чтения' }
      ],
      ['id']
    )
    .then((rows) => rows.map((row) => row.id ?? row));

  const permissionIds = await knex
    .withSchema(schema)('permissions')
    .insert(defaultPermissions, ['id', 'code'])
    .then((rows) => rows.map((row) => ({ id: row.id ?? row, code: row.code })));

  const permissionsByCode = Object.fromEntries(permissionIds.map((item) => [item.code, item.id]));

  await knex.withSchema(schema)('role_permissions').insert(
    [
      { role_id: adminRoleId, permission_id: permissionsByCode['users:read'] },
      { role_id: adminRoleId, permission_id: permissionsByCode['users:write'] },
      { role_id: adminRoleId, permission_id: permissionsByCode['users:delete'] },
      { role_id: adminRoleId, permission_id: permissionsByCode['tokens:issue'] },
      { role_id: userRoleId, permission_id: permissionsByCode['users:read'] }
    ].filter(Boolean)
  );

  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD ?? 'admin';
  const adminUsername = process.env.DEFAULT_ADMIN_USERNAME ?? 'admin';
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await knex.withSchema(schema)('users').insert({
    username: adminUsername,
    password_hash: passwordHash,
    role_id: adminRoleId
  });
};

exports.down = async function down(knex) {
  await knex.schema.withSchema(schema).dropTableIfExists('refresh_tokens');
  await knex.schema.withSchema(schema).dropTableIfExists('login_audit');
  await knex.schema.withSchema(schema).dropTableIfExists('users');
  await knex.schema.withSchema(schema).dropTableIfExists('role_permissions');
  await knex.schema.withSchema(schema).dropTableIfExists('permissions');
  await knex.schema.withSchema(schema).dropTableIfExists('roles');
};
