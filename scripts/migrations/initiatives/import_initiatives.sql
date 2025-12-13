-- Импорт инициатив и связей с модулями в схему initiatives
-- Запуск: psql -v import_dir=/backups -f scripts/migrations/initiatives/import_initiatives.sql
SET search_path TO initiatives;
\if :{?import_dir}
\else
  \set import_dir './backups'
\endif

BEGIN;
CREATE TEMP TABLE tmp_initiatives (
  id UUID,
  code TEXT,
  title TEXT,
  status TEXT,
  lead TEXT,
  start_date DATE,
  end_date DATE,
  budget NUMERIC,
  updated_at TIMESTAMPTZ
);
\copy tmp_initiatives FROM :'import_dir'/initiatives.csv WITH CSV HEADER;

INSERT INTO cards (id, code, title, status, lead, start_date, end_date, budget, updated_at)
SELECT id, code, title, status, lead, start_date, end_date, budget, updated_at
FROM tmp_initiatives
ON CONFLICT (id) DO UPDATE
SET code = EXCLUDED.code,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    lead = EXCLUDED.lead,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    budget = EXCLUDED.budget,
    updated_at = EXCLUDED.updated_at;
COMMIT;

BEGIN;
CREATE TEMP TABLE tmp_initiative_modules (
  initiative_id UUID,
  module_id UUID,
  relation_type TEXT,
  updated_at TIMESTAMPTZ
);
\copy tmp_initiative_modules FROM :'import_dir'/initiative_modules.csv WITH CSV HEADER;

INSERT INTO card_modules (initiative_id, module_id, relation_type, updated_at)
SELECT initiative_id, module_id, relation_type, updated_at
FROM tmp_initiative_modules
WHERE EXISTS (SELECT 1 FROM cards c WHERE c.id = initiative_id)
ON CONFLICT (initiative_id, module_id) DO UPDATE
SET relation_type = EXCLUDED.relation_type,
    updated_at = EXCLUDED.updated_at;
COMMIT;
