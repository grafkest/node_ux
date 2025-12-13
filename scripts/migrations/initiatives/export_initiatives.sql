-- Экспорт инициатив и связей с модулями
-- Запуск: psql -v export_dir=/backups -f scripts/migrations/initiatives/export_initiatives.sql
\if :{?export_dir}
\else
  \set export_dir './backups'
\endif
\! mkdir -p :export_dir

\copy (
  SELECT id,
         code,
         title,
         status,
         lead,
         start_date,
         end_date,
         budget,
         updated_at
  FROM monolith.initiatives
  ORDER BY id
) TO :'export_dir'/initiatives.csv WITH CSV HEADER;

\copy (
  SELECT initiative_id,
         module_id,
         relation_type,
         updated_at
  FROM monolith.initiative_modules
  ORDER BY initiative_id, module_id
) TO :'export_dir'/initiative_modules.csv WITH CSV HEADER;
