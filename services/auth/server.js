import bcrypt from 'bcryptjs';
import express from 'express';
import process from 'node:process';
import { createAuthMiddleware } from '../common/authMiddleware.js';
import { createKnexClient } from '../common/knexClient.js';
import { getJwks, getPublicKey } from './keys.js';
import { buildTokenPayload, createRefreshToken, hashToken, signAccessToken } from './tokenService.js';

const port = Number.parseInt(process.env.PORT ?? '4004', 10);
const knexClient = createKnexClient('auth');
const authMiddleware = createAuthMiddleware({ publicKey: getPublicKey() });

const app = express();
app.use(express.json());

app.get('/health', async (_req, res) => {
  try {
    await knexClient.raw('select 1');
    res.json({ status: 'ok', service: 'auth' });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      service: 'auth',
      message: error instanceof Error ? error.message : 'Health check failed'
    });
  }
});

app.get('/.well-known/jwks.json', (_req, res) => {
  res.json(getJwks());
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    res.status(400).json({ message: 'Укажите имя пользователя и пароль' });
    return;
  }

  const user = await loadUserByUsername(username);

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    await logLoginAttempt(user?.id, username, false, req.ip, req.headers['user-agent']);
    res.status(401).json({ message: 'Неверные учетные данные' });
    return;
  }

  await logLoginAttempt(user.id, username, true, req.ip, req.headers['user-agent']);

  const { token: refreshToken, expiresAt } = createRefreshToken();
  const tokenPayload = buildTokenPayload(user);
  const accessToken = signAccessToken(tokenPayload);

  await knexClient.withSchema(process.env.DB_SCHEMA ?? 'auth')('refresh_tokens').insert({
    user_id: user.id,
    token_hash: hashToken(refreshToken),
    expires_at: expiresAt,
    ip: req.ip,
    user_agent: req.headers['user-agent']
  });

  res.json({
    accessToken,
    refreshToken,
    expiresIn: getAccessTtlSeconds(),
    refreshExpiresAt: expiresAt,
    user: sanitizeUser(user)
  });
});

app.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body ?? {};

  if (!refreshToken) {
    res.status(400).json({ message: 'Требуется refreshToken' });
    return;
  }

  const refreshTable = knexClient.withSchema(process.env.DB_SCHEMA ?? 'auth')('refresh_tokens');
  const existing = await refreshTable
    .where({ token_hash: hashToken(refreshToken), revoked: false })
    .andWhere('expires_at', '>', knexClient.fn.now())
    .first();

  if (!existing) {
    res.status(401).json({ message: 'Недействительный refresh токен' });
    return;
  }

  const user = await loadUserById(existing.user_id);
  if (!user) {
    res.status(401).json({ message: 'Пользователь не найден' });
    return;
  }

  const { token: newRefreshToken, expiresAt } = createRefreshToken();
  const tokenPayload = buildTokenPayload(user);
  const accessToken = signAccessToken(tokenPayload);

  await knexClient.transaction(async (trx) => {
    await refreshTable.transacting(trx).where({ id: existing.id }).update({ revoked: true });
    await refreshTable.transacting(trx).insert({
      user_id: user.id,
      token_hash: hashToken(newRefreshToken),
      expires_at: expiresAt,
      ip: req.ip,
      user_agent: req.headers['user-agent']
    });
  });

  res.json({
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: getAccessTtlSeconds(),
    refreshExpiresAt: expiresAt,
    user: sanitizeUser(user)
  });
});

app.get('/users', authMiddleware.protect(), authMiddleware.requirePermissions(['users:read']), async (_req, res) => {
  const users = await listUsers();
  res.json(users.map(sanitizeUser));
});

app.post('/users', authMiddleware.protect(), authMiddleware.requirePermissions(['users:write']), async (req, res) => {
  const { username, password, role } = req.body ?? {};

  if (!username || !password || !role) {
    res.status(400).json({ message: 'Необходимо указать имя пользователя, пароль и роль' });
    return;
  }

  try {
    const created = await createUser({ username, password, role });
    res.status(201).json(sanitizeUser(created));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Не удалось создать пользователя' });
  }
});

app.patch('/users/:id', authMiddleware.protect(), authMiddleware.requirePermissions(['users:write']), async (req, res) => {
  const { id } = req.params;
  const { password, role } = req.body ?? {};

  try {
    const updated = await updateUser({ id, password, role });
    res.json(sanitizeUser(updated));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Не удалось обновить пользователя' });
  }
});

