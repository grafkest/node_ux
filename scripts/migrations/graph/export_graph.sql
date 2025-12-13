-- Экспорт узлов и связей графа из монолитной БД
-- Запуск: psql -v export_dir=/backups -f scripts/migrations/graph/export_graph.sql
\if :{?export_dir}
\else
  \set export_dir './backups'
\endif
\! mkdir -p :export_dir

\copy (
  SELECT id,
         name,
         domain,
         owner_team,
         layout_x,
         layout_y,
         updated_at
  FROM monolith.graph_nodes
  ORDER BY id
) TO :'export_dir'/graph_nodes.csv WITH CSV HEADER;

\copy (
  SELECT id,
         source_id,
         target_id,
         edge_type,
         weight,
         updated_at
  FROM monolith.graph_edges
  ORDER BY id
) TO :'export_dir'/graph_edges.csv WITH CSV HEADER;
