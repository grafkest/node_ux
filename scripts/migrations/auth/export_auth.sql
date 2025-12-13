-- Экспорт пользователей и ролей для сервиса Auth
-- Запуск: psql -v export_dir=/backups -f scripts/migrations/auth/export_auth.sql
\if :{?export_dir}
\else
  \set export_dir './backups'
\endif
\! mkdir -p :export_dir

\copy (
  SELECT id,
         email,
         password_hash,
         salt,
         is_active,
         mfa_secret,
         created_at,
         updated_at
  FROM monolith.users
  ORDER BY id
) TO :'export_dir'/auth_users.csv WITH CSV HEADER;

\copy (
  SELECT user_id,
         role,
         granted_at
  FROM monolith.user_roles
  ORDER BY user_id, role
) TO :'export_dir'/auth_roles.csv WITH CSV HEADER;
