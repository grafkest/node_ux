import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { getPrivateKey, getPublicKey } from './keys.js';

const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL ?? '15m';
const REFRESH_TOKEN_TTL_SECONDS = Number.parseInt(process.env.REFRESH_TOKEN_TTL ?? `${60 * 60 * 24 * 7}`, 10);
const issuer = process.env.JWT_ISSUER ?? 'auth-service';
const audience = process.env.JWT_AUDIENCE ?? 'node-ux';

export function signAccessToken(payload) {
  return jwt.sign(payload, getPrivateKey(), {
    algorithm: 'RS256',
    expiresIn: ACCESS_TOKEN_TTL,
    issuer,
    audience
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, getPublicKey(), {
    algorithms: ['RS256'],
    issuer,
    audience
  });
}

export function buildTokenPayload(user) {
  return {
    sub: user.id,
    username: user.username,
    role: user.role,
    permissions: user.permissions
  };
}

export function createRefreshToken() {
  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

  return { token, expiresAt };
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
