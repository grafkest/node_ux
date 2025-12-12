import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

function normalizeKey(value) {
  if (!value) return undefined;
  return value.replace(/\\n/g, '\n');
}

async function fetchJwksKey(jwksUrl) {
  const response = await fetch(jwksUrl);
  if (!response.ok) {
    throw new Error(`Failed to load JWKS: ${response.status}`);
  }
  const { keys } = await response.json();
  const [firstKey] = keys ?? [];
  if (!firstKey || !firstKey.n || !firstKey.e) {
    throw new Error('JWKS missing RSA components');
  }

  const jwk = {
    kty: 'RSA',
    n: firstKey.n,
    e: firstKey.e
  };

  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}

export function createAuthMiddleware(options = {}) {
  const {
    audience = process.env.JWT_AUDIENCE ?? 'node-ux',
    issuer = process.env.JWT_ISSUER ?? 'auth-service',
    publicKey: providedPublicKey = process.env.JWT_PUBLIC_KEY,
    jwksUrl = process.env.AUTH_JWKS_URL ?? 'http://localhost:4004/.well-known/jwks.json'
  } = options;

  let cachedKey = normalizeKey(providedPublicKey);
  let jwksPromise;

  async function getVerificationKey() {
    if (cachedKey) {
      return cachedKey;
    }
    if (!jwksPromise) {
      jwksPromise = fetchJwksKey(jwksUrl)
        .then((keyObject) => keyObject.export({ format: 'pem', type: 'spki' }).toString())
        .then((key) => {
          cachedKey = key;
          return cachedKey;
        });
    }
    return jwksPromise;
  }

  async function authenticate(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ message: 'Требуется авторизация' });
      return;
    }

    const token = header.slice('Bearer '.length);

    try {
      const key = await getVerificationKey();
      const payload = jwt.verify(token, key, { algorithms: ['RS256'], audience, issuer });
      req.user = payload;
      next();
    } catch {
      res.status(401).json({ message: 'Недействительный токен' });
    }
  }

  function requirePermissions(permissions = []) {
    const required = Array.isArray(permissions) ? permissions : [permissions];

    return (req, res, next) => {
      const granted = req.user?.permissions ?? [];
      const hasAll = required.every((permission) => granted.includes(permission));

      if (!hasAll) {
        res.status(403).json({ message: 'Недостаточно прав' });
        return;
      }

      next();
    };
  }

  return {
    protect: () => authenticate,
    requirePermissions
  };
}
