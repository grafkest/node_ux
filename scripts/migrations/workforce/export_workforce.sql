-- Экспорт сотрудников и назначений
-- Запуск: psql -v export_dir=/backups -f scripts/migrations/workforce/export_workforce.sql
\if :{?export_dir}
\else
  \set export_dir './backups'
\endif
\! mkdir -p :export_dir

\copy (
  SELECT id,
         email,
         full_name,
         role,
         grade,
         active,
         fte,
         skills,
         updated_at
  FROM monolith.employees
  ORDER BY id
) TO :'export_dir'/workforce_employees.csv WITH CSV HEADER;

\copy (
  SELECT id,
         employee_id,
         initiative_id,
         allocation,
         started_at,
         ended_at,
         updated_at
  FROM monolith.employee_assignments
  ORDER BY id
) TO :'export_dir'/workforce_assignments.csv WITH CSV HEADER;
