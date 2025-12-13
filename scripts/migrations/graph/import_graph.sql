-- Импорт узлов и связей графа в целевую схему graph
-- Запуск: psql -v import_dir=/backups -f scripts/migrations/graph/import_graph.sql
SET search_path TO graph;
\if :{?import_dir}
\else
  \set import_dir './backups'
\endif

BEGIN;
CREATE TEMP TABLE tmp_graph_nodes (
  id UUID,
  name TEXT,
  domain TEXT,
  owner_team TEXT,
  layout_x NUMERIC,
  layout_y NUMERIC,
  updated_at TIMESTAMPTZ
);
\copy tmp_graph_nodes FROM :'import_dir'/graph_nodes.csv WITH CSV HEADER;

INSERT INTO nodes (id, name, domain, owner_team, layout_x, layout_y, updated_at)
SELECT id, name, domain, owner_team, layout_x, layout_y, updated_at
FROM tmp_graph_nodes
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    domain = EXCLUDED.domain,
    owner_team = EXCLUDED.owner_team,
    layout_x = EXCLUDED.layout_x,
    layout_y = EXCLUDED.layout_y,
    updated_at = EXCLUDED.updated_at;
COMMIT;

BEGIN;
CREATE TEMP TABLE tmp_graph_edges (
  id UUID,
  source_id UUID,
  target_id UUID,
  edge_type TEXT,
  weight NUMERIC,
  updated_at TIMESTAMPTZ
);
\copy tmp_graph_edges FROM :'import_dir'/graph_edges.csv WITH CSV HEADER;

INSERT INTO edges (id, source_id, target_id, edge_type, weight, updated_at)
SELECT id, source_id, target_id, edge_type, weight, updated_at
FROM tmp_graph_edges e
WHERE EXISTS (SELECT 1 FROM nodes n WHERE n.id = e.source_id)
  AND EXISTS (SELECT 1 FROM nodes n WHERE n.id = e.target_id)
ON CONFLICT (id) DO UPDATE
SET source_id = EXCLUDED.source_id,
    target_id = EXCLUDED.target_id,
    edge_type = EXCLUDED.edge_type,
    weight = EXCLUDED.weight,
    updated_at = EXCLUDED.updated_at;
COMMIT;
