import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PropsWithChildren
} from 'react';
import {
  GRAPH_SNAPSHOT_VERSION,
  type GraphDataScope,
  type GraphLayoutNodePosition,
  type GraphSummary,
  type GraphSnapshotPayload,
  type GraphSyncStatus
} from '../types/graph';
import {
  artifacts as initialArtifacts,
  domainTree as initialDomainTree,
  experts as initialExperts,
  initiatives as initialInitiatives,
  modules as initialModules
} from '../data';

export const LOCAL_GRAPH_ID = 'local-graph';
export const LOCAL_GRAPH_NAME = 'Локальные данные';
export const LOCAL_GRAPH_SUMMARY: GraphSummary = {
  id: LOCAL_GRAPH_ID,
  name: LOCAL_GRAPH_NAME,
  isDefault: true,
  createdAt: '1970-01-01T00:00:00.000Z'
};

export const STORAGE_KEY_ACTIVE_GRAPH_ID = 'nedra-active-graph-id';

export const buildDefaultGraphCopyOptions = () =>
  new Set<GraphDataScope>(['domains', 'modules', 'artifacts', 'experts', 'initiatives']);

export function buildLocalSnapshot(): GraphSnapshotPayload {
  return {
    version: GRAPH_SNAPSHOT_VERSION,
    exportedAt: undefined,
    domains: initialDomainTree,
    modules: initialModules,
    artifacts: initialArtifacts,
    experts: initialExperts,
    initiatives: initialInitiatives,
    layout: undefined
  };
}

type GraphContextValue = {
  graphs: GraphSummary[];
  setGraphs: (graphs: GraphSummary[] | ((prev: GraphSummary[]) => GraphSummary[])) => void;
  graphsRef: MutableRefObject<GraphSummary[]>;
  activeGraphId: string | null;
  setActiveGraphId: (id: string | null) => void;
  activeGraphIdRef: MutableRefObject<string | null>;
  isGraphsLoading: boolean;
  setIsGraphsLoading: (value: boolean) => void;
  graphListError: string | null;
  setGraphListError: (value: string | null) => void;
  isSnapshotLoading: boolean;
  setIsSnapshotLoading: (value: boolean) => void;
  snapshotError: string | null;
  setSnapshotError: (value: string | null) => void;
  syncStatus: GraphSyncStatus | null;
  setSyncStatus: (value: GraphSyncStatus | null) => void;
  isSyncAvailable: boolean;
  setIsSyncAvailable: (value: boolean) => void;
  isReloadingSnapshot: boolean;
  setIsReloadingSnapshot: (value: boolean) => void;
  hasLoadedSnapshotRef: MutableRefObject<boolean>;
  skipNextSyncRef: MutableRefObject<boolean>;
  hasPendingPersistRef: MutableRefObject<boolean>;
  activeSnapshotControllerRef: MutableRefObject<AbortController | null>;
  failedGraphLoadsRef: MutableRefObject<Set<string>>;
  updateActiveGraphRef: MutableRefObject<
    ((graphId: string | null, options?: { loadSnapshot?: boolean }) => void) | undefined
  >;
  loadSnapshotRef: MutableRefObject<
    ((
      graphId: string,
      options?: { withOverlay?: boolean; fallbackGraphId?: string | null }
    ) => Promise<void>) |
      undefined
  >;
  loadedGraphsRef: MutableRefObject<Set<string>>;
  shouldCaptureEngineLayoutRef: MutableRefObject<boolean>;
  layoutPositions: Record<string, GraphLayoutNodePosition>;
  setLayoutPositions: (
    updater:
      | Record<string, GraphLayoutNodePosition>
      | ((prev: Record<string, GraphLayoutNodePosition>) => Record<string, GraphLayoutNodePosition>)
  ) => void;
  layoutNormalizationRequest: number;
  setLayoutNormalizationRequest: (updater: (prev: number) => number) => void;
  graphRenderEpoch: number;
  setGraphRenderEpoch: (updater: (prev: number) => number) => void;
  graphNameDraft: string;
  setGraphNameDraft: (value: string) => void;
  graphSourceIdDraft: string | null;
  setGraphSourceIdDraft: (value: string | null) => void;
  graphCopyOptions: Set<GraphDataScope>;
  setGraphCopyOptions: (
    value: Set<GraphDataScope> | ((prev: Set<GraphDataScope>) => Set<GraphDataScope>)
  ) => void;
  isGraphActionInProgress: boolean;
  setIsGraphActionInProgress: (value: boolean) => void;
  graphActionStatus: { type: 'success' | 'error'; message: string } | null;
  setGraphActionStatus: (
    value: { type: 'success' | 'error'; message: string } | null
  ) => void;
  isCreatePanelOpen: boolean;
  setIsCreatePanelOpen: (value: boolean) => void;
};