app.delete(
  '/users/:id',
  authMiddleware.protect(),
  authMiddleware.requirePermissions(['users:delete']),
  async (req, res) => {
    const { id } = req.params;

    try {
      await deleteUser(id);
      res.status(204).end();
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Не удалось удалить пользователя' });
    }
  }
);

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Auth service listening on port ${port}`);
});

const shutdown = () => {
  console.log('Shutting down auth service');
  void knexClient.destroy().finally(() => {
    server.close(() => {
      process.exit(0);
    });
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function loadUserByUsername(username) {
  const schema = process.env.DB_SCHEMA ?? 'auth';
  const row = await knexClient
    .withSchema(schema)('users as u')
    .leftJoin('roles as r', 'r.id', 'u.role_id')
    .select('u.id', 'u.username', 'u.password_hash as passwordHash', 'u.role_id as roleId', 'r.name as role')
    .where('u.username', username)
    .first();

  if (!row) return null;

  const permissions = await knexClient
    .withSchema(schema)('role_permissions as rp')
    .leftJoin('permissions as p', 'p.id', 'rp.permission_id')
    .where('rp.role_id', row.roleId)
    .pluck('p.code');

  return { ...row, permissions };
}

async function loadUserById(id) {
  const schema = process.env.DB_SCHEMA ?? 'auth';
  const row = await knexClient
    .withSchema(schema)('users as u')
    .leftJoin('roles as r', 'r.id', 'u.role_id')
    .select('u.id', 'u.username', 'u.password_hash as passwordHash', 'u.role_id as roleId', 'r.name as role')
    .where('u.id', id)
    .first();

  if (!row) return null;

  const permissions = await knexClient
    .withSchema(schema)('role_permissions as rp')
    .leftJoin('permissions as p', 'p.id', 'rp.permission_id')
    .where('rp.role_id', row.roleId)
    .pluck('p.code');

  return { ...row, permissions };
}

async function logLoginAttempt(userId, username, success, ip, userAgent) {
  const schema = process.env.DB_SCHEMA ?? 'auth';
  await knexClient.withSchema(schema)('login_audit').insert({
    user_id: userId ?? null,
    username,
    success,
    ip,
    user_agent: userAgent
  });
}

async function listUsers() {
  const schema = process.env.DB_SCHEMA ?? 'auth';
  const rows = await knexClient
    .withSchema(schema)('users as u')
    .leftJoin('roles as r', 'r.id', 'u.role_id')
    .select(
      'u.id',
      'u.username',
      'u.password_hash as passwordHash',
      'u.role_id as roleId',
      'r.name as role',
      'u.created_at as createdAt',
      'u.updated_at as updatedAt'
    )
    .orderBy('u.created_at', 'asc');

  const rolePermissions = await knexClient
    .withSchema(schema)('role_permissions as rp')
    .leftJoin('permissions as p', 'p.id', 'rp.permission_id')
    .select('rp.role_id as roleId', 'p.code as code');

  const permissionsByRole = rolePermissions.reduce((acc, row) => {
    acc[row.roleId] = acc[row.roleId] ?? [];
    acc[row.roleId].push(row.code);
    return acc;
  }, {});

  return rows.map((row) => ({ ...row, permissions: permissionsByRole[row.roleId] ?? [] }));
}

async function createUser({ username, password, role }) {
  const schema = process.env.DB_SCHEMA ?? 'auth';
  const roleRow = await knexClient.withSchema(schema)('roles').where({ name: role }).first();
  if (!roleRow) {
    throw new Error('Указанная роль не найдена');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const inserted = await knexClient
    .withSchema(schema)('users')
    .insert(
      { username, password_hash: passwordHash, role_id: roleRow.id },
      ['id', 'username', 'password_hash as passwordHash', 'role_id as roleId']
    )
    .then((rows) => rows[0]);

  const permissions = await knexClient
    .withSchema(schema)('role_permissions as rp')
    .leftJoin('permissions as p', 'p.id', 'rp.permission_id')
    .where('rp.role_id', roleRow.id)
    .pluck('p.code');

  return {
    id: inserted.id,
    username: inserted.username,
    passwordHash: inserted.passwordHash,
    roleId: inserted.roleId ?? roleRow.id,
    role: roleRow.name,
    permissions
  };
}

async function updateUser({ id, password, role }) {
  const schema = process.env.DB_SCHEMA ?? 'auth';
  const existing = await knexClient.withSchema(schema)('users').where({ id }).first();
  if (!existing) {
    throw new Error('Пользователь не найден');
  }

  const updates = { updated_at: knexClient.fn.now() };

  if (password) {
    updates.password_hash = await bcrypt.hash(password, 10);
  }

  if (role) {
    const roleRow = await knexClient.withSchema(schema)('roles').where({ name: role }).first();
    if (!roleRow) {
      throw new Error('Роль не найдена');
    }
    updates.role_id = roleRow.id;
  }

  await knexClient.withSchema(schema)('users').where({ id }).update(updates);

  return loadUserById(id);
}

async function deleteUser(id) {
  const schema = process.env.DB_SCHEMA ?? 'auth';
  await knexClient.withSchema(schema)('refresh_tokens').where({ user_id: id }).del();
  const deleted = await knexClient.withSchema(schema)('users').where({ id }).del();
  if (!deleted) {
    throw new Error('Пользователь не найден');
  }
}

function sanitizeUser(user) {
  const { passwordHash: _passwordHash, roleId, ...rest } = user;
  return rest;
}

function getAccessTtlSeconds() {
  const ttl = process.env.ACCESS_TOKEN_TTL ?? '15m';
  const match = /^([0-9]+)([smhd])?$/.exec(ttl);
  if (!match) return 900;
  const value = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    case 'm':
      return value * 60;
    default:
      return value;
  }
}
