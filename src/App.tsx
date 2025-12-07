import type { Variants } from 'framer-motion';
import { presetGpnDefault, presetGpnDark } from '@consta/uikit/Theme';

import { Button } from '@consta/uikit/Button';
import { Collapse } from '@consta/uikit/Collapse';
import { Loader } from '@consta/uikit/Loader';
import { Text } from '@consta/uikit/Text';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type {
  ArtifactDraftPayload,
  DomainDraftPayload,
  ExpertDraftPayload,
  ModuleDraftPayload,
  ModuleDraftPrefillRequest,
  UserDraftPayload
} from './features/admin/types';
import {
  type GraphDataScope,
  type GraphLayoutNodePosition,
  type GraphLayoutSnapshot,
  type GraphSnapshotPayload
} from './types/graph';
import {
  createGraph as createGraphRequest,
  deleteGraph as deleteGraphRequest,
  importGraphFromSource
} from './services/graphStorage';
import type { GraphNode } from './features/graph/components/GraphView';
import {
  modules as initialModules,
  reuseIndexHistory,
  type ArtifactNode,
  type DomainNode,
  type ExpertCompetencyRecord,
  type ExpertProfile,
  type ExpertSkill,
  type GraphLink,
  type Initiative,
  type InitiativeApprovalStage,
  type InitiativeRequirement,
  type InitiativeRolePlan,
  type InitiativeRoleWork,
  type InitiativeWork,
  type InitiativeWorkItem,
  type InitiativeWorkItemStatus,
  type ModuleMetrics,
  type ModuleNode,
  type ModuleStatus,
  type NonFunctionalRequirements
} from './data';
import styles from './App.module.css';
import type { InitiativeCreationRequest } from './types/initiativeCreation';
import { getSkillNameById } from './data/skills';
import {
  assignExpertsToWorkItems,
  buildCandidatesFromReport,
  buildRoleMatchReports,
  selectPinnedExperts,
  type RolePlanningDraft
} from './utils/initiativeMatching';
import { preparePlannerModuleSelections } from './utils/initiativePlanner';
import {
  addDomainToTree,
  buildDomainAncestors,
  buildDomainDescendants,
  collectAttachableDomainIds,
  collectCatalogDomainIds,
  collectDomainIds,
  filterDomainTreeByIds,
  flattenDomainTree,
  insertDomain,
  removeDomainFromTree
} from './utils/domain';
import { buildExpertFromDraft } from './utils/expert';
import type { TaskListItem } from './types/tasks';
import { LayoutShell, MENU_ITEMS } from './components/LayoutShell';
import { CreateGraphModal } from './components/CreateGraphModal';
import { useAuth } from './context/AuthContext';
import {
  GraphDataProvider,
  buildDefaultGraphCopyOptions,
  buildLocalSnapshot,
  useGraphData,
  LOCAL_GRAPH_ID,
  LOCAL_GRAPH_SUMMARY,
  STORAGE_KEY_ACTIVE_GRAPH_ID
} from './context/GraphDataContext';
import { FilterProvider, useFilters } from './context/FilterContext';
import { ThemeMode, UIProvider, useUI } from './context/UIContext';
import type { GraphContainerProps } from './features/graph/GraphContainer';
import type { ExpertsContainerProps } from './features/experts/ExpertsContainer';
import type { InitiativesContainerProps } from './features/initiatives/InitiativesContainer';
import type { EmployeeTasksContainerProps } from './features/employeeTasks/EmployeeTasksContainer';
import type { AdminContainerProps } from './features/admin/AdminContainer';
import { useAdminActions } from './features/admin/services/useAdminActions';
import { ThemeContainer } from './features/theme/ThemeContainer';
import { usePersistedEmployeeTasks } from './features/employeeTasks/hooks/usePersistedEmployeeTasks';
import { useExpertProfileUpdates } from './features/experts/hooks/useExpertProfileUpdates';
import { useInitiativeActions } from './features/initiatives/hooks/useInitiativeActions';
import { collectSearchableValues, createEntityId, deduplicateNonEmpty } from './utils/common';
import {
  buildCompanyList,
  buildModuleFromDraft,
  buildProductList,
  recalculateReuseScores
} from './utils/module';
import {
  buildInitiativeLinks,
  buildModuleLinks,
  getLinkEndpointId
} from './utils/links';
import {
  layoutsEqual,
  layoutPositionsEqual,
  mergeLayoutPositions,
  needsEngineLayoutCapture,
  normalizeLayoutPositions,
  pruneLayoutPositions,
  resolveInitialModulePosition
} from './utils/layout';

const allStatuses: ModuleStatus[] = ['production', 'in-dev', 'deprecated'];
const initialProducts = buildProductList(initialModules);

const viewTabs = [
  { label: 'Связи', value: 'graph' },
  { label: 'Статистика', value: 'stats' },
  { label: 'Экспертиза', value: 'experts' },
  { label: 'Инициативы', value: 'initiatives' },
  { label: 'Задачи моих сотрудников', value: 'employee-tasks' },
  { label: 'Администрирование', value: 'admin' }
] as const;

type ViewMode = (typeof viewTabs)[number]['value'];
type AdminNotice = {
  id: number;
  type: 'success' | 'error';
  message: string;
};

const VIEW_TO_PATH: Record<ViewMode, string> = {
  graph: '/graph',
  stats: '/stats',
  experts: '/experts',
  initiatives: '/initiatives',
  'employee-tasks': '/tasks',
  admin: '/admin'
};

const PATH_TO_VIEW: Record<string, ViewMode> = {
  '': 'graph',
  graph: 'graph',
  stats: 'stats',
  experts: 'experts',
  initiatives: 'initiatives',
  tasks: 'employee-tasks',
  admin: 'admin'
};

const getViewModeFromPath = (pathname: string): ViewMode => {
  const [_, maybeView] = pathname.split('/');
  return PATH_TO_VIEW[maybeView as keyof typeof PATH_TO_VIEW] ?? 'graph';
};

type StatsPageProps = {
  pageVariants: Variants;
  modules: ModuleNode[];
  domains: DomainNode[];
  artifacts: ArtifactNode[];
  reuseHistory: typeof reuseIndexHistory;
};

export type AppOutletContext = {
  graphPageProps: GraphContainerProps;
  statsPageProps: StatsPageProps;
  expertsPageProps: ExpertsContainerProps;
  initiativesPageProps: InitiativesContainerProps;
  employeeTasksPageProps: EmployeeTasksContainerProps;
  adminPageProps: AdminContainerProps;
};

const GRAPH_UNAVAILABLE_MESSAGE =
  'Выбранный граф недоступен. Обновите список графов и попробуйте снова.';

const isAnalyticsPanelEnabled =
  (import.meta.env.VITE_ENABLE_ANALYTICS_PANEL ?? 'true').toLowerCase() !== 'false';

