import {
  createContext,
  useCallback,
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
import type {
  ArtifactNode,
  DomainNode,
  ExpertProfile,
  Initiative,
  ModuleNode
} from '../data';
import type { ModuleStatus } from '../types/module';
import { flattenDomainTree } from '../utils/domain';
import { recalculateReuseScores } from '../utils/module';
import {
  fetchGraphSnapshot,
  fetchGraphSummaries,
  persistGraphSnapshot as persistGraphSnapshotRequest
} from '../services/graphStorage';

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
  domainData: DomainNode[];
  setDomainData: (domains: DomainNode[] | ((prev: DomainNode[]) => DomainNode[])) => void;
  moduleData: ModuleNode[];
  setModuleData: (modules: ModuleNode[] | ((prev: ModuleNode[]) => ModuleNode[])) => void;
  artifactData: ArtifactNode[];
  setArtifactData: (artifacts: ArtifactNode[] | ((prev: ArtifactNode[]) => ArtifactNode[])) => void;
  initiativeData: Initiative[];
  setInitiativeData: (initiatives: Initiative[] | ((prev: Initiative[]) => Initiative[])) => void;
  expertProfiles: ExpertProfile[];
  setExpertProfiles: (
    experts: ExpertProfile[] | ((prev: ExpertProfile[]) => ExpertProfile[])
  ) => void;
  selectedDomains: Set<string>;
  setSelectedDomains: (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  statusFilters: Set<ModuleStatus>;
  setStatusFilters: (updater: Set<ModuleStatus> | ((prev: Set<ModuleStatus>) => Set<ModuleStatus>)) => void;
  productFilter: string[];
  setProductFilter: (updater: string[] | ((prev: string[]) => string[])) => void;
  companyFilter: string | null;
  setCompanyFilter: (value: string | null) => void;
  showAllConnections: boolean;
  setShowAllConnections: (value: boolean) => void;
  search: string;
  setSearch: (value: string) => void;
  loadSnapshot: (
    graphId: string,
    options: {
      applySnapshot: (snapshot: GraphSnapshotPayload) => void;
      withOverlay?: boolean;
      fallbackGraphId?: string | null;
      onGraphUnavailable?: () => void;
    }
  ) => Promise<void>;
  updateActiveGraph: (
    graphId: string | null,
    options?: {
      loadSnapshot?: boolean;
      applySnapshot?: (snapshot: GraphSnapshotPayload) => void;
      onGraphUnavailable?: () => void;
    }
  ) => void;
  loadGraphsList: (
    preferredGraphId?: string | null,
    options?: {
      preserveSelection?: boolean;
      preferDefault?: boolean;
      applySnapshot?: (snapshot: GraphSnapshotPayload) => void;
      onGraphUnavailable?: () => void;
    }
  ) => Promise<void>;
  persistGraphSnapshot: (
    graphId: string,
    payload: GraphSnapshotPayload,
    options?: { signal?: AbortSignal }
  ) => Promise<void>;
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
    |
      ((
        graphId: string | null,
        options?: {
          loadSnapshot?: boolean;
          applySnapshot?: (snapshot: GraphSnapshotPayload) => void;
          onGraphUnavailable?: () => void;
        }
      ) => void)
    | undefined
  >();
  const loadSnapshotRef = useRef<
    |
      ((
        graphId: string,
        options: {
          applySnapshot: (snapshot: GraphSnapshotPayload) => void;
          withOverlay?: boolean;
          fallbackGraphId?: string | null;
          onGraphUnavailable?: () => void;
        }
      ) => Promise<void>)
    | undefined
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
  const [domainData, setDomainData] = useState<DomainNode[]>(initialDomainTree);
  const [moduleData, setModuleData] = useState<ModuleNode[]>(() =>
    recalculateReuseScores(initialModules)
  );
  const [artifactData, setArtifactData] = useState<ArtifactNode[]>(initialArtifacts);
  const [initiativeData, setInitiativeData] = useState<Initiative[]>(initialInitiatives);
  const [expertProfiles, setExpertProfiles] = useState<ExpertProfile[]>(initialExperts);
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(
    () => new Set(flattenDomainTree(initialDomainTree).map((domain) => domain.id))
  );
  const [statusFilters, setStatusFilters] = useState<Set<ModuleStatus>>(new Set());
  const [productFilter, setProductFilter] = useState<string[]>([]);
  const [companyFilter, setCompanyFilter] = useState<string | null>(null);
  const [showAllConnections, setShowAllConnections] = useState(false);
  const [search, setSearch] = useState('');

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

  const loadSnapshot = useCallback(
    async (
      graphId: string,
      {
        applySnapshot,
        withOverlay = false,
        fallbackGraphId = null,
        onGraphUnavailable
      }: {
        applySnapshot: (snapshot: GraphSnapshotPayload) => void;
        withOverlay?: boolean;
        fallbackGraphId?: string | null;
        onGraphUnavailable?: () => void;
      }
    ) => {
      if (activeSnapshotControllerRef.current) {
        activeSnapshotControllerRef.current.abort();
        activeSnapshotControllerRef.current = null;
      }

      const controller = new AbortController();
      activeSnapshotControllerRef.current = controller;

      if (withOverlay) {
        setIsSnapshotLoading(true);
      } else {
        setIsReloadingSnapshot(true);
      }

      try {
        if (graphId === LOCAL_GRAPH_ID) {
          applySnapshot(buildLocalSnapshot());
          hasLoadedSnapshotRef.current = true;
          setSnapshotError(null);
          setIsSyncAvailable(false);
          setSyncStatus({
            state: 'idle',
            message: 'Работаем с локальными данными. Изменения не сохраняются.'
          });
          return;
        }

        const snapshot = await fetchGraphSnapshot(graphId, controller.signal);
        if (controller.signal.aborted || activeGraphIdRef.current !== graphId) {
          return;
        }
        applySnapshot(snapshot);
        hasLoadedSnapshotRef.current = true;
        failedGraphLoadsRef.current.delete(graphId);
        loadedGraphsRef.current.add(graphId);
        skipNextSyncRef.current = true;
        setSnapshotError(null);
        setIsSyncAvailable(true);
        setSyncStatus({
          state: 'idle',
          message: 'Данные синхронизированы с сервером.'
        });
        if (withOverlay && activeGraphIdRef.current === graphId) {
          setIsSnapshotLoading(false);
        }
      } catch (error) {
        if (controller.signal.aborted || activeGraphIdRef.current !== graphId) {
          return;
        }

        console.error(`Не удалось загрузить граф ${graphId}`, error);
        const detail = error instanceof Error ? error.message : null;
        if (
          graphId !== LOCAL_GRAPH_ID &&
          activeGraphIdRef.current === graphId &&
          activeGraphIdRef.current !== null
        ) {
          onGraphUnavailable?.();
        }
        setSnapshotError(
          detail
            ? `Не удалось загрузить данные графа (${detail}). Выберите другой граф или попробуйте ещё раз.`
            : 'Не удалось загрузить данные графа. Выберите другой граф или попробуйте ещё раз.'
        );
        setIsSyncAvailable(false);
        const syncErrorMessage = detail
          ? `Нет связи с сервером (${detail}). Изменения не сохранятся.`
          : 'Нет связи с сервером. Изменения не сохранятся.';
        setSyncStatus({
          state: 'error',
          message: syncErrorMessage
        });

        failedGraphLoadsRef.current.add(graphId);

        if (fallbackGraphId !== undefined && updateActiveGraphRef.current) {
          const fallbackId =
            fallbackGraphId && graphs.some((graph) => graph.id === fallbackGraphId)
              ? fallbackGraphId
              : null;

          if (fallbackId) {
            if (failedGraphLoadsRef.current.has(fallbackId)) {
              console.warn(`Пропуск fallback на граф ${fallbackId}: уже в списке неудачных попыток`);
              updateActiveGraphRef.current(null, { loadSnapshot: false });
              return;
            }
            const shouldReloadFallback = !loadedGraphsRef.current.has(fallbackId);
            updateActiveGraphRef.current(fallbackId, { loadSnapshot: shouldReloadFallback });
          } else {
            updateActiveGraphRef.current(null, { loadSnapshot: false });
          }
        }
      } finally {
        const isCurrentRequest = activeSnapshotControllerRef.current === controller;

        if (isCurrentRequest) {
          activeSnapshotControllerRef.current = null;
        }

        if (withOverlay) {
          if (isCurrentRequest && activeGraphIdRef.current === graphId) {
            setIsSnapshotLoading(false);
          }
        } else if (isCurrentRequest && activeGraphIdRef.current === graphId) {
          setIsReloadingSnapshot(false);
        }
      }
    },
    [graphs]
  );

  loadSnapshotRef.current = loadSnapshot;

  const updateActiveGraph = useCallback(
    (
      graphId: string | null,
      { loadSnapshot: shouldLoadSnapshot = graphId !== null, applySnapshot, onGraphUnavailable }: {
        loadSnapshot?: boolean;
        applySnapshot?: (snapshot: GraphSnapshotPayload) => void;
        onGraphUnavailable?: () => void;
      } = {}
    ) => {
      const previousGraphId = activeGraphIdRef.current;

      if (graphId === null) {
        activeGraphIdRef.current = null;
        setActiveGraphId(null);
        activeSnapshotControllerRef.current?.abort();
        activeSnapshotControllerRef.current = null;
        hasLoadedSnapshotRef.current = false;
        hasPendingPersistRef.current = false;
        setIsSyncAvailable(false);
        setSyncStatus(null);
        setSnapshotError(null);
        setIsReloadingSnapshot(false);
        setIsSnapshotLoading(false);
        return;
      }

      const isValidTarget = graphsRef.current.some((graph) => graph.id === graphId);
      if (!isValidTarget) {
        if (graphId !== LOCAL_GRAPH_ID && activeGraphIdRef.current === graphId && graphId !== null) {
          onGraphUnavailable?.();
        }
        return;
      }

      if (graphId !== LOCAL_GRAPH_ID && shouldLoadSnapshot && failedGraphLoadsRef.current.has(graphId)) {
        console.warn(`Пропуск загрузки графа ${graphId}: уже в списке неудачных попыток`);
        setSnapshotError('Граф недоступен. Попробуйте выбрать другой граф или обновить список.');
        setIsSyncAvailable(false);
        setSyncStatus({
          state: 'error',
          message: 'Граф недоступен. Выберите другой граф или попробуйте ещё раз.'
        });
        setIsSnapshotLoading(false);
        return;
      }

      if (previousGraphId === graphId) {
        return;
      }

      activeGraphIdRef.current = graphId;
      setActiveGraphId(graphId);

      hasLoadedSnapshotRef.current = false;
      hasPendingPersistRef.current = false;
      setIsSyncAvailable(false);
      setSyncStatus(null);
      setSnapshotError(null);
      setIsReloadingSnapshot(false);

      if (shouldLoadSnapshot && applySnapshot) {
        setIsSnapshotLoading(true);
        void loadSnapshot(graphId, {
          withOverlay: true,
          fallbackGraphId: previousGraphId,
          applySnapshot,
          onGraphUnavailable
        });
      } else {
        setIsSnapshotLoading(false);
      }

      setGraphRenderEpoch((value) => value + 1);
    },
    [loadSnapshot]
  );

  updateActiveGraphRef.current = updateActiveGraph;

  const loadGraphsList = useCallback(
    async (
      preferredGraphId: string | null = null,
      {
        preserveSelection = true,
        preferDefault = false,
        applySnapshot,
        onGraphUnavailable
      }: {
        preserveSelection?: boolean;
        preferDefault?: boolean;
        applySnapshot?: (snapshot: GraphSnapshotPayload) => void;
        onGraphUnavailable?: () => void;
      } = {}
    ) => {
      setIsGraphsLoading(true);
      try {
        const list = await fetchGraphSummaries();
        graphsRef.current = list;
        setGraphs(list);
        setGraphListError(null);
        loadedGraphsRef.current = new Set(
          [...loadedGraphsRef.current].filter((id) => list.some((graph) => graph.id === id))
        );

        const currentActiveId = activeGraphIdRef.current;
        const nextActiveId = (() => {
          if (preferredGraphId && list.some((graph) => graph.id === preferredGraphId)) {
            return preferredGraphId;
          }
          if (preserveSelection && currentActiveId && list.some((graph) => graph.id === currentActiveId)) {
            return currentActiveId;
          }
          if (preferDefault) {
            const defaultGraph = list.find((graph) => graph.isDefault);
            if (defaultGraph) {
              return defaultGraph.id;
            }
          }
          if (!preserveSelection && !preferDefault && typeof window !== 'undefined') {
            const savedGraphId = localStorage.getItem(STORAGE_KEY_ACTIVE_GRAPH_ID);
            if (savedGraphId && list.some((graph) => graph.id === savedGraphId)) {
              return savedGraphId;
            }
          }
          const defaultGraph = list.find((graph) => graph.isDefault);
          if (defaultGraph) {
            return defaultGraph.id;
          }
          return list[0]?.id ?? null;
        })();

        if (nextActiveId && applySnapshot) {
          updateActiveGraph(nextActiveId, { applySnapshot });
        } else {
          updateActiveGraph(null, { loadSnapshot: false });
        }
      } catch (error) {
        console.error('Не удалось обновить список графов', error);
        const fallbackMessage = 'Не удалось загрузить список графов.';
        let message = fallbackMessage;

        if (error instanceof TypeError) {
          message =
            'Не удалось подключиться к серверу графа. Запустите "npm run server" или используйте "npm run dev:full".';
        } else if (error instanceof Error && error.message) {
          message = error.message;
        }

        setGraphListError(message);

        const currentActiveId = activeGraphIdRef.current;
        const shouldPreserveSelection = preferredGraphId !== null && preferredGraphId !== undefined;
        const shouldSwitchToLocal = !currentActiveId || (!shouldPreserveSelection && currentActiveId !== LOCAL_GRAPH_ID);

        if (shouldPreserveSelection && preferredGraphId && currentActiveId === preferredGraphId && !shouldSwitchToLocal) {
          setIsSyncAvailable(false);
          setSyncStatus({
            state: 'error',
            message: 'Нет связи с сервером. Изменения не сохранятся.'
          });
        } else {
          const fallbackGraphs = [LOCAL_GRAPH_SUMMARY];
          graphsRef.current = fallbackGraphs;
          setGraphs(fallbackGraphs);
          loadedGraphsRef.current = new Set([LOCAL_GRAPH_ID]);

          onGraphUnavailable?.();

          if (activeGraphIdRef.current !== LOCAL_GRAPH_ID) {
            updateActiveGraph(LOCAL_GRAPH_ID, { loadSnapshot: false });
          }

          if (applySnapshot) {
            applySnapshot(buildLocalSnapshot());
          }
          setIsSyncAvailable(false);
          setSyncStatus({
            state: 'error',
            message: 'Нет связи с сервером. Изменения не сохранятся.'
          });
        }
      } finally {
        setIsGraphsLoading(false);
      }
    },
    [updateActiveGraph]
  );

  const persistGraphSnapshot = useCallback(
    async (graphId: string, payload: GraphSnapshotPayload, { signal }: { signal?: AbortSignal } = {}) => {
      setSyncStatus((prev) => {
        if (prev?.state === 'error') {
          return { state: 'saving', message: 'Повторяем синхронизацию...' };
        }
        return { state: 'saving', message: 'Сохраняем изменения в хранилище...' };
      });

      try {
        await persistGraphSnapshotRequest(graphId, payload, signal);
        const exportTimestamp = payload.exportedAt ?? new Date().toISOString();
        setSyncStatus({
          state: 'idle',
          message: `Сохранено ${new Date().toLocaleTimeString()}`
        });
        setGraphs((prev) =>
          prev.map((graph) => (graph.id === graphId ? { ...graph, updatedAt: exportTimestamp } : graph))
        );
      } catch (error) {
        if (signal?.aborted) {
          return;
        }
        console.error('Не удалось сохранить граф', error);
        hasPendingPersistRef.current = true;
        setSyncStatus({
          state: 'error',
          message: error instanceof Error ? error.message : 'Не удалось сохранить данные.'
        });
      }
    },
    []
  );

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
    setIsCreatePanelOpen,
    domainData,
    setDomainData,
    moduleData,
    setModuleData,
    artifactData,
    setArtifactData,
    initiativeData,
    setInitiativeData,
    expertProfiles,
    setExpertProfiles,
    selectedDomains,
    setSelectedDomains,
    statusFilters,
    setStatusFilters,
    productFilter,
    setProductFilter,
    companyFilter,
    setCompanyFilter,
    showAllConnections,
    setShowAllConnections,
    search,
    setSearch,
    loadSnapshot,
    updateActiveGraph,
    loadGraphsList,
    persistGraphSnapshot
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
