-- Импорт сотрудников и назначений в схему workforce
-- Запуск: psql -v import_dir=/backups -f scripts/migrations/workforce/import_workforce.sql
SET search_path TO workforce;
\if :{?import_dir}
\else
  \set import_dir './backups'
\endif

BEGIN;
CREATE TEMP TABLE tmp_employees (
  id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT,
  grade TEXT,
  active BOOLEAN,
  fte NUMERIC,
  skills JSONB,
  updated_at TIMESTAMPTZ
);
\copy tmp_employees FROM :'import_dir'/workforce_employees.csv WITH CSV HEADER;

INSERT INTO employees (id, email, full_name, role, grade, active, fte, skills, updated_at)
SELECT id, email, full_name, role, grade, active, fte, skills, updated_at
FROM tmp_employees
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    grade = EXCLUDED.grade,
    active = EXCLUDED.active,
    fte = EXCLUDED.fte,
    skills = EXCLUDED.skills,
    updated_at = EXCLUDED.updated_at;
COMMIT;

BEGIN;
CREATE TEMP TABLE tmp_assignments (
  id UUID,
  employee_id UUID,
  initiative_id UUID,
  allocation NUMERIC,
  started_at DATE,
  ended_at DATE,
  updated_at TIMESTAMPTZ
);
\copy tmp_assignments FROM :'import_dir'/workforce_assignments.csv WITH CSV HEADER;

INSERT INTO assignments (id, employee_id, initiative_id, allocation, started_at, ended_at, updated_at)
SELECT id, employee_id, initiative_id, allocation, started_at, ended_at, updated_at
FROM tmp_assignments ta
WHERE EXISTS (SELECT 1 FROM employees e WHERE e.id = ta.employee_id)
ON CONFLICT (id) DO UPDATE
SET employee_id = EXCLUDED.employee_id,
    initiative_id = EXCLUDED.initiative_id,
    allocation = EXCLUDED.allocation,
    started_at = EXCLUDED.started_at,
    ended_at = EXCLUDED.ended_at,
    updated_at = EXCLUDED.updated_at;
COMMIT;