function AppContent() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    graphs,
    activeGraphId,
    activeGraphIdRef,
    isGraphsLoading,
    graphListError,
    isSnapshotLoading,
    snapshotError,
    syncStatus,
    isSyncAvailable,
    isReloadingSnapshot,
    hasLoadedSnapshotRef,
    skipNextSyncRef,
    hasPendingPersistRef,
    activeSnapshotControllerRef,
    loadSnapshotRef,
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
    loadSnapshot,
    updateActiveGraph,
    loadGraphsList,
    persistGraphSnapshot
  } = useGraphData();
  const {
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
    selectedNode,
    setSelectedNode
  } = useFilters();
  const {
    themeMode,
    setThemeMode,
    sidebarRef,
    sidebarBaseHeight,
    sidebarMaxHeight,
    isDomainTreeOpen,
    setIsDomainTreeOpen,
    areFiltersOpen,
    setAreFiltersOpen,
    adminNotice,
    showAdminNotice,
    dismissAdminNotice,
    isCreatePanelOpen,
    setIsCreatePanelOpen
  } = useUI();
  const { employeeTasks, setEmployeeTasks } = usePersistedEmployeeTasks();
  const [statsActivated, setStatsActivated] = useState(false);
  const hasPrefetchedStats = useRef(false);
  const viewMode = useMemo(() => getViewModeFromPath(location.pathname), [location.pathname]);
  const navigateToView = useCallback(
    (view: ViewMode) => navigate(VIEW_TO_PATH[view] ?? VIEW_TO_PATH.graph),
    [navigate]
  );
  const highlightedDomainId = selectedNode?.type === 'domain' ? selectedNode.id : null;
  const moduleDraftPrefillIdRef = useRef(0);
  const [moduleDraftPrefill, setModuleDraftPrefill] = useState<ModuleDraftPrefillRequest | null>(null);
  const handleModuleDraftPrefillApplied = useCallback(() => {
    setModuleDraftPrefill(null);
  }, []);
  const layoutSnapshot = useMemo<GraphLayoutSnapshot>(
    () => ({ nodes: layoutPositions }),
    [layoutPositions]
  );

  const visibleMenuItems = useMemo(() => {
    if (!user) return [];
    return MENU_ITEMS.filter((item) => {
      if (item.id === 'admin' && user.role !== 'admin') {
        return false;
      }
      return true;
    });
  }, [user]);

  const handleSetThemeMode = useCallback((mode: ThemeMode) => {
    setThemeMode(mode);
  }, [setThemeMode]);


  const handleGraphSourceIdChange = useCallback(
    (value: string | null) => {
      setGraphSourceIdDraft(value);
      if (value === null) {
        setGraphCopyOptions(buildDefaultGraphCopyOptions());
      }
    },
    [setGraphCopyOptions, setGraphSourceIdDraft]
  );
  const { handleUpdateExpertSkills, handleUpdateExpertSoftSkills } = useExpertProfileUpdates();


  const { users, currentUser, onCreateUser, onUpdateUser, onDeleteUser } = useAdminActions(showAdminNotice);

  const products = useMemo(() => buildProductList(moduleData), [moduleData]);
  const companies = useMemo(() => buildCompanyList(moduleData), [moduleData]);

  useEffect(() => {
    if (statusFilters.size === 0) {
      setStatusFilters(new Set(allStatuses));
    }
  }, [setStatusFilters, statusFilters.size]);

  useEffect(() => {
    if (productFilter.length === 0 && products.length > 0) {
      setProductFilter(products);
    }
  }, [productFilter.length, products, setProductFilter]);

  useEffect(() => {
    if (companyFilter && !companies.includes(companyFilter)) {
      setCompanyFilter(null);
    }
  }, [companyFilter, companies]);

  const applySnapshot = useCallback((snapshot: GraphSnapshotPayload) => {
    const scopes = new Set<GraphDataScope>(
      snapshot.scopesIncluded ?? ['domains', 'modules', 'artifacts', 'experts', 'initiatives']
    );

    const currentDomains = domainData;
    const currentModules = moduleData;
    const currentArtifacts = artifactData;
    const currentExperts = expertProfiles;
    const currentInitiatives = initiativeData;

    const nextDomains = scopes.has('domains') ? snapshot.domains : currentDomains;
    const nextModules = scopes.has('modules') ? snapshot.modules : currentModules;
    const nextArtifacts = scopes.has('artifacts') ? snapshot.artifacts : currentArtifacts;
    const nextExperts = scopes.has('experts') ? snapshot.experts ?? [] : currentExperts;
    const nextInitiatives = scopes.has('initiatives') ? snapshot.initiatives ?? [] : currentInitiatives;

    const flattenedDomains = flattenDomainTree(nextDomains);
    const domainIds = flattenedDomains.map((domain) => domain.id);
    const activeNodeIds = new Set<string>([...domainIds]);
    nextModules.forEach((module) => activeNodeIds.add(module.id));
    nextArtifacts.forEach((artifact) => activeNodeIds.add(artifact.id));
    nextInitiatives.forEach((initiative) => activeNodeIds.add(initiative.id));

    setDomainData(nextDomains);
    setModuleData(nextModules);
    setArtifactData(nextArtifacts);
    setInitiativeData(nextInitiatives);
    setExpertProfiles(nextExperts);
    setSelectedNode(null);
    setSearch('');
    setStatusFilters(new Set(allStatuses));
    setProductFilter(buildProductList(nextModules));
    setCompanyFilter(null);
    setSelectedDomains(new Set(domainIds));
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

        resolvedLayoutPositions = normalizedInitial;
        shouldRequestLayoutNormalization = shouldRequestLayoutNormalization || initialAdjusted;
        return normalizedInitial;
      }

      const merged = { ...prev } as Record<string, GraphLayoutNodePosition>;
      Object.entries(prunedServerPositions).forEach(([id, serverPosition]) => {
        const layoutPosition = prev[id];
        if (layoutPosition) {
          merged[id] = { ...layoutPosition };
        }

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
    setGraphRenderEpoch((prev) => prev + 1);
    if (!shouldRequestLayoutNormalization) {
      hasPendingPersistRef.current = false;
    }
  }, [
    allStatuses,
    artifactData,
    domainData,
    expertProfiles,
    hasLoadedSnapshotRef,
    hasPendingPersistRef,
    initiativeData,
    moduleData,
    setArtifactData,
    setCompanyFilter,
    setDomainData,
    setExpertProfiles,
    setGraphRenderEpoch,
    setInitiativeData,
    setLayoutNormalizationRequest,
    setLayoutPositions,
    setModuleData,
    setProductFilter,
    setSearch,
    setSelectedDomains,
    setSelectedNode,
    setStatusFilters,
    shouldCaptureEngineLayoutRef
  ]);

  const handleGraphUnavailable = useCallback(() => {
    showAdminNotice('error', GRAPH_UNAVAILABLE_MESSAGE);
  }, [showAdminNotice]);

  useEffect(() => {
    void loadGraphsList(null, {
      preserveSelection: false,
      preferDefault: true,
      applySnapshot,
      onGraphUnavailable: handleGraphUnavailable
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (activeSnapshotControllerRef.current) {
        activeSnapshotControllerRef.current.abort();
        activeSnapshotControllerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const graphId = activeGraphIdRef.current;
    if (!graphId || !loadSnapshotRef.current) {
      return;
    }

    void loadSnapshotRef.current(graphId, {
      applySnapshot,
      withOverlay: false,
      onGraphUnavailable: handleGraphUnavailable
    });
    setGraphRenderEpoch((prev) => prev + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeMode]);

  const handleRetryLoadSnapshot = useCallback(() => {
    const graphId = activeGraphIdRef.current;
    if (!graphId) {
      return;
    }

    void loadSnapshot(graphId, {
      applySnapshot,
      withOverlay: false,
      onGraphUnavailable: handleGraphUnavailable
    });
  }, [applySnapshot, handleGraphUnavailable, loadSnapshot]);

  const markGraphDirty = useCallback(() => {
    hasPendingPersistRef.current = true;
  }, []);

  const {
    handleToggleInitiativePin,
    handleAddInitiativeRisk,
    handleRemoveInitiativeRisk,
    handleInitiativeStatusChange,
    handleInitiativeExport,
    handlePlannerCreateInitiative,
    handlePlannerUpdateInitiative
  } = useInitiativeActions({
    initiativeData,
    expertProfiles,
    moduleData,
    setInitiativeData,
    markGraphDirty,
    showAdminNotice,
    moduleDraftPrefillIdRef,
    setModuleDraftPrefill
  });

  useEffect(() => {
    setProductFilter((prev) => {
      const preserved = products.filter((product) => prev.includes(product));
      const missing = products.filter((product) => !prev.includes(product));
      const next = [...preserved, ...missing];
      if (next.length === prev.length && next.every((value, index) => value === prev[index])) {
        return prev;
      }
      return next;
    });
  }, [products]);

  const domainDescendants = useMemo(() => buildDomainDescendants(domainData), [domainData]);
  const domainAncestors = useMemo(() => buildDomainAncestors(domainData), [domainData]);

  const moduleDependents = useMemo(() => {
    const dependents = new Map<string, Set<string>>();

    moduleData.forEach((module) => {
      module.dependencies.forEach((dependencyId) => {
        if (!dependents.has(dependencyId)) {
          dependents.set(dependencyId, new Set());
        }
        dependents.get(dependencyId)!.add(module.id);
      });
    });

    artifactData.forEach((artifact) => {
      const producerId = artifact.producedBy;
      if (!producerId) {
        return;
      }
      if (!dependents.has(producerId)) {
        dependents.set(producerId, new Set());
      }
      const entry = dependents.get(producerId)!;
      artifact.consumerIds.forEach((consumerId) => {
        entry.add(consumerId);
      });
    });

    return dependents;
  }, [moduleData, artifactData]);

  const domainNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    flattenDomainTree(domainData).forEach((domain) => {
      map[domain.id] = domain.name;
    });
    return map;
  }, [domainData]);

  const moduleNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    moduleData.forEach((module) => {
      map[module.id] = module.name;
    });
    return map;
  }, [moduleData]);

  const moduleDomainMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    moduleData.forEach((module) => {
      map[module.id] = module.domains;
    });
    return map;
  }, [moduleData]);

  const artifactNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    artifactData.forEach((artifact) => {
      map[artifact.id] = artifact.name;
    });
    return map;
  }, [artifactData]);

  const moduleSearchIndex = useMemo(() => {
    const index: Record<string, string> = {};

    moduleData.forEach((module) => {
      const collected: string[] = [];
      collectSearchableValues(module, collected);

      module.domains.forEach((domainId) => {
        const domainName = domainNameMap[domainId];
        if (domainName) {
          collected.push(domainName);
        }
      });

      module.dependencies.forEach((dependencyId) => {
        const dependencyName = moduleNameMap[dependencyId];
        if (dependencyName) {
          collected.push(dependencyName);
        }
      });

      module.produces.forEach((artifactId) => {
        const artifactName = artifactNameMap[artifactId];
        if (artifactName) {
          collected.push(artifactName);
        }
      });

      module.dataIn.forEach((input) => {
        if (!input.sourceId) {
          return;
        }
        const sourceArtifactName = artifactNameMap[input.sourceId];
        if (sourceArtifactName) {
          collected.push(sourceArtifactName);
        }
      });

      module.dataOut.forEach((output) => {
        if (!output.artifactId) {
          return;
        }
        const producedName = artifactNameMap[output.artifactId];
        if (producedName) {
          collected.push(producedName);
        }
      });

      const normalized = collected
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0);

      index[module.id] = normalized.join(' ');
    });

    return index;
  }, [moduleData, domainNameMap, moduleNameMap, artifactNameMap]);

  const normalizedSearch = useMemo(
    () => (typeof search === 'string' ? search.trim().toLowerCase() : ''),
    [search]
  );


  const matchesModuleFilters = useCallback(
    (module: ModuleNode) => {
      const matchesDomain =
        selectedDomains.size > 0 &&
        module.domains.some((domainId) => selectedDomains.has(domainId));
      const searchableText = moduleSearchIndex[module.id] ?? '';
      const matchesSearch =
        normalizedSearch.length === 0 || searchableText.includes(normalizedSearch);
      const matchesStatus = statusFilters.has(module.status);
      const matchesProduct =
        productFilter.length > 0 && productFilter.includes(module.productName);
      const matchesCompany =
        !companyFilter ||
        module.userStats.companies.some((company) => company.name === companyFilter);
      return (
        matchesDomain && matchesSearch && matchesStatus && matchesProduct && matchesCompany
      );
    },
    [
      normalizedSearch,
      selectedDomains,
      statusFilters,
      productFilter,
      companyFilter,
      moduleSearchIndex
    ]
  );


  const filteredModules = useMemo(
    () => moduleData.filter((module) => matchesModuleFilters(module)),
    [moduleData, matchesModuleFilters]
  );

  const shouldShowAnalytics = isAnalyticsPanelEnabled && filteredModules.length > 0;

  const artifactMap = useMemo(
    () => new Map(artifactData.map((artifact) => [artifact.id, artifact])),
    [artifactData]
  );
  const domainMap = useMemo(
    () => new Map(flattenDomainTree(domainData).map((domain) => [domain.id, domain])),
    [domainData]
  );

  const moduleById = useMemo(() => {
    const map: Record<string, ModuleNode> = {};
    moduleData.forEach((module) => {
      map[module.id] = module;
    });
    return map;
  }, [moduleData]);

  const moduleIdSet = useMemo(() => new Set(moduleData.map((module) => module.id)), [moduleData]);

  const graphSelectOptions = useMemo(
    () =>
      graphs.map((graph) => ({
        label: graph.isDefault ? `${graph.name} • основной` : graph.name,
        value: graph.id
      })),
    [graphs]
  );

  // Removed unused graphSourceSelectValue
  // Removed unused graphCopyOptionItems
  // Removed unused selectedGraphCopyOptionItems

  const sourceGraphDraft = useMemo(
    () => graphs.find((graph) => graph.id === graphSourceIdDraft) ?? null,
    [graphs, graphSourceIdDraft]
  );

  const attachableDomainIds = useMemo(() => collectAttachableDomainIds(domainData), [domainData]);
  const defaultDomainId = useMemo(
    () => attachableDomainIds[0] ?? null,
    [attachableDomainIds]
  );
  const attachableDomainIdSet = useMemo(
    () => new Set(attachableDomainIds),
    [attachableDomainIds]
  );
  const catalogDomainIdSet = useMemo(() => new Set(collectCatalogDomainIds(domainData)), [domainData]);
  const domainIdSet = useMemo(
    () => new Set(flattenDomainTree(domainData).map((domain) => domain.id)),
    [domainData]
  );
  const displayableDomainIdSet = useMemo(
    () =>
      new Set(
        flattenDomainTree(domainData)
          .filter((domain) => !domain.isCatalogRoot)
          .map((domain) => domain.id)
      ),
    [domainData]
  );

  const handleCreateExpert = useCallback(
    (draft: ExpertDraftPayload) => {
      const existingIds = new Set(expertProfiles.map((expert) => expert.id));
      const expertId = createEntityId('expert', draft.fullName, existingIds);
      const fallbackName = draft.fullName.trim() || `Новый сотрудник ${existingIds.size + 1}`;
      const profile = buildExpertFromDraft(expertId, draft, {
        domainIdSet,
        moduleIdSet,
        fallbackName,
        moduleNameMap
      });
      setExpertProfiles((prev) => [...prev, profile]);
      markGraphDirty();
      showAdminNotice('success', `Сотрудник «${profile.fullName}» создан.`);
    },
    [domainIdSet, expertProfiles, markGraphDirty, moduleIdSet, moduleNameMap, showAdminNotice]
  );
  const handleUpdateExpert = useCallback(
    (expertId: string, draft: ExpertDraftPayload) => {
      const existing = expertProfiles.find((expert) => expert.id === expertId);
      if (!existing) {
        showAdminNotice('error', 'Не удалось обновить сотрудника: профиль не найден.');
        return;
      }

      const updated = buildExpertFromDraft(expertId, draft, {
        domainIdSet,
        moduleIdSet,
        fallbackName: existing.fullName,
        fallbackProfile: existing,
        moduleNameMap
      });
      setExpertProfiles((prev) =>
        prev.map((expert) => (expert.id === expertId ? updated : expert))
      );
      markGraphDirty();
      showAdminNotice('success', `Сотрудник «${updated.fullName}» обновлён.`);
    },
    [domainIdSet, expertProfiles, markGraphDirty, moduleIdSet, moduleNameMap, showAdminNotice]
  );
  const handleDeleteExpert = useCallback(
    (expertId: string) => {
      const existing = expertProfiles.find((expert) => expert.id === expertId);
      if (!existing) {
        showAdminNotice('error', 'Не удалось удалить сотрудника: профиль не найден.');
        return;
      }

      setExpertProfiles((prev) => prev.filter((expert) => expert.id !== expertId));
      setInitiativeData((prev) =>
        prev.map((initiative) => {
          let rolesChanged = false;
          const roles = initiative.roles.map((role) => {
            let changed = false;
            const pinnedExpertIds = role.pinnedExpertIds.filter((id) => id !== expertId);
            if (pinnedExpertIds.length !== role.pinnedExpertIds.length) {
              changed = true;
            }
            let workItems = role.workItems;
            if (workItems && workItems.some((item) => item.assignedExpertId === expertId)) {
              workItems = workItems.map((item) =>
                item.assignedExpertId === expertId
                  ? { ...item, assignedExpertId: undefined }
                  : item
              );
              changed = true;
            }
            const candidates = role.candidates.filter(
              (candidate) => candidate.expertId !== expertId
            );
            if (candidates.length !== role.candidates.length) {
              changed = true;
            }
            if (!changed) {
              return role;
            }
            rolesChanged = true;
            return {
              ...role,
              pinnedExpertIds,
              candidates,
              ...(workItems ? { workItems } : {})
            };
          });

          if (!rolesChanged) {
            return initiative;
          }

          return {
            ...initiative,
            roles,
            lastUpdated: new Date().toISOString()
          };
        })
      );
      markGraphDirty();
      showAdminNotice('success', `Сотрудник «${existing.fullName}» удалён.`);
    },
    [expertProfiles, markGraphDirty, showAdminNotice]
  );

  const contextModuleIds = useMemo(() => {
    const ids = new Set<string>();

    if (!selectedNode) {
      return ids;
    }

    if (selectedNode.type === 'module') {
      ids.add(selectedNode.id);
      selectedNode.dependencies.forEach((dependencyId) => ids.add(dependencyId));

      const dependents = moduleDependents.get(selectedNode.id);
      dependents?.forEach((dependentId) => ids.add(dependentId));

      selectedNode.dataIn.forEach((input) => {
        if (!input.sourceId) {
          return;
        }
        const sourceArtifact = artifactMap.get(input.sourceId);
        if (sourceArtifact?.producedBy) {
          ids.add(sourceArtifact.producedBy);
        }
      });

      selectedNode.produces.forEach((artifactId) => {
        const artifact = artifactMap.get(artifactId);
        artifact?.consumerIds.forEach((consumerId) => ids.add(consumerId));
      });

      return ids;
    }

    if (selectedNode.type === 'artifact') {
      if (selectedNode.producedBy) {
        ids.add(selectedNode.producedBy);
      }
      selectedNode.consumerIds.forEach((consumerId) => ids.add(consumerId));
      return ids;
    }

    if (selectedNode.type === 'initiative') {
      selectedNode.plannedModuleIds.forEach((moduleId) => ids.add(moduleId));
      return ids;
    }

    if (selectedNode.type === 'domain') {
      moduleData.forEach((module) => {
        if (module.domains.includes(selectedNode.id)) {
          ids.add(module.id);
        }
      });
    }

    return ids;
  }, [selectedNode, moduleDependents, artifactMap, moduleData]);

  const graphModules = useMemo(() => {
    if (normalizedSearch) {
      return filteredModules;
    }

    const extraModuleIds = new Set(contextModuleIds);

    if (showAllConnections) {
      filteredModules.forEach((module) => {
        module.dependencies.forEach((dependencyId) => {
          extraModuleIds.add(dependencyId);
        });

        const dependents = moduleDependents.get(module.id);
        dependents?.forEach((dependentId) => {
          extraModuleIds.add(dependentId);
        });

        module.produces.forEach((artifactId) => {
          const artifact = artifactMap.get(artifactId);
          artifact?.consumerIds.forEach((consumerId) => extraModuleIds.add(consumerId));
        });

        module.dataIn.forEach((input) => {
          if (!input.sourceId) {
            return;
          }
          const artifact = artifactMap.get(input.sourceId);
          if (artifact?.producedBy) {
            extraModuleIds.add(artifact.producedBy);
          }
        });
      });
    }

    initiativeData.forEach((initiative) => {
      const matchesSelectedDomain = initiative.domains.some((domainId) =>
        selectedDomains.has(domainId)
      );

      if (!matchesSelectedDomain) {
        return;
      }

      initiative.plannedModuleIds.forEach((moduleId) => {
        extraModuleIds.add(moduleId);
      });
    });

    if (extraModuleIds.size === 0) {
      return filteredModules;
    }

    const existing = new Set(filteredModules.map((module) => module.id));
    const extended = [...filteredModules];

    extraModuleIds.forEach((moduleId) => {
      if (existing.has(moduleId)) {
        return;
      }
      const module = moduleById[moduleId];
      if (!module || !matchesModuleFilters(module)) {
        return;
      }
      extended.push(module);
      existing.add(moduleId);
    });

    return extended;
  }, [
    filteredModules,
    normalizedSearch,
    contextModuleIds,
    moduleById,
    showAllConnections,
    artifactMap,
    moduleDependents,
    companyFilter,
    initiativeData,
    selectedDomains,
    matchesModuleFilters
  ]);

  const graphInitiatives = useMemo(() => {
    const visibleModuleIds = new Set(graphModules.map((module) => module.id));
    const selectedInitiativeId = selectedNode?.type === 'initiative' ? selectedNode.id : null;

    return initiativeData.filter((initiative) => {
      const matchesDomain = initiative.domains.some((domainId) => selectedDomains.has(domainId));
      const matchesModules = initiative.plannedModuleIds.some((moduleId) =>
        visibleModuleIds.has(moduleId)
      );

      if (matchesDomain || matchesModules) {
        return true;
      }

      return selectedInitiativeId === initiative.id;
    });
  }, [graphModules, initiativeData, selectedDomains, selectedNode]);

  const relevantDomainIds = useMemo(() => {
    const ids = new Set<string>();

    const addWithAncestors = (domainId: string) => {
      ids.add(domainId);
      const ancestors = domainAncestors.get(domainId);
      ancestors?.forEach((ancestorId) => ids.add(ancestorId));
    };

    selectedDomains.forEach((domainId) => {
      addWithAncestors(domainId);
    });

    graphModules.forEach((module) => {
      module.domains.forEach((domainId) => addWithAncestors(domainId));
    });

    graphInitiatives.forEach((initiative) => {
      initiative.domains.forEach((domainId) => addWithAncestors(domainId));
    });

    if (highlightedDomainId) {
      addWithAncestors(highlightedDomainId);
    }

    return ids;
  }, [graphModules, graphInitiatives, highlightedDomainId, domainAncestors, selectedDomains]);

  const graphDomains = useMemo(() => {
    // Don't apply search filter to domains - they should be shown for all visible modules
    // The modules are already filtered by search, so domains are shown based on module visibility
    const filteredDomains = filterDomainTreeByIds(domainData, relevantDomainIds);
    return filteredDomains;
  }, [domainData, relevantDomainIds]);

  const graphArtifacts = useMemo(() => {
    const moduleIds = new Set(graphModules.map((module) => module.id));
    const relevantArtifactIds = new Set<string>();

    graphModules.forEach((module) => {
      module.produces.forEach((artifactId) => relevantArtifactIds.add(artifactId));
      module.dataIn.forEach((input) => {
        if (input.sourceId) {
          relevantArtifactIds.add(input.sourceId);
        }
      });
    });

    let scopedArtifacts = artifactData.filter((artifact) => {
      if (relevantArtifactIds.has(artifact.id)) {
        return true;
      }
      if (artifact.producedBy && moduleIds.has(artifact.producedBy)) {
        return true;
      }
      return artifact.consumerIds.some((consumerId) => moduleIds.has(consumerId));
    });

    // Don't apply search filter to artifacts - they should be shown for all visible modules
    // The modules are already filtered by search, so artifacts are shown based on module connections

    if (selectedNode?.type === 'artifact' && !scopedArtifacts.some((artifact) => artifact.id === selectedNode.id)) {
      const fallback = artifactData.find((artifact) => artifact.id === selectedNode.id);
      if (fallback) {
        scopedArtifacts = [...scopedArtifacts, fallback];
      }
    }

    return scopedArtifacts;
  }, [artifactData, graphModules, selectedNode]);

  const graphLinksAll = useMemo(
    () => [
      ...buildModuleLinks(moduleData, artifactData, displayableDomainIdSet),
      ...buildInitiativeLinks(initiativeData, displayableDomainIdSet)
    ],
    [moduleData, artifactData, initiativeData, displayableDomainIdSet]
  );

  const filteredLinks = useMemo(() => {
    const moduleIds = new Set(graphModules.map((module) => module.id));
    const artifactIds = new Set(graphArtifacts.map((artifact) => artifact.id));
    const domainIds = relevantDomainIds.size > 0 ? relevantDomainIds : null;
    const initiativeIds = new Set(graphInitiatives.map((initiative) => initiative.id));

    return graphLinksAll.filter((link) => {
      const sourceId = getLinkEndpointId(link.source);
      const targetId = getLinkEndpointId(link.target);

      if (link.type === 'dependency') {
        return moduleIds.has(sourceId) && moduleIds.has(targetId);
      }

      if (link.type === 'domain') {
        return moduleIds.has(sourceId) && (!domainIds || domainIds.has(targetId));
      }

      if (link.type === 'produces') {
        return moduleIds.has(sourceId) && artifactIds.has(targetId);
      }

      if (link.type === 'consumes') {
        if (!artifactIds.has(sourceId) || !moduleIds.has(targetId)) {
          return false;
        }

        if (showAllConnections) {
          return true;
        }

        const artifact = artifactMap.get(sourceId);
        if (!artifact) {
          return false;
        }

        const producerProduct = artifact.producedBy
          ? moduleById[artifact.producedBy]?.productName ?? null
          : null;
        const consumerProduct = moduleById[targetId]?.productName ?? null;

        return Boolean(producerProduct && consumerProduct && producerProduct === consumerProduct);
      }

      if (link.type === 'initiative-domain') {
        if (!initiativeIds.has(sourceId)) {
          return false;
        }

        if (domainIds && !domainIds.has(targetId)) {
          return false;
        }

        return true;
      }

      if (link.type === 'initiative-plan') {
        return initiativeIds.has(sourceId) && moduleIds.has(targetId);
      }

      return false;
    });
  }, [
    artifactMap,
    graphArtifacts,
    graphLinksAll,
    graphInitiatives,
    graphModules,
    moduleById,
    relevantDomainIds,
    showAllConnections
  ]);

  useEffect(() => {
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      const moduleIds = new Set(graphModules.map((module) => module.id));
      const artifactIds = new Set(graphArtifacts.map((artifact) => artifact.id));
      const domainIds = relevantDomainIds.size > 0 ? relevantDomainIds : null;

      const recomputedLinks = graphLinksAll.filter((link) => {
        const sourceId = getLinkEndpointId(link.source);
        const targetId = getLinkEndpointId(link.target);

        if (link.type === 'dependency') {
          return moduleIds.has(sourceId) && moduleIds.has(targetId);
        }

        if (link.type === 'domain') {
          return moduleIds.has(sourceId) && (!domainIds || domainIds.has(targetId));
        }

        if (link.type === 'produces') {
          return moduleIds.has(sourceId) && artifactIds.has(targetId);
        }

        if (link.type === 'consumes') {
          if (!artifactIds.has(sourceId) || !moduleIds.has(targetId)) {
            return false;
          }

          if (showAllConnections) {
            return true;
          }

          const artifact = artifactMap.get(sourceId);
          if (!artifact) {
            return false;
          }

          const producerProduct = artifact.producedBy
            ? moduleById[artifact.producedBy]?.productName ?? null
            : null;
          const consumerProduct = moduleById[targetId]?.productName ?? null;

          return Boolean(
            producerProduct &&
            consumerProduct &&
            producerProduct === consumerProduct
          );
        }

        return false;
      });

      const excludedLinks = graphLinksAll
        .filter((link) => !recomputedLinks.includes(link))
        .map((link) => {
          const sourceId = getLinkEndpointId(link.source);
          const targetId = getLinkEndpointId(link.target);
          let reason = 'filtered';
          if (link.type === 'dependency') {
            reason = `missing module: ${moduleIds.has(sourceId) ? '' : sourceId} ${moduleIds.has(targetId) ? '' : targetId
              }`;
          } else if (link.type === 'domain') {
            const hasModule = moduleIds.has(sourceId);
            const hasDomain = !domainIds || domainIds.has(targetId);
            reason = `domain link kept? module=${hasModule} domain=${hasDomain}`;
          } else if (link.type === 'produces') {
            reason = `produces source=${moduleIds.has(sourceId)} target=${artifactIds.has(targetId)}`;
          } else if (link.type === 'consumes') {
            const artifact = artifactMap.get(sourceId);
            const producerProduct = artifact?.producedBy
              ? moduleById[artifact.producedBy]?.productName ?? null
              : null;
            const consumerProduct = moduleById[targetId]?.productName ?? null;
            const sameProduct =
              producerProduct && consumerProduct && producerProduct === consumerProduct;
            reason = `consumes source=${artifactIds.has(sourceId)} target=${moduleIds.has(
              targetId
            )} sameProduct=${sameProduct} toggle=${showAllConnections}`;
          }

          return { ...link, reason };
        });

      (window as typeof window & { __graphDebug?: unknown }).__graphDebug = {
        filteredModuleIds: graphModules.map((module) => module.id),
        filteredModuleCount: graphModules.length,
        graphArtifactIds: graphArtifacts.map((artifact) => artifact.id),
        graphArtifactCount: graphArtifacts.length,
        filteredLinks: filteredLinks.map((link) => ({ ...link })),
        filteredLinkCount: filteredLinks.length,
        visibleDomainIds: Array.from(relevantDomainIds),
        selectedDomainIds: Array.from(selectedDomains),
        recomputedLinkCount: recomputedLinks.length,
        excludedLinks
      };
    }
  }, [
    filteredLinks,
    graphArtifacts,
    graphModules,
    graphLinksAll,
    artifactMap,
    moduleById,
    relevantDomainIds,
    selectedDomains,
    showAllConnections
  ]);

  useEffect(() => {
    if (viewMode === 'stats' && !statsActivated) {
      setStatsActivated(true);
    }
  }, [statsActivated, viewMode]);

  useEffect(() => {
    if (hasPrefetchedStats.current) return;

    hasPrefetchedStats.current = true;

    const prefetch = () => {
      import('./pages/StatsPage');
      import('./components/StatsDashboard');
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as typeof window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(
        prefetch
      );
    } else {
      setTimeout(prefetch, 500);
    }
  }, []);

  const handleSelectNode = (node: GraphNode | null) => {
    setSelectedNode(node);
  };

  const handleSearchChange = useCallback((value: string) => {
    setSelectedNode(null);
    setSearch(value);
  }, []);

  const handleDomainToggle = (domainId: string) => {
    const cascade = domainDescendants.get(domainId) ?? [domainId];
    let shouldSelect = false;

    setSelectedDomains((prev) => {
      const next = new Set(prev);
      shouldSelect = cascade.some((id) => !next.has(id));

      if (shouldSelect) {
        cascade.forEach((id) => next.add(id));
        return next;
      }

      cascade.forEach((id) => next.delete(id));
      return next;
    });

    if (shouldSelect) {
      const domain = domainMap.get(domainId);
      if (domain) {
        setSelectedNode({ ...domain, type: 'domain' });
      }
      return;
    }

    setSelectedNode((current) => {
      if (!current) {
        return current;
      }

      if (cascade.includes(current.id)) {
        return null;
      }

      if (current.type === 'module') {
        const intersects = current.domains.some((domain) => cascade.includes(domain));
        return intersects ? null : current;
      }

      if (current.type === 'artifact' && cascade.includes(current.domainId)) {
        return null;
      }

      return current;
    });
  };

  const handleNavigate = useCallback(
    (nodeId: string) => {
      if (moduleById[nodeId]) {
        const module = moduleById[nodeId];
        const relatedDomains = new Set(module.domains);
        module.dependencies.forEach((dependencyId) => {
          const dependency = moduleById[dependencyId];
          dependency?.domains.forEach((domainId) => relatedDomains.add(domainId));
        });
        const dependents = moduleDependents.get(module.id);
        dependents?.forEach((dependentId) => {
          const dependent = moduleById[dependentId];
          dependent?.domains.forEach((domainId) => relatedDomains.add(domainId));
        });
        setSelectedNode({ ...module, type: 'module' });
        return;
      }

      const artifact = artifactMap.get(nodeId);
      if (artifact) {
        setSelectedNode({ ...artifact, type: 'artifact', reuseScore: 0 });
        return;
      }

      const domain = domainMap.get(nodeId);
      if (domain) {
        setSelectedNode({ ...domain, type: 'domain' });
      }
    },
    [artifactMap, domainMap, moduleById, moduleDependents]
  );

  const activeNodeIds = useMemo(() => {
    const ids = new Set<string>();

    moduleData.forEach((module) => ids.add(module.id));
    artifactData.forEach((artifact) => ids.add(artifact.id));
    flattenDomainTree(domainData).forEach((domain) => ids.add(domain.id));
    initiativeData.forEach((initiative) => ids.add(initiative.id));

    return ids;
  }, [artifactData, domainData, initiativeData, moduleData]);

  const handleLayoutChange = useCallback(
    (positions: Record<string, GraphLayoutNodePosition>, reason: 'drag' | 'engine') => {
      if (reason === 'engine') {
        if (!shouldCaptureEngineLayoutRef.current) {
          return;
        }
        shouldCaptureEngineLayoutRef.current = false;
      } else {
        shouldCaptureEngineLayoutRef.current = true;
      }

      let didChange = false;
      setLayoutPositions((prev) => {
        const merged = mergeLayoutPositions(prev, positions);
        const ensuredActiveIds = new Set(activeNodeIds);
        Object.keys(positions).forEach((id) => ensuredActiveIds.add(id));
        const pruned = pruneLayoutPositions(merged, ensuredActiveIds);
        const { positions: constrained, changed: adjusted } = normalizeLayoutPositions(pruned);
        const nextLayout = adjusted ? constrained : pruned;
        if (layoutsEqual(prev, nextLayout)) {
          return prev;
        }
        didChange = true;
        if (adjusted) {
          setLayoutNormalizationRequest((value) => value + 1);
        }
        return nextLayout;
      });

      if (didChange) {
        hasPendingPersistRef.current = true;
      }
      if (didChange && reason === 'drag') {
        markGraphDirty();
      }
    },
    [activeNodeIds, markGraphDirty]
  );

  useEffect(() => {
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      (window as typeof window & { __selectGraphNode?: (id: string) => void }).__selectGraphNode = (nodeId: string) => {
        handleNavigate(nodeId);
      };
    }
  }, [handleNavigate]);

  const handleCreateModule = useCallback(
    (draft: ModuleDraftPayload) => {
      const existingIds = new Set(moduleData.map((module) => module.id));
      const moduleId = createEntityId('module', draft.name, existingIds);
      const fallbackDomains =
        draft.domainIds.length > 0
          ? draft.domainIds
          : selectedNode?.type === 'domain'
            ? [selectedNode.id]
            : defaultDomainId
              ? [defaultDomainId]
              : [];

      const result = buildModuleFromDraft(moduleId, draft, fallbackDomains, attachableDomainIdSet, {
        fallbackName: draft.name.trim() || `Новый модуль ${existingIds.size + 1}`,
      });
      if (!result) {
        showAdminNotice(
          'error',
          'Не удалось сохранить модуль: выберите хотя бы одну доменную область.'
        );
        return;
      }

      const { module: newModule, consumedArtifactIds } = result;
      markGraphDirty();
      const recalculatedModules = recalculateReuseScores([...moduleData, newModule]);
      const createdModule = recalculatedModules.find((module) => module.id === moduleId);
      setModuleData(recalculatedModules);

      setArtifactData((prev) =>
        prev.map((artifact) => {
          let next = artifact;
          if (consumedArtifactIds.includes(artifact.id) && !artifact.consumerIds.includes(moduleId)) {
            next = { ...next, consumerIds: [...artifact.consumerIds, moduleId] };
          }
          if (createdModule?.produces.includes(artifact.id) && artifact.producedBy !== moduleId) {
            next = { ...next, producedBy: moduleId };
          }
          return next;
        })
      );
      setLayoutPositions((prev) => {
        if (prev[moduleId]) {
          return prev;
        }

        const anchorIds = [...newModule.dependencies, ...newModule.domains];
        const initialPosition = resolveInitialModulePosition(prev, anchorIds);
        if (!initialPosition) {
          return prev;
        }

        return {
          ...prev,
          [moduleId]: initialPosition
        };
      });
      shouldCaptureEngineLayoutRef.current = true;
      setSelectedDomains((prev) => {
        const next = new Set(prev);
        createdModule?.domains.forEach((domainId) => {
          if (domainId) {
            next.add(domainId);
          }
        });
        return next;
      });
      if (createdModule) {
        setSelectedNode({ ...createdModule, type: 'module' });
      }
      navigateToView('graph');
      if (createdModule) {
        showAdminNotice('success', `Модуль «${createdModule.name}» создан.`);
      }
    },
    [
      defaultDomainId,
      attachableDomainIdSet,
      navigateToView,
      markGraphDirty,
      moduleData,
      selectedNode,
      showAdminNotice
    ]
  );

  const handleUpdateModule = useCallback(
    (moduleId: string, draft: ModuleDraftPayload) => {
      const existing = moduleData.find((module) => module.id === moduleId);
      if (!existing) {
        return;
      }

      const fallbackDomains =
        draft.domainIds.length > 0
          ? draft.domainIds
          : existing.domains.length > 0
            ? existing.domains
            : defaultDomainId
              ? [defaultDomainId]
              : [];

      const result = buildModuleFromDraft(moduleId, draft, fallbackDomains, attachableDomainIdSet, {
        fallbackName: existing.name
      });
      if (!result) {
        showAdminNotice(
          'error',
          'Не удалось сохранить модуль: выберите хотя бы одну доменную область.'
        );
        return;
      }

      const { module: updatedModule, consumedArtifactIds } = result;
      markGraphDirty();
      const recalculatedModules = recalculateReuseScores(
        moduleData.map((module) => (module.id === moduleId ? updatedModule : module))
      );
      const recalculatedModule = recalculatedModules.find((module) => module.id === moduleId);
      const producedSet = new Set(recalculatedModule?.produces ?? []);

      setModuleData(recalculatedModules);

      setArtifactData((prev) =>
        prev.map((artifact) => {
          let next = artifact;
          const consumes = consumedArtifactIds.includes(artifact.id);
          if (consumes && !artifact.consumerIds.includes(moduleId)) {
            next = { ...next, consumerIds: [...artifact.consumerIds, moduleId] };
          }
          if (!consumes && artifact.consumerIds.includes(moduleId)) {
            next = {
              ...next,
              consumerIds: artifact.consumerIds.filter((consumerId) => consumerId !== moduleId)
            };
          }

          if (producedSet.has(artifact.id)) {
            if (artifact.producedBy !== moduleId) {
              next = { ...next, producedBy: moduleId };
            }
          } else if (artifact.producedBy === moduleId) {
            next = { ...next, producedBy: undefined };
          }

          return next;
        })
      );

      setSelectedNode((prev) =>
        prev && prev.id === moduleId && recalculatedModule
          ? { ...recalculatedModule, type: 'module' }
          : prev
      );

      if (recalculatedModule) {
        showAdminNotice('success', `Модуль «${recalculatedModule.name}» обновлён.`);
      }
    },
    [defaultDomainId, attachableDomainIdSet, markGraphDirty, moduleData, showAdminNotice]
  );

  const handleDeleteModule = useCallback(
    (moduleId: string) => {
      const removedModule = moduleData.find((module) => module.id === moduleId);
      if (!removedModule) {
        return;
      }
      markGraphDirty();
      const producedArtifacts = artifactData
        .filter((artifact) => artifact.producedBy === moduleId)
        .map((artifact) => artifact.id);
      const removedArtifactIds = new Set(producedArtifacts);

      setArtifactData((prev) =>
        prev
          .filter((artifact) => artifact.producedBy !== moduleId)
          .map((artifact) => ({
            ...artifact,
            consumerIds: artifact.consumerIds.filter((consumerId) => consumerId !== moduleId)
          }))
      );

      const nextModulesBase = moduleData
        .filter((module) => module.id !== moduleId)
        .map((module) => ({
          ...module,
          dependencies: module.dependencies.filter((dependencyId) => dependencyId !== moduleId),
          dataOut: module.dataOut
            .filter((output) =>
              output.artifactId ? !removedArtifactIds.has(output.artifactId) : true
            )
            .map((output) => ({ ...output })),
          produces: module.produces.filter((artifactId) => !removedArtifactIds.has(artifactId)),
          dataIn: module.dataIn.filter((input) =>
            input.sourceId ? !removedArtifactIds.has(input.sourceId) : true
          )
        }));

      setModuleData(nextModulesBase);
      setInitiativeData((prev) =>
        prev.map((initiative) => ({
          ...initiative,
          potentialModules: initiative.potentialModules.filter((id) => id !== moduleId)
        }))
      );

      setLayoutPositions((prev) => {
        const next = { ...prev };
        delete next[moduleId];
        removedArtifactIds.forEach((id) => {
          delete next[id];
        });
        return next;
      });
      shouldCaptureEngineLayoutRef.current = true;

      setSelectedNode((prev) => {
        if (!prev) {
          return prev;
        }
        if (prev.id === moduleId || removedArtifactIds.has(prev.id)) {
          return null;
        }
        return prev;
      });
      showAdminNotice('success', `Модуль «${removedModule.name}» удалён.`);
    },
    [artifactData, markGraphDirty, moduleData, showAdminNotice]
  );

  const handleCreateDomain = useCallback(
    (draft: DomainDraftPayload) => {
      const flattened = flattenDomainTree(domainData);
      const existingIds = new Set(flattened.map((domain) => domain.id));
      const domainId = createEntityId('domain', draft.name, existingIds);
      const normalizedName = draft.name.trim() || `Новый домен ${existingIds.size + 1}`;
      const normalizedDescription = draft.description.trim() || 'Описание не заполнено';
      const rawParentId = draft.parentId ?? undefined;
      const normalizedParentId = draft.isCatalogRoot
        ? rawParentId && catalogDomainIdSet.has(rawParentId)
          ? rawParentId
          : undefined
        : rawParentId && domainIdSet.has(rawParentId)
          ? rawParentId
          : undefined;

      if (!draft.isCatalogRoot && !normalizedParentId) {
        showAdminNotice(
          'error',
          'Не удалось создать домен: выберите родительскую область.'
        );
        return;
      }

      const experts = draft.experts.map((expert) => expert.trim()).filter((expert) => expert);
      const meetupLink = draft.meetupLink.trim();
      const newDomain: DomainNode = {
        id: domainId,
        name: normalizedName,
        description: normalizedDescription,
        isCatalogRoot: draft.isCatalogRoot,
        experts,
        meetupLink: meetupLink || undefined
      };

      const targetParentId = draft.isCatalogRoot ? normalizedParentId : normalizedParentId!;
      const updatedDomains = addDomainToTree(domainData, targetParentId, newDomain);
      markGraphDirty();
      setDomainData(updatedDomains);

      const moduleIds = !draft.isCatalogRoot && targetParentId ? draft.moduleIds : [];
      if (moduleIds.length > 0) {
        const moduleSet = new Set(moduleIds);
        setModuleData((prev) =>
          prev.map((module) =>
            moduleSet.has(module.id) && !module.domains.includes(domainId)
              ? { ...module, domains: [...module.domains, domainId] }
              : module
          )
        );
      }

      setSelectedDomains((prev) => {
        const next = new Set(prev);
        next.add(domainId);
        return next;
      });

      if (!draft.isCatalogRoot) {
        setSelectedNode({ ...newDomain, type: 'domain' });
      }
      navigateToView('graph');
      showAdminNotice(
        'success',
        `${draft.isCatalogRoot ? 'Корневой каталог' : 'Домен'} «${normalizedName}» создан.`
      );
    },
    [catalogDomainIdSet, domainData, domainIdSet, markGraphDirty, showAdminNotice]
  );

  const handleUpdateDomain = useCallback(
    (domainId: string, draft: DomainDraftPayload) => {
      const [treeWithoutDomain, extracted, previousParentId] = removeDomainFromTree(domainData, domainId);
      if (!extracted) {
        return;
      }

      const sanitizedName = draft.name.trim() || extracted.name;
      const sanitizedDescription =
        draft.description.trim() || extracted.description || 'Описание не заполнено';
      const experts = draft.experts.map((expert) => expert.trim()).filter((expert) => expert);
      const meetupLink = draft.meetupLink.trim();

      const updatedDomain: DomainNode = {
        ...extracted,
        name: sanitizedName,
        description: sanitizedDescription,
        isCatalogRoot: draft.isCatalogRoot,
        experts,
        meetupLink: meetupLink || undefined
      };

      const descendantIds = new Set(collectDomainIds(updatedDomain));
      const rawParentId = draft.parentId ?? undefined;
      let normalizedParentId = draft.isCatalogRoot
        ? rawParentId && catalogDomainIdSet.has(rawParentId)
          ? rawParentId
          : undefined
        : rawParentId && domainIdSet.has(rawParentId)
          ? rawParentId
          : undefined;

      if (!draft.isCatalogRoot && !normalizedParentId) {
        const restoredTree = addDomainToTree(
          treeWithoutDomain,
          previousParentId ?? undefined,
          extracted
        );
        setDomainData(restoredTree);
        showAdminNotice(
          'error',
          'Не удалось обновить домен: выберите родительскую область.'
        );
        return;
      }

      let targetParentId: string | null = normalizedParentId ?? null;

      if (targetParentId && (targetParentId === domainId || descendantIds.has(targetParentId))) {
        const fallbackParentId = previousParentId ?? null;
        const fallbackIsValid =
          fallbackParentId !== null &&
          (draft.isCatalogRoot
            ? catalogDomainIdSet.has(fallbackParentId)
            : domainIdSet.has(fallbackParentId)) &&
          !descendantIds.has(fallbackParentId) &&
          fallbackParentId !== domainId;

        targetParentId = fallbackIsValid ? fallbackParentId : null;
      }

      if (!draft.isCatalogRoot && !targetParentId) {
        const restoredTree = addDomainToTree(
          treeWithoutDomain,
          previousParentId ?? undefined,
          extracted
        );
        setDomainData(restoredTree);
        showAdminNotice(
          'error',
          'Не удалось обновить домен: выберите родительскую область.'
        );
        return;
      }

      const rebuiltTree = addDomainToTree(treeWithoutDomain, targetParentId ?? undefined, updatedDomain);
      markGraphDirty();
      setDomainData(rebuiltTree);

      const moduleSet = !draft.isCatalogRoot && targetParentId
        ? new Set(draft.moduleIds)
        : new Set<string>();
      setModuleData((prev) =>
        prev.map((module) => {
          const hasDomain = module.domains.includes(domainId);
          if (moduleSet.has(module.id)) {
            return hasDomain ? module : { ...module, domains: [...module.domains, domainId] };
          }
          return hasDomain
            ? { ...module, domains: module.domains.filter((id) => id !== domainId) }
            : module;
        })
      );

      setSelectedNode((prev) =>
        prev && prev.id === domainId
          ? updatedDomain.isCatalogRoot
            ? null
            : { ...updatedDomain, type: 'domain' }
          : prev
      );
      showAdminNotice(
        'success',
        `${updatedDomain.isCatalogRoot ? 'Корневой каталог' : 'Домен'} «${sanitizedName}» обновлён.`
      );
    },
    [catalogDomainIdSet, domainData, domainIdSet, markGraphDirty, showAdminNotice]
  );

  const handleDeleteDomain = useCallback(
    (domainId: string) => {
      const [nextTree, removedDomain] = removeDomainFromTree(domainData, domainId);
      if (!removedDomain) {
        return;
      }

      const removedIds = new Set(collectDomainIds(removedDomain));

      markGraphDirty();
      setDomainData(nextTree);
      setModuleData((prev) =>
        prev.map((module) => ({
          ...module,
          domains: module.domains.filter((id) => !removedIds.has(id))
        }))
      );
      setArtifactData((prev) => prev.filter((artifact) => !removedIds.has(artifact.domainId)));
      setInitiativeData((prev) =>
        prev.map((initiative) => ({
          ...initiative,
          domains: initiative.domains.filter((id) => !removedIds.has(id))
        }))
      );
      setSelectedDomains((prev) => {
        const next = new Set(prev);
        removedIds.forEach((id) => next.delete(id));
        return next;
      });
      setLayoutPositions((prev) => {
        const next = { ...prev };
        removedIds.forEach((id) => {
          delete next[id];
        });
        return next;
      });
      shouldCaptureEngineLayoutRef.current = true;
      setSelectedNode((prev) => (prev && removedIds.has(prev.id) ? null : prev));
      showAdminNotice(
        'success',
        `${removedDomain.isCatalogRoot ? 'Корневой каталог' : 'Домен'} «${removedDomain.name}» удалён.`
      );
    },
    [domainData, markGraphDirty, showAdminNotice]
  );

  const handleCreateArtifact = useCallback(
    (draft: ArtifactDraftPayload) => {
      const existingIds = new Set(artifactData.map((artifact) => artifact.id));
      const artifactId = createEntityId('artifact', draft.name, existingIds);
      const normalizedName = draft.name.trim() || `Новый артефакт ${existingIds.size + 1}`;
      const normalizedDescription = draft.description.trim() || 'Описание не заполнено';
      const normalizedDataType = draft.dataType.trim() || 'Не указан';
      const normalizedSampleUrl = draft.sampleUrl.trim() || '#';
      const producerId = draft.producedBy?.trim();
      const fallbackDomainId =
        draft.domainId ?? (producerId ? moduleById[producerId]?.domains[0] : undefined) ?? defaultDomainId;
      const domainId = fallbackDomainId && attachableDomainIdSet.has(fallbackDomainId) ? fallbackDomainId : null;
      const consumers = deduplicateNonEmpty(draft.consumerIds);

      if (!domainId) {
        showAdminNotice('error', 'Не удалось сохранить артефакт: выберите доменную область.');
        return;
      }

      const newArtifact: ArtifactNode = {
        id: artifactId,
        name: normalizedName,
        description: normalizedDescription,
        domainId,
        producedBy: producerId || undefined,
        consumerIds: consumers,
        dataType: normalizedDataType,
        sampleUrl: normalizedSampleUrl
      };

      markGraphDirty();
      setArtifactData([...artifactData, newArtifact]);

      setModuleData((prev) =>
        prev.map((module) => {
          let next = module;

          if (producerId && module.id === producerId) {
            const produces = module.produces.includes(artifactId)
              ? module.produces
              : [...module.produces, artifactId];
            const existingOutputIndex = module.dataOut.findIndex(
              (output) => output.artifactId === artifactId || output.label === normalizedName
            );
            const dataOut = existingOutputIndex >= 0
              ? module.dataOut.map((output, index) =>
                  index === existingOutputIndex
                    ? { ...output, label: normalizedName, artifactId }
                    : output
                )
              : [
                  ...module.dataOut,
                  {
                    id: `output-${module.dataOut.length + 1}-${artifactId}`,
                    label: normalizedName,
                    artifactId
                  }
                ];
            next = { ...next, produces, dataOut };
          }

          if (consumers.includes(module.id) && !module.dataIn.some((input) => input.sourceId === artifactId)) {
            next = {
              ...next,
              dataIn: [
                ...module.dataIn,
                {
                  id: `input-${module.dataIn.length + 1}-${artifactId}`,
                  label: normalizedName,
                  sourceId: artifactId
                }
              ]
            };
          }

          return next;
        })
      );

      setSelectedNode({ ...newArtifact, type: 'artifact', reuseScore: 0 });
      setSelectedDomains((prev) => {
        const next = new Set(prev);
        next.add(domainId);
        return next;
      });
      navigateToView('graph');
      showAdminNotice('success', `Артефакт «${normalizedName}» создан.`);
    },
    [
      artifactData,
      defaultDomainId,
      attachableDomainIdSet,
      markGraphDirty,
      moduleById,
      showAdminNotice
    ]
  );

  const handleUpdateArtifact = useCallback(
    (artifactId: string, draft: ArtifactDraftPayload) => {
      const existing = artifactData.find((artifact) => artifact.id === artifactId);
      if (!existing) {
        return;
      }

      const normalizedName = draft.name.trim() || existing.name;
      const normalizedDescription = draft.description.trim() || existing.description;
      const normalizedDataType = draft.dataType.trim() || existing.dataType;
      const normalizedSampleUrl = draft.sampleUrl.trim() || existing.sampleUrl;
      const producerId = draft.producedBy?.trim();
      const candidateDomainId = draft.domainId ?? existing.domainId;
      if (!candidateDomainId || !attachableDomainIdSet.has(candidateDomainId)) {
        showAdminNotice('error', 'Не удалось сохранить артефакт: выберите доменную область.');
        return;
      }
      const domainId = candidateDomainId;
      const consumers = deduplicateNonEmpty(draft.consumerIds);

      const updatedArtifact: ArtifactNode = {
        id: artifactId,
        name: normalizedName,
        description: normalizedDescription,
        domainId,
        producedBy: producerId || undefined,
        consumerIds: consumers,
        dataType: normalizedDataType,
        sampleUrl: normalizedSampleUrl
      };

      markGraphDirty();
      setArtifactData((prev) =>
        prev.map((artifact) => (artifact.id === artifactId ? updatedArtifact : artifact))
      );

      setModuleData((prev) =>
        prev.map((module) => {
          let next = module;
          const isProducer = producerId && module.id === producerId;
          const wasProducer = existing.producedBy && module.id === existing.producedBy;
          let produces = module.produces;
          let dataOut = module.dataOut;

          if (isProducer) {
            if (!produces.includes(artifactId)) {
              produces = [...produces, artifactId];
            }
            const outputIndex = dataOut.findIndex((output) => output.artifactId === artifactId);
            if (outputIndex >= 0) {
              dataOut = dataOut.map((output, index) =>
                index === outputIndex
                  ? {
                      ...output,
                      label: normalizedName,
                      artifactId
                    }
                  : output
              );
            } else {
              dataOut = [
                ...dataOut,
                {
                  id: `output-${dataOut.length + 1}-${artifactId}`,
                  label: normalizedName,
                  artifactId
                }
              ];
            }
          } else if (wasProducer) {
            produces = produces.filter((id) => id !== artifactId);
            dataOut = dataOut.filter((output) => output.artifactId !== artifactId);
          }

          const isConsumer = consumers.includes(module.id);
          const wasConsumer = existing.consumerIds.includes(module.id);
          let dataIn = module.dataIn;

          if (isConsumer) {
            if (dataIn.some((input) => input.sourceId === artifactId)) {
              dataIn = dataIn.map((input) =>
                input.sourceId === artifactId ? { ...input, label: normalizedName } : input
              );
            } else {
              dataIn = [
                ...dataIn,
                {
                  id: `input-${dataIn.length + 1}-${artifactId}`,
                  label: normalizedName,
                  sourceId: artifactId
                }
              ];
            }
          } else if (wasConsumer) {
            dataIn = dataIn.filter((input) => input.sourceId !== artifactId);
          }

          if (produces !== module.produces || dataOut !== module.dataOut || dataIn !== module.dataIn) {
            next = { ...module, produces, dataOut, dataIn };
          }

          return next;
        })
      );

      setSelectedNode((prev) =>
        prev && prev.id === artifactId ? { ...updatedArtifact, type: 'artifact', reuseScore: 0 } : prev
      );
      showAdminNotice('success', `Артефакт «${normalizedName}» обновлён.`);
    },
    [artifactData, attachableDomainIdSet, markGraphDirty, showAdminNotice]
  );

  const handleDeleteArtifact = useCallback(
    (artifactId: string) => {
      const existing = artifactData.find((artifact) => artifact.id === artifactId);
      if (!existing) {
        return;
      }

      markGraphDirty();
      setArtifactData((prev) => prev.filter((artifact) => artifact.id !== artifactId));

      setModuleData((prev) =>
        prev.map((module) => ({
          ...module,
          produces: module.produces.filter((id) => id !== artifactId),
          dataOut: module.dataOut.filter((output) => output.label !== existing.name),
          dataIn: module.dataIn.filter((input) => input.sourceId !== artifactId)
        }))
      );

      setLayoutPositions((prev) => {
        const next = { ...prev };
        delete next[artifactId];
        return next;
      });
      shouldCaptureEngineLayoutRef.current = true;

      setSelectedNode((prev) => (prev && prev.id === artifactId ? null : prev));
      showAdminNotice('success', `Артефакт «${existing.name}» удалён.`);
    },
    [artifactData, markGraphDirty, showAdminNotice]
  );

  const handleImportGraph = useCallback(
    (snapshot: GraphSnapshotPayload) => {
      applySnapshot(snapshot);
      markGraphDirty();
    },
    [applySnapshot, markGraphDirty]
  );

  const handleImportFromExistingGraph = useCallback(
    async (request: {
      graphId: string;
      includeDomains: boolean;
      includeModules: boolean;
      includeArtifacts: boolean;
      includeExperts: boolean;
      includeInitiatives: boolean;
    }) => {
      try {
        const snapshot = await importGraphFromSource(request);
        applySnapshot(snapshot);
        setIsSyncAvailable(true);
        markGraphDirty();
        return {
          domains: snapshot.domains.length,
          modules: snapshot.modules.length,
          artifacts: snapshot.artifacts.length,
          experts: snapshot.experts?.length ?? 0,
          initiatives: snapshot.initiatives?.length ?? 0
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Не удалось импортировать данные графа.';
        showAdminNotice('error', message);
        throw error instanceof Error ? error : new Error(message);
      }
    },
    [applySnapshot, markGraphDirty, showAdminNotice]
  );

  const handleSubmitCreateGraph = useCallback(async () => {
    if (isGraphActionInProgress) {
      return;
    }

    const trimmedName = graphNameDraft.trim();
    if (!trimmedName) {
      setGraphActionStatus({ type: 'error', message: 'Введите название графа.' });
      return;
    }

    const normalizedName = trimmedName.toLowerCase();
    const hasDuplicate = graphs.some(
      (graph) => graph.name.trim().toLowerCase() === normalizedName
    );
    if (hasDuplicate) {
      setGraphActionStatus({ type: 'error', message: 'Граф с таким названием уже существует.' });
      return;
    }

    if (graphSourceIdDraft && !graphs.some((graph) => graph.id === graphSourceIdDraft)) {
      setGraphActionStatus({
        type: 'error',
        message: 'Выбранный источник графа больше недоступен. Выберите другой граф.'
      });
      setGraphSourceIdDraft(null);
      setGraphCopyOptions(buildDefaultGraphCopyOptions());
      return;
    }

    // Если источник не выбран, создаем полностью пустой граф
    const includeDomains = graphSourceIdDraft ? graphCopyOptions.has('domains') : false;
    const includeModules = graphSourceIdDraft ? graphCopyOptions.has('modules') : false;
    const includeArtifacts = graphSourceIdDraft ? graphCopyOptions.has('artifacts') : false;
    const includeExperts = graphSourceIdDraft ? graphCopyOptions.has('experts') : false;
    const includeInitiatives = graphSourceIdDraft ? graphCopyOptions.has('initiatives') : false;

    if (
      graphSourceIdDraft &&
      !includeDomains &&
      !includeModules &&
      !includeArtifacts &&
      !includeExperts &&
      !includeInitiatives
    ) {
      setGraphActionStatus({
        type: 'error',
        message: 'Выберите хотя бы один тип данных для копирования из выбранного графа.'
      });
      return;
    }

    setIsGraphActionInProgress(true);
    try {
      const created = await createGraphRequest({
        name: trimmedName,
        sourceGraphId: graphSourceIdDraft ?? undefined,
        includeDomains,
        includeModules,
        includeArtifacts,
        includeExperts,
        includeInitiatives
      });
      setGraphActionStatus({
        type: 'success',
        message: `Граф «${created.name}» создан.`
      });
      setGraphNameDraft('');
      setGraphSourceIdDraft(null);
      setGraphCopyOptions(new Set(['domains', 'modules', 'artifacts', 'experts', 'initiatives']));
      setIsCreatePanelOpen(false);
      await loadGraphsList(created.id, {
        preserveSelection: false,
        applySnapshot,
        onGraphUnavailable: handleGraphUnavailable
      });
      showAdminNotice('success', `Граф «${created.name}» создан.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось создать граф.';
      setGraphActionStatus({ type: 'error', message });
    } finally {
      setIsGraphActionInProgress(false);
    }
  }, [
    applySnapshot,
    graphNameDraft,
    graphSourceIdDraft,
    graphCopyOptions,
    isGraphActionInProgress,
    loadGraphsList,
    showAdminNotice,
    graphs,
    handleGraphUnavailable
  ]);

  const handleDeleteGraph = useCallback(
    async (graphId: string) => {
      if (isGraphActionInProgress) {
        return;
      }

      const target = graphs.find((graph) => graph.id === graphId);
      if (!target) {
        return;
      }

      if (target.isDefault) {
        setGraphActionStatus({ type: 'error', message: 'Основной граф нельзя удалить.' });
        return;
      }

      const confirmed =
        typeof window !== 'undefined'
          ? window.confirm(`Удалить граф «${target.name}» без возможности восстановления?`)
          : true;

      if (!confirmed) {
        return;
      }

      setIsGraphActionInProgress(true);
      setGraphActionStatus(null);
      try {
        await deleteGraphRequest(graphId);
        await loadGraphsList(null, {
          preserveSelection: true,
          applySnapshot,
          onGraphUnavailable: handleGraphUnavailable
        });
        setGraphActionStatus({ type: 'success', message: `Граф «${target.name}» удалён.` });
        showAdminNotice('success', `Граф «${target.name}» удалён.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось удалить граф.';
        setGraphActionStatus({ type: 'error', message });
      } finally {
        setIsGraphActionInProgress(false);
      }
    },
    [
      applySnapshot,
      graphs,
      handleGraphUnavailable,
      isGraphActionInProgress,
      loadGraphsList,
      showAdminNotice
    ]
  );

  const handleCreateGraph = useCallback(() => {
    setIsCreatePanelOpen(true);
  }, []);

  const handleGraphSelect = useCallback(
    (graphId: string | null) => {
      if (graphId) {
        updateActiveGraph(graphId, {
          applySnapshot,
          onGraphUnavailable: handleGraphUnavailable
        });
      } else {
        updateActiveGraph(null, { loadSnapshot: false, applySnapshot });
      }
    },
    [applySnapshot, handleGraphUnavailable, updateActiveGraph]
  );

  const shouldShowInitialLoader =
    (isGraphsLoading && graphs.length === 0) ||
    (isSnapshotLoading && !hasLoadedSnapshotRef.current);

  const isGraphActive = viewMode === 'graph';
  const isStatsActive = viewMode === 'stats';
  const isExpertsActive = viewMode === 'experts';
  const isInitiativesActive = viewMode === 'initiatives';
  const isEmployeeTasksActive = viewMode === 'employee-tasks';
  const isAdminActive = viewMode === 'admin';

  const headerTitle = (() => {
    if (isGraphActive) {
      return 'Граф модулей и доменных областей';
    }
    if (isStatsActive) {
      return 'Статистика экосистемы решений';
    }
    if (isExpertsActive) {
      return 'Экспертиза команды R&D';
    }
    if (isInitiativesActive) {
      return 'Планирование проектных инициатив';
    }
    if (isEmployeeTasksActive) {
      return 'Задачи моей команды вне проектов';
    }
    return 'Панель администрирования экосистемы';
  })();

  const headerDescription = (() => {
    if (isGraphActive) {
      return 'Выберите домены, чтобы увидеть связанные модули и выявить пересечения.';
    }
    if (isStatsActive) {
      return 'Обзор ключевых метрик по системам, модулям и обмену данными для планирования развития.';
    }
    if (isExpertsActive) {
      return 'Постройте матрицу компетенций, найдите носителей знаний и дополнительные консалтинговые навыки.';
    }
    if (isInitiativesActive) {
      return 'Сформируйте команды под инициативы, зафиксируйте риски и экспортируйте состав в черновик модуля.';
    }
    if (isEmployeeTasksActive) {
      return 'Следите за загрузкой сотрудников вне проектных задач и подбирайте подходящих исполнителей.';
    }
    return 'Управляйте данными графа: обновляйте карточки модулей, доменов и артефактов, а также удаляйте устаревшие связи.';
  })();

  const themePreset = useMemo(() => {
    if (themeMode === 'dark') return presetGpnDark;
    return presetGpnDefault;
  }, [themeMode]);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const pageVariants = {
    visible: {
      opacity: 1,
      y: 0,
      position: 'relative' as const,
      pointerEvents: 'auto' as const,
      transition: { duration: 0.3 }
    },
    hidden: {
      opacity: 0,
      y: 10,
      position: 'absolute' as const,
      pointerEvents: 'none' as const,
      transition: { duration: 0.2 }
    }
  };

  const graphPageProps: GraphContainerProps = {
    isActive: true,
    pageVariants,
    sidebarRef,
    sidebarMaxHeight,
    isDomainTreeOpen,
    onToggleDomainTree: () => setIsDomainTreeOpen((prev) => !prev),
    areFiltersOpen,
    onToggleFilters: () => setAreFiltersOpen((prev) => !prev),
    onToggleDomain: handleDomainToggle,
    domainDescendants,
    onSearchChange: handleSearchChange,
    allStatuses,
    onStatusToggle: (status) => {
      setSelectedNode(null);
      setStatusFilters((prev) => {
        const next = new Set(prev);
        if (next.has(status)) {
          next.delete(status);
        } else {
          next.add(status);
        }
        return next;
      });
    },
    products,
    onProductFilterChange: (nextProducts) => {
      setSelectedNode(null);
      setProductFilter(nextProducts);
    },
    companies,
    onCompanyChange: (nextCompany) => {
      setSelectedNode(null);
      setCompanyFilter(nextCompany);
    },
    onToggleConnections: (value) => setShowAllConnections(value),
    graphModules,
    graphDomains,
    graphArtifacts,
    graphInitiatives,
    filteredLinks,
    graphVersion: `${activeGraphId ?? 'local'}:${graphRenderEpoch}`,
    onSelectNode: handleSelectNode,
    selectedNode,
    visibleDomainIds: relevantDomainIds,
    onLayoutChange: handleLayoutChange,
    shouldShowAnalytics,
    filteredModules,
    domainNameMap,
    moduleNameMap,
    artifactNameMap,
    onNavigate: handleNavigate
  };

  const statsPageProps: StatsPageProps = {
    pageVariants,
    modules: moduleData,
    domains: domainData,
    artifacts: artifactData,
    reuseHistory: reuseIndexHistory
  };

  const expertsPageProps: ExpertsContainerProps = {
    isActive: true,
    pageVariants,
    experts: expertProfiles,
    modules: moduleData,
    moduleNameMap,
    moduleDomainMap,
    domainNameMap,
    initiatives: initiativeData,
    onUpdateExpertSkills: handleUpdateExpertSkills,
    onUpdateExpertSoftSkills: handleUpdateExpertSoftSkills
  };

  const initiativesPageProps: InitiativesContainerProps = {
    isActive: true,
    pageVariants,
    initiatives: initiativeData,
    experts: expertProfiles,
    domains: domainData,
    modules: moduleData,
    domainNameMap,
    employeeTasks,
    onTogglePin: handleToggleInitiativePin,
    onAddRisk: handleAddInitiativeRisk,
    onRemoveRisk: handleRemoveInitiativeRisk,
    onStatusChange: handleInitiativeStatusChange,
    onExport: handleInitiativeExport,
    onCreateInitiative: handlePlannerCreateInitiative,
    onUpdateInitiative: handlePlannerUpdateInitiative
  };

  const employeeTasksPageProps: EmployeeTasksContainerProps = {
    isActive: true,
    pageVariants,
    experts: expertProfiles,
    initiatives: initiativeData,
    tasks: employeeTasks,
    onTasksChange: setEmployeeTasks
  };

  const adminPageProps: AdminContainerProps = {
    isActive: true,
    pageVariants,
    modules: moduleData,
    domains: domainData,
    artifacts: artifactData,
    experts: expertProfiles,
    initiatives: initiativeData,
    employeeTasks,
    moduleDraftPrefill,
    onModuleDraftPrefillApplied: handleModuleDraftPrefillApplied,
    onCreateModule: handleCreateModule,
    onUpdateModule: handleUpdateModule,
    onDeleteModule: handleDeleteModule,
    onCreateDomain: handleCreateDomain,
    onUpdateDomain: handleUpdateDomain,
    onDeleteDomain: handleDeleteDomain,
    onCreateArtifact: handleCreateArtifact,
    onUpdateArtifact: handleUpdateArtifact,
    onDeleteArtifact: handleDeleteArtifact,
    onCreateExpert: handleCreateExpert,
    onUpdateExpert: handleUpdateExpert,
    onDeleteExpert: handleDeleteExpert,
    onUpdateEmployeeTasks: setEmployeeTasks,
    users,
    onCreateUser,
    onUpdateUser,
    onDeleteUser,
    currentUser: currentUser ?? null,
    graphs,
    activeGraphId,
    onGraphSelect: handleGraphSelect,
    onGraphCreate: handleCreateGraph,
    onGraphDelete: activeGraphId ? () => handleDeleteGraph(activeGraphId) : undefined,
    isGraphListLoading: isGraphsLoading,
    syncStatus,
    layout: layoutSnapshot,
    isSyncAvailable,
    onImport: handleImportGraph,
    onImportFromGraph: handleImportFromExistingGraph,
    onRetryLoad: handleRetryLoadSnapshot,
    isReloading: isReloadingSnapshot
  };

  const outletContext: AppOutletContext = {
    graphPageProps,
    statsPageProps,
    expertsPageProps,
    initiativesPageProps,
    employeeTasksPageProps,
    adminPageProps
  };

  return (
    <ThemeContainer preset={themePreset} themeKey={themeMode}>
      <LayoutShell
        headerTitle={headerTitle}
        headerDescription={headerDescription}
        themeMode={themeMode}
        onSetThemeMode={handleSetThemeMode}
        graphs={graphs}
        activeGraphId={activeGraphId}
        onGraphSelect={handleGraphSelect}
        onGraphCreate={handleCreateGraph}
        onGraphDelete={handleDeleteGraph}
        isGraphListLoading={isGraphsLoading}
        graphListError={graphListError}
        menuItems={visibleMenuItems}
        currentUser={user ?? undefined}
        onLogout={logout}
      >
        {snapshotError && (
          <div className={styles.errorBanner} role="status" aria-live="polite">
            <div className={styles.errorBannerContent}>
              <Text size="s" view="alert">
                {snapshotError}
              </Text>
              <Button
                size="xs"
                view="secondary"
                label={isReloadingSnapshot ? 'Повторяем попытку...' : 'Повторить попытку'}
                loading={isReloadingSnapshot}
                disabled={isReloadingSnapshot}
                onClick={handleRetryLoadSnapshot}
              />
            </div>
          </div>
        )}

        <CreateGraphModal
          isOpen={isCreatePanelOpen}
          onClose={() => {
            setIsCreatePanelOpen(false);
            setGraphActionStatus(null);
          }}
          onCreate={() => void handleSubmitCreateGraph()}
          graphName={graphNameDraft}
          onGraphNameChange={(val) => setGraphNameDraft(val)}
          sourceGraphId={graphSourceIdDraft}
          onSourceGraphIdChange={handleGraphSourceIdChange}
          copyOptions={graphCopyOptions}
          onCopyOptionsChange={setGraphCopyOptions}
          isSubmitting={isGraphActionInProgress}
          status={graphActionStatus}
          graphOptions={graphSelectOptions}
          sourceGraphDraft={sourceGraphDraft ?? undefined}
        />

        {shouldShowInitialLoader ? (
          <div className={styles.loadingState}>
            <Loader size="m" />
            <Text size="s" view="secondary">
              Загружаем доступные графы и их содержимое...
            </Text>
          </div>
        ) : (
          <>
            {adminNotice && (
              <div
                key={adminNotice.id}
                className={`${styles.noticeBanner} ${adminNotice.type === 'success' ? styles.noticeSuccess : styles.noticeError}`}
                role={adminNotice.type === 'error' ? 'alert' : 'status'}
                aria-live={adminNotice.type === 'error' ? 'assertive' : 'polite'}
              >
                <Text size="s" view="primary" className={styles.noticeMessage}>
                  {adminNotice.message}
                </Text>
                <Button size="xs" view="ghost" label="Скрыть" onClick={dismissAdminNotice} />
              </div>
            )}
            <Outlet context={outletContext} />
          </>
        )}
      </LayoutShell>
    </ThemeContainer>
  );
}

function App() {
  return (
    <UIProvider>
      <GraphDataProvider>
        <FilterProvider>
          <AppContent />
        </FilterProvider>
      </GraphDataProvider>
    </UIProvider>
  );
}

export default App;
