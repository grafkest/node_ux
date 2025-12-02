import type {
  ArtifactNode,
  DomainNode,
  ExpertProfile,
  Initiative,
  ModuleNode
} from '../data';

export const GRAPH_SNAPSHOT_VERSION = 3;

export type GraphLayoutNodePosition = {
  x: number;
  y: number;
  fx?: number;
  fy?: number;
};

export type GraphLayoutSnapshot = {
  nodes: Record<string, GraphLayoutNodePosition>;
};

export type GraphDataScope = 'domains' | 'modules' | 'artifacts' | 'experts' | 'initiatives';

export type GraphSnapshotPayload = {
  version: number;
  exportedAt?: string;
  modules: ModuleNode[];
  domains: DomainNode[];
  artifacts: ArtifactNode[];
  experts?: ExpertProfile[];
  initiatives?: Initiative[];
  layout?: GraphLayoutSnapshot;
  /**
   * Ограничивает, какие сущности нужно заменить при загрузке снапшота.
   * Если не указано, считается что снимок содержит все сущности.
   */
  scopesIncluded?: GraphDataScope[];
};

export type GraphSyncStatus =
  | { state: 'idle'; message?: string }
  | { state: 'saving'; message?: string }
  | { state: 'error'; message: string };

export type GraphSummary = {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt?: string;
};

export type GraphCopyRequest = {
  graphId: string;
  includeDomains: boolean;
  includeModules: boolean;
  includeArtifacts: boolean;
  includeExperts: boolean;
  includeInitiatives: boolean;
};