const GraphContext = createContext<GraphContextValue | null>(null);

export function GraphProvider({ children }: PropsWithChildren) {
  const [graphs, setGraphs] = useState<GraphSummary[]>([LOCAL_GRAPH_SUMMARY]);
  const graphsRef = useRef<GraphSummary[]>([LOCAL_GRAPH_SUMMARY]);
  const [activeGraphId, setActiveGraphId] = useState<string | null>(LOCAL_GRAPH_ID);
  const activeGraphIdRef = useRef<string | null>(LOCAL_GRAPH_ID);
  const [isGraphsLoading, setIsGraphsLoading] = useState(true);
  const [graphListError, setGraphListError] = useState<string | null>(null);
  const [isSnapshotLoading, setIsSnapshotLoading] = useState(true);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<GraphSyncStatus | null>(null);
  const [isSyncAvailable, setIsSyncAvailable] = useState(false);
  const [isReloadingSnapshot, setIsReloadingSnapshot] = useState(false);
  const hasLoadedSnapshotRef = useRef(false);
  const skipNextSyncRef = useRef(false);
  const hasPendingPersistRef = useRef(false);
  const activeSnapshotControllerRef = useRef<AbortController | null>(null);
  const failedGraphLoadsRef = useRef(new Set<string>());
  const updateActiveGraphRef = useRef<
    ((graphId: string | null, options?: { loadSnapshot?: boolean }) => void) | undefined
  >();
  const loadSnapshotRef = useRef<
    ((
      graphId: string,
      options?: { withOverlay?: boolean; fallbackGraphId?: string | null }
    ) => Promise<void>) |
      undefined
  >();
  const loadedGraphsRef = useRef(new Set<string>([LOCAL_GRAPH_ID]));
  const shouldCaptureEngineLayoutRef = useRef(true);
  const [layoutPositions, setLayoutPositions] = useState<Record<string, GraphLayoutNodePosition>>({});
  const [layoutNormalizationRequest, setLayoutNormalizationRequest] = useState(0);
  const [graphRenderEpoch, setGraphRenderEpoch] = useState(0);
  const [graphNameDraft, setGraphNameDraft] = useState('');
  const [graphSourceIdDraft, setGraphSourceIdDraft] = useState<string | null>(null);
  const [graphCopyOptions, setGraphCopyOptions] = useState<Set<GraphDataScope>>(
    buildDefaultGraphCopyOptions
  );
  const [isGraphActionInProgress, setIsGraphActionInProgress] = useState(false);
  const [graphActionStatus, setGraphActionStatus] = useState<
    { type: 'success' | 'error'; message: string } | null
  >(null);
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);

  useEffect(() => {
    graphsRef.current = graphs;
  }, [graphs]);

  useEffect(() => {
    activeGraphIdRef.current = activeGraphId;
    if (typeof window !== 'undefined') {
      if (activeGraphId) {
        localStorage.setItem(STORAGE_KEY_ACTIVE_GRAPH_ID, activeGraphId);
      } else {
        localStorage.removeItem(STORAGE_KEY_ACTIVE_GRAPH_ID);
      }
    }
  }, [activeGraphId]);

  const value: GraphContextValue = {
    graphs,
    setGraphs,
    graphsRef,
    activeGraphId,
    setActiveGraphId,
    activeGraphIdRef,
    isGraphsLoading,
    setIsGraphsLoading,
    graphListError,
    setGraphListError,
    isSnapshotLoading,
    setIsSnapshotLoading,
    snapshotError,
    setSnapshotError,
    syncStatus,
    setSyncStatus,
    isSyncAvailable,
    setIsSyncAvailable,
    isReloadingSnapshot,
    setIsReloadingSnapshot,
    hasLoadedSnapshotRef,
    skipNextSyncRef,
    hasPendingPersistRef,
    activeSnapshotControllerRef,
    failedGraphLoadsRef,
    updateActiveGraphRef,
    loadSnapshotRef,
    loadedGraphsRef,
    shouldCaptureEngineLayoutRef,
    layoutPositions,
    setLayoutPositions,
    layoutNormalizationRequest,
    setLayoutNormalizationRequest,
    graphRenderEpoch,
    setGraphRenderEpoch,
    graphNameDraft,
    setGraphNameDraft,
    graphSourceIdDraft,
    setGraphSourceIdDraft,
    graphCopyOptions,
    setGraphCopyOptions,
    isGraphActionInProgress,
    setIsGraphActionInProgress,
    graphActionStatus,
    setGraphActionStatus,
    isCreatePanelOpen,
    setIsCreatePanelOpen
  };

  return <GraphContext.Provider value={value}>{children}</GraphContext.Provider>;
}

export function useGraph() {
  const context = useContext(GraphContext);
  if (!context) {
    throw new Error('useGraph must be used within a GraphProvider');
  }

  return context;
}
