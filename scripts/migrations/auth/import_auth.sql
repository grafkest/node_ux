-- Импорт пользователей и ролей в схему auth
-- Запуск: psql -v import_dir=/backups -f scripts/migrations/auth/import_auth.sql
SET search_path TO auth;
\if :{?import_dir}
\else
  \set import_dir './backups'
\endif

BEGIN;
CREATE TEMP TABLE tmp_auth_users (
  id UUID,
  email TEXT,
  password_hash TEXT,
  salt TEXT,
  is_active BOOLEAN,
  mfa_secret TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
\copy tmp_auth_users FROM :'import_dir'/auth_users.csv WITH CSV HEADER;

INSERT INTO users (id, email, password_hash, salt, is_active, mfa_secret, created_at, updated_at)
SELECT id, email, password_hash, salt, is_active, mfa_secret, created_at, updated_at
FROM tmp_auth_users
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    password_hash = EXCLUDED.password_hash,
    salt = EXCLUDED.salt,
    is_active = EXCLUDED.is_active,
    mfa_secret = EXCLUDED.mfa_secret,
    created_at = EXCLUDED.created_at,
    updated_at = EXCLUDED.updated_at;
COMMIT;

BEGIN;
CREATE TEMP TABLE tmp_auth_roles (
  user_id UUID,
  role TEXT,
  granted_at TIMESTAMPTZ
);
\copy tmp_auth_roles FROM :'import_dir'/auth_roles.csv WITH CSV HEADER;

INSERT INTO user_roles (user_id, role, granted_at)
SELECT user_id, role, granted_at
FROM tmp_auth_roles r
WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = r.user_id)
ON CONFLICT (user_id, role) DO UPDATE
SET granted_at = EXCLUDED.granted_at;
COMMIT;
