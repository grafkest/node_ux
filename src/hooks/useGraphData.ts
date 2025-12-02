import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  type GraphSummary,
  type GraphSnapshotPayload,
  type GraphSyncStatus,
  type GraphLayoutNodePosition,
  type GraphLayoutSnapshot,
  GRAPH_SNAPSHOT_VERSION
} from '../types/graph';
import {
  fetchGraphSummaries,
  fetchGraphSnapshot,
  persistGraphSnapshot
} from '../services/graphStorage';
import {
  type DomainNode,
  type ModuleNode,
  type ArtifactNode,
  type Initiative,
  type ExpertProfile
} from '../data';
import {
  domainTree as initialDomainTree,
  modules as initialModules,
  artifacts as initialArtifacts,
  initiatives as initialInitiatives,
  experts as initialExperts
} from '../data';
import { recalculateReuseScores, buildProductList } from '../utils/module';
import { flattenDomainTree } from '../utils/domain';
import {
  layoutsEqual,
  normalizeLayoutPositions,
  pruneLayoutPositions,
  needsEngineLayoutCapture
} from '../utils/layout';

export function useGraphData({
  onSnapshotLoaded
}: {
  onSnapshotLoaded?: (snapshot: GraphSnapshotPayload) => void;
} = {}) {
  const [graphs, setGraphs] = useState<GraphSummary[]>([]);
  const [activeGraphId, setActiveGraphId] = useState<string | null>(null);
  const [isGraphsLoading, setIsGraphsLoading] = useState(true);
  const [graphListError, setGraphListError] = useState<string | null>(null);

  const [domainData, setDomainData] = useState<DomainNode[]>(initialDomainTree);
  const [moduleData, setModuleDataState] = useState<ModuleNode[]>(() =>
    recalculateReuseScores(initialModules)
  );
  const [artifactData, setArtifactData] = useState<ArtifactNode[]>(initialArtifacts);
  const [initiativeData, setInitiativeData] = useState<Initiative[]>(initialInitiatives);
  const [expertProfiles, setExpertProfiles] = useState(initialExperts);

  // Additional state needed for layout and snapshot management
  const [isSnapshotLoading, setIsSnapshotLoading] = useState(true);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<GraphSyncStatus | null>(null);
  const [isSyncAvailable, setIsSyncAvailable] = useState(false);
  const [isReloadingSnapshot, setIsReloadingSnapshot] = useState(false);

  const [layoutPositions, setLayoutPositions] = useState<Record<string, GraphLayoutNodePosition>>({});
  const [layoutNormalizationRequest, setLayoutNormalizationRequest] = useState(0);

  // Refs
  const activeSnapshotControllerRef = useRef<AbortController | null>(null);
  const activeGraphIdRef = useRef<string | null>(null);
  const loadedGraphsRef = useRef(new Set<string>());
  const hasLoadedSnapshotRef = useRef(false);
  const skipNextSyncRef = useRef(false);
  const hasPendingPersistRef = useRef(false);
  const shouldCaptureEngineLayoutRef = useRef(true);

  const layoutSnapshot = useMemo<GraphLayoutSnapshot>(
    () => ({ nodes: layoutPositions }),
    [layoutPositions]
  );

  // Effects
  useEffect(() => {
    activeGraphIdRef.current = activeGraphId;
  }, [activeGraphId]);

  useEffect(() => {
    if (!isSyncAvailable || !hasLoadedSnapshotRef.current || !activeGraphId) {
      return;
    }

    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }

    if (!hasPendingPersistRef.current) {
      return;
    }

    hasPendingPersistRef.current = false;

    const { positions: constrainedLayout, changed: layoutAdjusted } = normalizeLayoutPositions(
      layoutPositions
    );

    if (layoutAdjusted) {
      setLayoutPositions(constrainedLayout);
      hasPendingPersistRef.current = true;
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    setSyncStatus((prev) => {
      if (prev?.state === 'error') {
        return { state: 'saving', message: 'Повторяем синхронизацию...' };
      }
      return { state: 'saving', message: 'Сохраняем изменения в хранилище...' };
    });

    const graphId = activeGraphId;
    const exportTimestamp = new Date().toISOString();

    persistGraphSnapshot(
      graphId,
      {
        version: GRAPH_SNAPSHOT_VERSION,
        exportedAt: exportTimestamp,
        modules: moduleData,
        domains: domainData,
        artifacts: artifactData,
        experts: expertProfiles,
        initiatives: initiativeData,
        layout: { nodes: constrainedLayout }
      },
      controller.signal
    )
      .then(() => {
        if (cancelled) {
          return;
        }
    setSyncStatus({
      state: 'idle',
      message: `Сохранено ${new Date().toLocaleTimeString()}`
    });
  })
  .catch((error) => {
        if (cancelled || controller.signal.aborted) {
          return;
        }
        console.error('Не удалось сохранить граф', error);
        hasPendingPersistRef.current = true;
        setSyncStatus({
          state: 'error',
          message:
            error instanceof Error ? error.message : 'Не удалось сохранить данные.'
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    artifactData,
    initiativeData,
    expertProfiles,
    domainData,
    moduleData,
    isSyncAvailable,
    layoutPositions,
    activeGraphId
  ]);

  // Actions
  const markGraphDirty = useCallback(() => {
    hasPendingPersistRef.current = true;
  }, []);

  const applySnapshot = useCallback(
    (snapshot: GraphSnapshotPayload) => {
      if (onSnapshotLoaded) {
        onSnapshotLoaded(snapshot);
      }
      const flattenedDomains = flattenDomainTree(snapshot.domains);
      const domainIds = flattenedDomains.map((domain) => domain.id);
      const activeNodeIds = new Set<string>([...domainIds]);
      snapshot.modules.forEach((module) => activeNodeIds.add(module.id));
      snapshot.artifacts.forEach((artifact) => activeNodeIds.add(artifact.id));
      (snapshot.initiatives ?? []).forEach((initiative) => activeNodeIds.add(initiative.id));

      setDomainData(snapshot.domains);
      setModuleDataState(recalculateReuseScores(snapshot.modules));
      setArtifactData(snapshot.artifacts);
      setInitiativeData(snapshot.initiatives ?? []);
      setExpertProfiles(snapshot.experts ?? initialExperts);

      let resolvedLayoutPositions: Record<string, GraphLayoutNodePosition> | null = null;
      let shouldRequestLayoutNormalization = false;

      setLayoutPositions((prev) => {
        const serverPositions = snapshot.layout?.nodes ?? {};
        const prunedServerPositions = pruneLayoutPositions(serverPositions, activeNodeIds);
        const hasExistingLayout = hasLoadedSnapshotRef.current && Object.keys(prev).length > 0;

        if (!hasExistingLayout) {
          if (layoutsEqual(prev, prunedServerPositions)) {
            resolvedLayoutPositions = prev;
            return prev;
          }
          const { positions: normalizedInitial, changed: initialAdjusted } = normalizeLayoutPositions(
            prunedServerPositions
          );
          if (initialAdjusted) {
            shouldRequestLayoutNormalization = true;
            resolvedLayoutPositions = normalizedInitial;
            return normalizedInitial;
          }
          resolvedLayoutPositions = prunedServerPositions;
          return prunedServerPositions;
        }

        const merged: Record<string, GraphLayoutNodePosition> = {};
        activeNodeIds.forEach((id) => {
          const previousPosition = prev[id];
          if (previousPosition) {
            merged[id] = previousPosition;
            return;
          }

          const serverPosition = prunedServerPositions[id];
          if (serverPosition) {
            merged[id] = serverPosition;
          }
        });

        let nextLayout = layoutsEqual(prev, merged) ? prev : merged;
        const layoutNodeCount = Object.keys(nextLayout).length;
        if (layoutNodeCount !== activeNodeIds.size) {
          shouldRequestLayoutNormalization = true;
        }

        const { positions: normalizedLayout, changed: layoutAdjusted } = normalizeLayoutPositions(
          nextLayout
        );

        if (layoutAdjusted) {
          shouldRequestLayoutNormalization = true;
          resolvedLayoutPositions = normalizedLayout;
          return normalizedLayout;
        }

        resolvedLayoutPositions = nextLayout;
        return nextLayout;
      });

      const nextLayoutPositions = resolvedLayoutPositions ?? {};
      const needsEngineCapture = needsEngineLayoutCapture(nextLayoutPositions, activeNodeIds);
      shouldCaptureEngineLayoutRef.current = needsEngineCapture;

      if (needsEngineCapture) {
        shouldRequestLayoutNormalization = true;
      }
      if (shouldRequestLayoutNormalization) {
        hasPendingPersistRef.current = true;
        setLayoutNormalizationRequest((prev) => prev + 1);
      }
      hasLoadedSnapshotRef.current = true;
      if (!shouldRequestLayoutNormalization) {
        hasPendingPersistRef.current = false;
      }
    },
    []
  );

  const loadSnapshot = useCallback(
    async (graphId: string, { withOverlay }: { withOverlay?: boolean } = {}) => {
      activeSnapshotControllerRef.current?.abort();

      const controller = new AbortController();
      activeSnapshotControllerRef.current = controller;

      if (withOverlay) {
        setIsSnapshotLoading(true);
      } else {
        setIsReloadingSnapshot(true);
      }

      try {
        const snapshot = await fetchGraphSnapshot(graphId, controller.signal);
        if (controller.signal.aborted || activeGraphIdRef.current !== graphId) {
          return;
        }
        applySnapshot(snapshot);
        loadedGraphsRef.current.add(graphId);
        skipNextSyncRef.current = true;
        setSnapshotError(null);
        setIsSyncAvailable(true);
        setSyncStatus({
          state: 'idle',
          message: 'Данные синхронизированы с сервером.'
        });
      } catch (error) {
        if (controller.signal.aborted || activeGraphIdRef.current !== graphId) {
          return;
        }

        console.error(`Не удалось загрузить граф ${graphId}`, error);
        const detail = error instanceof Error ? error.message : null;
        setSnapshotError(
          detail
            ? `Не удалось загрузить данные графа (${detail}). Используются локальные данные.`
            : 'Не удалось загрузить данные графа. Используются локальные данные.'
        );
        setIsSyncAvailable(false);
        const syncErrorMessage = detail
          ? `Нет связи с сервером (${detail}). Изменения не сохранятся.`
          : 'Нет связи с сервером. Изменения не сохранятся.';
        setSyncStatus({
          state: 'error',
          message: syncErrorMessage
        });
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
    [applySnapshot]
  );

  const updateActiveGraph = useCallback(
    (graphId: string | null, options: { loadSnapshot?: boolean } = {}) => {
      const { loadSnapshot: shouldLoadSnapshot = graphId !== null } = options;
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

      if (shouldLoadSnapshot) {
        setIsSnapshotLoading(true);
        void loadSnapshot(graphId, { withOverlay: true });
      } else {
        setIsSnapshotLoading(false);
      }
    },
    [loadSnapshot]
  );

  const refreshGraphs = useCallback(
    async (
      preferredGraphId?: string | null,
      options: { preserveSelection?: boolean } = {}
    ) => {
      const { preserveSelection = true } = options;
      setIsGraphsLoading(true);
      try {
        const list = await fetchGraphSummaries();
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
          if (
            preserveSelection &&
            currentActiveId &&
            list.some((graph) => graph.id === currentActiveId)
          ) {
            return currentActiveId;
          }
          const defaultGraph = list.find((graph) => graph.isDefault);
          return defaultGraph ? defaultGraph.id : list[0]?.id ?? null;
        })();

        const shouldLoad =
          nextActiveId &&
          (!currentActiveId || nextActiveId !== currentActiveId || !loadedGraphsRef.current.has(nextActiveId));

        if (nextActiveId) {
          updateActiveGraph(nextActiveId, { loadSnapshot: Boolean(shouldLoad) });
        } else {
          updateActiveGraph(null);
        }
      } catch (error) {
        console.error('Не удалось загрузить список графов', error);
        setGraphListError('Не удалось подключиться к серверу.');
        setIsSyncAvailable(false);
      } finally {
        setIsGraphsLoading(false);
      }
    },
    [updateActiveGraph]
  );

  return {
    graphs,
    setGraphs,
    activeGraphId,
    isGraphsLoading,
    graphListError,
    domainData,
    setDomainData,
    moduleData,
    setModuleDataState,
    artifactData,
    setArtifactData,
    initiativeData,
    setInitiativeData,
    expertProfiles,
    setExpertProfiles,
    isSnapshotLoading,
    snapshotError,
    syncStatus,
    setSyncStatus,
    isSyncAvailable,
    setIsSyncAvailable,
    isReloadingSnapshot,
    layoutPositions,
    setLayoutPositions,
    layoutNormalizationRequest,
    setLayoutNormalizationRequest,
    layoutSnapshot,

    // Actions
    loadSnapshot,
    updateActiveGraph,
    refreshGraphs,
    applySnapshot,
    markGraphDirty,

    // Refs (exposed if needed, but better to keep encapsulated or expose via functions)
    hasPendingPersistRef,
    skipNextSyncRef,
    shouldCaptureEngineLayoutRef,
    hasLoadedSnapshotRef
  };
}
