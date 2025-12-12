import crypto from 'node:crypto';

let cachedKeys;

function loadKeys() {
  if (cachedKeys) {
    return cachedKeys;
  }

  const envPrivate = process.env.JWT_PRIVATE_KEY;
  const envPublic = process.env.JWT_PUBLIC_KEY;

  if (envPrivate && envPublic) {
    cachedKeys = {
      privateKey: envPrivate.replace(/\\n/g, '\n'),
      publicKey: envPublic.replace(/\\n/g, '\n')
    };
    return cachedKeys;
  }

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048
  });

  cachedKeys = {
    privateKey: privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
    publicKey: publicKey.export({ type: 'pkcs1', format: 'pem' }).toString()
  };

  return cachedKeys;
}

export function getPrivateKey() {
  return loadKeys().privateKey;
}

export function getPublicKey() {
  return loadKeys().publicKey;
}

export function getJwks() {
  const publicKey = crypto.createPublicKey(getPublicKey());
  const jwk = publicKey.export({ format: 'jwk' });
  const kid = crypto.createHash('sha256').update(JSON.stringify(jwk)).digest('hex');

  return {
    keys: [
      {
        ...jwk,
        alg: 'RS256',
        use: 'sig',
        kid
      }
    ]
  };
}
