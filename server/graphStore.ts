import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ArtifactNode,
  DomainNode,
  ExpertProfile,
  InitiativeNode,
  ModuleNode
} from '../src/data';
import {
  artifacts as initialArtifacts,
  domainTree as initialDomainTree,
  experts as initialExperts,
  initiatives as initialInitiatives,
  modules as initialModules
} from '../src/data';
import {
  GRAPH_SNAPSHOT_VERSION,
  type GraphLayoutSnapshot,
  type GraphSnapshotPayload,
  type GraphSummary
} from '../src/types/graph';

type GraphStoreOptions = {
  databasePath?: string;
  seedWithInitialData?: boolean;
};

type GraphRow = {
  id: string;
  name: string;
  is_default: number;
  created_at: string;
  updated_at: string | null;
};

type DomainRow = {
  graph_id: string;
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  position: number;
};

type FlatDomainRow = {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  position: number;
};

type ModuleRow = {
  graph_id: string;
  id: string;
  data: string;
  position: number;
};

type ArtifactRow = {
  graph_id: string;
  id: string;
  data: string;
  position: number;
};

type InitiativeRow = {
  graph_id: string;
  id: string;
  data: string;
  position: number;
};

type ExpertRow = {
  graph_id: string;
  id: string;
  data: string;
  position: number;
};

const require = createRequire(import.meta.url);
const sqlJsWasmDirectory = path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm'));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultDataDirectory = path.resolve(__dirname, '..', 'data');
const defaultDatabasePath = path.join(defaultDataDirectory, 'graph.db');

let sqlModulePromise: Promise<typeof import('sql.js')> | null = null;
let db: SqlJsDatabase | null = null;
let activeDatabasePath: string | null = null;

const DEFAULT_GRAPH_ID = 'main';
const DEFAULT_GRAPH_NAME = 'Основной';

export async function initializeGraphStore(options?: GraphStoreOptions): Promise<void> {
  const SQL = await loadSqlModule();
  const databasePath = resolveDatabasePath(options?.databasePath);

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const initialData = fs.existsSync(databasePath) ? fs.readFileSync(databasePath) : null;

  disposeDatabase();

  try {
    db = initialData && initialData.length > 0 ? new SQL.Database(initialData) : new SQL.Database();
  } catch (error) {
    console.warn('Failed to load existing database, creating a new one.', error);
    db = new SQL.Database();
  }

  activeDatabasePath = databasePath;

  initializeSchema();
  migrateLegacySchema();
  ensureDefaultGraph();

  const shouldSeed = options?.seedWithInitialData ?? true;
  if (shouldSeed) {
    seedInitialData();
  }

  persistDatabase();
}

export function closeGraphStore(): void {
  disposeDatabase();
  activeDatabasePath = null;
}

export function listGraphs(): GraphSummary[] {
  return listGraphRows().map(mapGraphRowToSummary);
}

export function createGraph(options: {
  name: string;
  sourceGraphId?: string | null;
  includeDomains: boolean;
  includeModules: boolean;
  includeArtifacts: boolean;
  includeInitiatives: boolean;
}): GraphSummary {
  const database = assertDatabase();
  const now = new Date().toISOString();
  const sanitizedName = options.name.trim() || `Граф ${now.slice(0, 10)}`;
  const graphId = crypto.randomUUID();

  database.run('BEGIN TRANSACTION');

  try {
    database.run('INSERT INTO graphs (id, name, is_default, created_at, updated_at) VALUES (?, ?, 0, ?, NULL)', [graphId, sanitizedName, now]);

    if (options.sourceGraphId) {
      const sourceSnapshot = loadSnapshot(options.sourceGraphId);
      const snapshot: GraphSnapshotPayload = {
        version: sourceSnapshot.version ?? GRAPH_SNAPSHOT_VERSION,
        exportedAt: now,
        domains: options.includeDomains ? sourceSnapshot.domains : [],
        modules: options.includeModules ? sourceSnapshot.modules : [],
        artifacts: options.includeArtifacts ? sourceSnapshot.artifacts : [],
        experts: sourceSnapshot.experts ?? [],
        initiatives: options.includeInitiatives ? sourceSnapshot.initiatives : [],
        layout:
          options.includeModules && sourceSnapshot.layout
            ? normalizeLayout(sourceSnapshot.layout)
            : undefined
      };
      writeSnapshot(database, graphId, snapshot);
      updateGraphTimestamp(graphId, snapshot.exportedAt ?? now, database);
    } else {
      updateGraphTimestamp(graphId, now, database);
    }

    database.run('COMMIT');
    persistDatabase();
  } catch (error) {
    try {
      database.run('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    throw error;
  }

  return mapGraphRowToSummary(assertGraphRow(graphId));
}

export function deleteGraph(graphId: string): void {
  if (graphId === DEFAULT_GRAPH_ID) {
    throw new Error('Нельзя удалить основной граф.');
  }

  const database = assertDatabase();
  const graph = getGraphRow(graphId);

  if (!graph) {
    throw new Error(`Граф с идентификатором ${graphId} не найден.`);
  }

  database.run('BEGIN TRANSACTION');

  try {
    database.run('DELETE FROM graphs WHERE id = ?', [graphId]);
    database.run('COMMIT');
    persistDatabase();
  } catch (error) {
    try {
      database.run('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    throw error;
  }
}

export function loadSnapshot(graphId: string): GraphSnapshotPayload {
  const database = assertDatabase();
  assertGraphRow(graphId);

  const domainStatement = database.prepare(
    'SELECT graph_id, id, name, description, parent_id, position FROM domains WHERE graph_id = ? ORDER BY parent_id IS NOT NULL, parent_id, position'
  );
  const domainRows: DomainRow[] = [];

  try {
    domainStatement.bind([graphId]);
    while (domainStatement.step()) {
      const row = domainStatement.getAsObject() as DomainRow;
      domainRows.push({
        graph_id: String(row.graph_id),
        id: String(row.id),
        name: String(row.name),
        description: row.description ?? null,
        parent_id: row.parent_id ?? null,
        position: Number(row.position)
      });
    }
  } finally {
    domainStatement.free();
  }

  const moduleStatement = database.prepare(
    'SELECT graph_id, id, data, position FROM modules WHERE graph_id = ? ORDER BY position'
  );
  const moduleRows: ModuleRow[] = [];

  try {
    moduleStatement.bind([graphId]);
    while (moduleStatement.step()) {
      const row = moduleStatement.getAsObject() as ModuleRow;
      moduleRows.push({
        graph_id: String(row.graph_id),
        id: String(row.id),
        data: String(row.data),
        position: Number(row.position)
      });
    }
  } finally {
    moduleStatement.free();
  }

  const artifactStatement = database.prepare(
    'SELECT graph_id, id, data, position FROM artifacts WHERE graph_id = ? ORDER BY position'
  );
  const artifactRows: ArtifactRow[] = [];

  try {
    artifactStatement.bind([graphId]);
    while (artifactStatement.step()) {
      const row = artifactStatement.getAsObject() as ArtifactRow;
      artifactRows.push({
        graph_id: String(row.graph_id),
        id: String(row.id),
        data: String(row.data),
        position: Number(row.position)
      });
    }
  } finally {
    artifactStatement.free();
  }

  const initiativeStatement = database.prepare(
    'SELECT graph_id, id, data, position FROM initiative_rows WHERE graph_id = ? ORDER BY position'
  );
  const initiativeRows: InitiativeRow[] = [];

  try {
    initiativeStatement.bind([graphId]);
    while (initiativeStatement.step()) {
      const row = initiativeStatement.getAsObject() as InitiativeRow;
      initiativeRows.push({
        graph_id: String(row.graph_id),
        id: String(row.id),
        data: String(row.data),
        position: Number(row.position)
      });
    }
  } finally {
    initiativeStatement.free();
  }

  const expertStatement = database.prepare(
    'SELECT graph_id, id, data, position FROM experts WHERE graph_id = ? ORDER BY position'
  );
  const expertRows: ExpertRow[] = [];

  try {
    expertStatement.bind([graphId]);
    while (expertStatement.step()) {
      const row = expertStatement.getAsObject() as ExpertRow;
      expertRows.push({
        graph_id: String(row.graph_id),
        id: String(row.id),
        data: String(row.data),
        position: Number(row.position)
      });
    }
  } finally {
    expertStatement.free();
  }

  const version = readMetadata(graphId, 'snapshotVersion');
  const exportedAt = readMetadata(graphId, 'updatedAt');
  const layoutRaw = readMetadata(graphId, 'layout');
  const layout = layoutRaw ? safeParseLayout(layoutRaw) : undefined;
  const resolvedVersion = version ? Number.parseInt(version, 10) : GRAPH_SNAPSHOT_VERSION;
  const shouldSeedExperts = resolvedVersion < 3 && expertRows.length === 0;
  const experts = shouldSeedExperts
    ? initialExperts
    : expertRows
        .sort((a, b) => a.position - b.position)
        .map((row) => JSON.parse(row.data) as ExpertProfile);

  return {
    version: resolvedVersion,
    exportedAt: exportedAt ?? undefined,
    domains: buildDomainTree(domainRows),
    modules: moduleRows.map((row) => JSON.parse(row.data) as ModuleNode),
    artifacts: artifactRows.map((row) => JSON.parse(row.data) as ArtifactNode),
    experts,
    initiatives: initiativeRows.map((row) => JSON.parse(row.data) as InitiativeNode),
    layout
  };
}

export function persistSnapshot(graphId: string, snapshot: GraphSnapshotPayload): void {
  const database = assertDatabase();
  assertGraphRow(graphId);

  database.run('BEGIN TRANSACTION');

  try {
    writeSnapshot(database, graphId, snapshot);
    updateGraphTimestamp(graphId, snapshot.exportedAt ?? new Date().toISOString(), database);

    database.run('COMMIT');
    persistDatabase();
  } catch (error) {
    try {
      database.run('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    throw error;
  }
}

export function isGraphSnapshotPayload(value: unknown): value is GraphSnapshotPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<GraphSnapshotPayload>;
  if (
    !Array.isArray(candidate.domains) ||
    !Array.isArray(candidate.modules) ||
    !Array.isArray(candidate.artifacts) ||
    (candidate.initiatives !== undefined && !Array.isArray(candidate.initiatives)) ||
    (candidate.experts !== undefined && !Array.isArray(candidate.experts))
  ) {
    return false;
  }

  return true;
}

function loadSqlModule(): Promise<typeof import('sql.js')> {
  if (!sqlModulePromise) {
    sqlModulePromise = initSqlJs({
      locateFile: (file) => path.join(sqlJsWasmDirectory, file)
    });
  }
  return sqlModulePromise;
}

function resolveDatabasePath(explicitPath?: string): string {
  if (explicitPath) {
    return explicitPath;
  }

  return defaultDatabasePath;
}

function disposeDatabase(): void {
  if (db) {
    try {
      db.close();
    } catch {
      // ignore close errors
    }
    db = null;
  }
}

function initializeSchema(): void {
  const database = assertDatabase();
  database.run(`
    CREATE TABLE IF NOT EXISTS graphs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS graph_metadata (
      graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (graph_id, key)
    );

    CREATE TABLE IF NOT EXISTS domains (
      graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      parent_id TEXT,
      position INTEGER NOT NULL,
      PRIMARY KEY (graph_id, id),
      FOREIGN KEY (graph_id, parent_id) REFERENCES domains(graph_id, id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS modules (
      graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      position INTEGER NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (graph_id, id)
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      position INTEGER NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (graph_id, id)
    );

    CREATE TABLE IF NOT EXISTS initiative_rows (
      graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      position INTEGER NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (graph_id, id)
    );

    CREATE TABLE IF NOT EXISTS experts (
      graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      position INTEGER NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (graph_id, id)
    );
  `);
}

function migrateLegacySchema(): void {
  const database = assertDatabase();

  if (!hasColumn('domains', 'graph_id')) {
    database.run('ALTER TABLE domains RENAME TO legacy_domains');
    database.run(`
      CREATE TABLE domains (
        graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        parent_id TEXT,
        position INTEGER NOT NULL,
        PRIMARY KEY (graph_id, id),
        FOREIGN KEY (graph_id, parent_id) REFERENCES domains(graph_id, id) ON DELETE CASCADE
      );
    `);
    database.run(
      `INSERT INTO domains (graph_id, id, name, description, parent_id, position)
       SELECT ?, id, name, description, parent_id, position FROM legacy_domains`,
      [DEFAULT_GRAPH_ID]
    );
    database.run('DROP TABLE legacy_domains');
  }

  if (!hasColumn('modules', 'graph_id')) {
    database.run('ALTER TABLE modules RENAME TO legacy_modules');
    database.run(`
      CREATE TABLE modules (
        graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        position INTEGER NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (graph_id, id)
      );
    `);
    database.run(
      `INSERT INTO modules (graph_id, id, position, data)
       SELECT ?, id, position, data FROM legacy_modules`,
      [DEFAULT_GRAPH_ID]
    );
    database.run('DROP TABLE legacy_modules');
  }

  if (!hasColumn('artifacts', 'graph_id')) {
    database.run('ALTER TABLE artifacts RENAME TO legacy_artifacts');
    database.run(`
      CREATE TABLE artifacts (
        graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        position INTEGER NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (graph_id, id)
      );
    `);
    database.run(
      `INSERT INTO artifacts (graph_id, id, position, data)
       SELECT ?, id, position, data FROM legacy_artifacts`,
      [DEFAULT_GRAPH_ID]
    );
    database.run('DROP TABLE legacy_artifacts');
  }

  if (!hasTable('initiatives')) {
    database.run(`
      CREATE TABLE initiatives (
        graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        position INTEGER NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (graph_id, id)
      );
    `);
  }

  if (hasTable('metadata')) {
    database.run('ALTER TABLE metadata RENAME TO legacy_metadata');
    database.run(
      `INSERT INTO graph_metadata (graph_id, key, value)
       SELECT ?, key, value FROM legacy_metadata`,
      [DEFAULT_GRAPH_ID]
    );
    database.run('DROP TABLE legacy_metadata');
  }
}

function ensureDefaultGraph(): void {
  const database = assertDatabase();
  const existing = getGraphRow(DEFAULT_GRAPH_ID);
  const now = new Date().toISOString();

  if (!existing) {
    database.run(
      'INSERT INTO graphs (id, name, is_default, created_at, updated_at) VALUES (?, ?, 1, ?, ?)',
      [DEFAULT_GRAPH_ID, DEFAULT_GRAPH_NAME, now, now]
    );
  } else if (existing.is_default !== 1) {
    database.run('UPDATE graphs SET is_default = 1 WHERE id = ?', [DEFAULT_GRAPH_ID]);
  }
}

function seedInitialData(): boolean {
  const domainCount = countRows(DEFAULT_GRAPH_ID, 'domains');
  const moduleCount = countRows(DEFAULT_GRAPH_ID, 'modules');
  const artifactCount = countRows(DEFAULT_GRAPH_ID, 'artifacts');
  const initiativeCount = countRows(DEFAULT_GRAPH_ID, 'initiative_rows');
  const expertCount = countRows(DEFAULT_GRAPH_ID, 'experts');

  if (
    domainCount > 0 ||
    moduleCount > 0 ||
    artifactCount > 0 ||
    initiativeCount > 0 ||
    expertCount > 0
  ) {
    return false;
  }

  const snapshot: GraphSnapshotPayload = {
    version: GRAPH_SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    domains: initialDomainTree,
    modules: initialModules,
    artifacts: initialArtifacts,
    experts: initialExperts,
    initiatives: initialInitiatives
  };

  persistSnapshot(DEFAULT_GRAPH_ID, snapshot);
  return true;
}

function countRows(
  graphId: string,
  table: 'domains' | 'modules' | 'artifacts' | 'initiative_rows' | 'experts'
): number {
  const database = assertDatabase();
  const statement = database.prepare(`SELECT COUNT(*) as count FROM ${table} WHERE graph_id = ?`);

  try {
    statement.bind([graphId]);
    const hasRow = statement.step();
    if (!hasRow) {
      return 0;
    }

    const result = statement.getAsObject() as { count?: number };
    return typeof result.count === 'number' ? result.count : 0;
  } finally {
    statement.free();
  }
}

function flattenDomains(
  domains: DomainNode[],
  parentId: string | null = null
): FlatDomainRow[] {
  return domains.flatMap((domain, index) => {
    const row: FlatDomainRow = {
      id: domain.id,
      name: domain.name,
      description: domain.description ?? null,
      parent_id: parentId,
      position: index
    };

    const children = domain.children ? flattenDomains(domain.children, domain.id) : [];
    return [row, ...children];
  });
}

function buildDomainTree(rows: DomainRow[]): DomainNode[] {
  const childrenMap = new Map<string | null, Array<DomainNode & { position: number }>>();

  rows.forEach((row) => {
    const node: DomainNode & { position: number } = {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      position: row.position
    };

    if (!childrenMap.has(row.parent_id)) {
      childrenMap.set(row.parent_id, []);
    }

    childrenMap.get(row.parent_id)?.push(node);
  });

  const build = (parentId: string | null): DomainNode[] => {
    const nodes = childrenMap.get(parentId) ?? [];
    nodes.sort((a, b) => a.position - b.position);

    return nodes.map((node) => {
      const children = build(node.id);
      const domain: DomainNode = {
        id: node.id,
        name: node.name,
        description: node.description
      };

      if (children.length > 0) {
        domain.children = children;
      }

      return domain;
    });
  };

  return build(null);
}

function safeParseLayout(raw: string): GraphLayoutSnapshot | undefined {
  try {
    const parsed = JSON.parse(raw) as GraphLayoutSnapshot;
    return normalizeLayout(parsed);
  } catch {
    return undefined;
  }
}

function normalizeLayout(
  layout: GraphLayoutSnapshot | undefined | null
): GraphLayoutSnapshot | undefined {
  if (!layout || typeof layout !== 'object' || !layout.nodes) {
    return undefined;
  }

  const entries = Object.entries(layout.nodes).reduce<
    Array<[string, GraphLayoutSnapshot['nodes'][string]]>
  >((acc, [id, position]) => {
    if (!position || typeof position !== 'object') {
      return acc;
    }

    const x = Number((position as { x?: number }).x);
    const y = Number((position as { y?: number }).y);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return acc;
    }

    const next: GraphLayoutSnapshot['nodes'][string] = { x, y };
    const fx = (position as { fx?: number }).fx;
    const fy = (position as { fy?: number }).fy;

    if (Number.isFinite(fx)) {
      next.fx = Number(fx);
    }

    if (Number.isFinite(fy)) {
      next.fy = Number(fy);
    }

    acc.push([id, next]);
    return acc;
  }, []);

  if (entries.length === 0) {
    return undefined;
  }

  return { nodes: Object.fromEntries(entries) };
}

function readMetadata(graphId: string, key: string): string | null {
  const database = assertDatabase();
  const statement = database.prepare(
    'SELECT value FROM graph_metadata WHERE graph_id = ? AND key = ?'
  );

  try {
    statement.bind([graphId, key]);
    if (!statement.step()) {
      return null;
    }

    const result = statement.getAsObject() as { value?: string };
    return result.value ?? null;
  } finally {
    statement.free();
  }
}

function upsertMetadata(graphId: string, key: string, value: string, database: SqlJsDatabase): void {
  const statement = database.prepare(
    'INSERT INTO graph_metadata (graph_id, key, value) VALUES (?, ?, ?) ON CONFLICT(graph_id, key) DO UPDATE SET value = excluded.value'
  );

  try {
    statement.run([graphId, key, value]);
  } finally {
    statement.free();
  }
}

function deleteMetadata(graphId: string, key: string, database: SqlJsDatabase): void {
  const statement = database.prepare(
    'DELETE FROM graph_metadata WHERE graph_id = ? AND key = ?'
  );

  try {
    statement.run([graphId, key]);
  } finally {
    statement.free();
  }
}

function updateGraphTimestamp(graphId: string, timestamp: string, database: SqlJsDatabase): void {
  database.run('UPDATE graphs SET updated_at = ? WHERE id = ?', [timestamp, graphId]);
  upsertMetadata(graphId, 'updatedAt', timestamp, database);
}

function writeSnapshot(database: SqlJsDatabase, graphId: string, snapshot: GraphSnapshotPayload): void {
  database.run('DELETE FROM domains WHERE graph_id = ?', [graphId]);
  database.run('DELETE FROM modules WHERE graph_id = ?', [graphId]);
  database.run('DELETE FROM artifacts WHERE graph_id = ?', [graphId]);
  database.run('DELETE FROM initiative_rows WHERE graph_id = ?', [graphId]);
  database.run('DELETE FROM experts WHERE graph_id = ?', [graphId]);

  const domainRows = flattenDomains(snapshot.domains);
  const insertDomain = database.prepare(
    'INSERT INTO domains (graph_id, id, name, description, parent_id, position) VALUES (?, ?, ?, ?, ?, ?)'
  );

  try {
    domainRows.forEach((row) => {
      insertDomain.run([
        graphId,
        row.id,
        row.name,
        row.description ?? null,
        row.parent_id,
        row.position
      ]);
    });
  } finally {
    insertDomain.free();
  }

  const insertModule = database.prepare(
    'INSERT INTO modules (graph_id, id, position, data) VALUES (?, ?, ?, ?)'
  );

  try {
    snapshot.modules.forEach((module, index) => {
      insertModule.run([graphId, module.id, index, JSON.stringify(module)]);
    });
  } finally {
    insertModule.free();
  }

  const insertArtifact = database.prepare(
    'INSERT INTO artifacts (graph_id, id, position, data) VALUES (?, ?, ?, ?)'
  );

  try {
    snapshot.artifacts.forEach((artifact, index) => {
      insertArtifact.run([graphId, artifact.id, index, JSON.stringify(artifact)]);
    });
  } finally {
    insertArtifact.free();
  }

  const insertInitiative = database.prepare(
    'INSERT INTO initiative_rows (graph_id, id, position, data) VALUES (?, ?, ?, ?)'
  );

  try {
    (snapshot.initiatives ?? []).forEach((initiative, index) => {
      insertInitiative.run([graphId, initiative.id, index, JSON.stringify(initiative)]);
    });
  } finally {
    insertInitiative.free();
  }

  const insertExpert = database.prepare(
    'INSERT INTO experts (graph_id, id, position, data) VALUES (?, ?, ?, ?)'
  );

  try {
    (snapshot.experts ?? []).forEach((expert, index) => {
      insertExpert.run([graphId, expert.id, index, JSON.stringify(expert)]);
    });
  } finally {
    insertExpert.free();
  }

  upsertMetadata(graphId, 'snapshotVersion', String(snapshot.version ?? GRAPH_SNAPSHOT_VERSION), database);

  if (snapshot.layout) {
    const normalizedLayout = normalizeLayout(snapshot.layout);
    if (normalizedLayout) {
      upsertMetadata(graphId, 'layout', JSON.stringify(normalizedLayout), database);
    } else {
      deleteMetadata(graphId, 'layout', database);
    }
  } else {
    deleteMetadata(graphId, 'layout', database);
  }
}

function persistDatabase(): void {
  if (!activeDatabasePath) {
    return;
  }

  const database = assertDatabase();
  const exported = database.export();
  fs.writeFileSync(activeDatabasePath, exported);
}

function assertDatabase(): SqlJsDatabase {
  if (!db) {
    throw new Error('Database has not been initialized');
  }

  return db;
}

function hasColumn(table: string, column: string): boolean {
  const database = assertDatabase();
  const statement = database.prepare(`PRAGMA table_info(${table})`);

  try {
    while (statement.step()) {
      const row = statement.getAsObject() as { name?: string };
      if (row.name === column) {
        return true;
      }
    }
  } finally {
    statement.free();
  }

  return false;
}

function hasTable(table: string): boolean {
  const database = assertDatabase();
  const statement = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
  );

  try {
    statement.bind([table]);
    return statement.step();
  } finally {
    statement.free();
  }
}

function listGraphRows(): GraphRow[] {
  const database = assertDatabase();
  const statement = database.prepare(
    'SELECT id, name, is_default, created_at, updated_at FROM graphs ORDER BY is_default DESC, created_at'
  );
  const rows: GraphRow[] = [];

  try {
    while (statement.step()) {
      const row = statement.getAsObject() as GraphRow;
      const isDefaultValue = Number(row.is_default);
      rows.push({
        id: String(row.id),
        name: String(row.name),
        is_default: Number.isFinite(isDefaultValue) ? isDefaultValue : 0,
        created_at: String(row.created_at),
        updated_at: row.updated_at ? String(row.updated_at) : null
      });
    }
  } finally {
    statement.free();
  }

  return rows;
}

function getGraphRow(graphId: string): GraphRow | null {
  const database = assertDatabase();
  const statement = database.prepare(
    'SELECT id, name, is_default, created_at, updated_at FROM graphs WHERE id = ?'
  );

  try {
    statement.bind([graphId]);
    if (!statement.step()) {
      return null;
    }

    const row = statement.getAsObject() as GraphRow;
    const isDefaultValue = Number(row.is_default);
    return {
      id: String(row.id),
      name: String(row.name),
      is_default: Number.isFinite(isDefaultValue) ? isDefaultValue : 0,
      created_at: String(row.created_at),
      updated_at: row.updated_at ? String(row.updated_at) : null
    };
  } finally {
    statement.free();
  }
}

function assertGraphRow(graphId: string): GraphRow {
  const graph = getGraphRow(graphId);
  if (!graph) {
    throw new Error(`Граф с идентификатором ${graphId} не найден.`);
  }
  return graph;
}

function mapGraphRowToSummary(row: GraphRow): GraphSummary {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined
  };
}

export type { GraphStoreOptions };
