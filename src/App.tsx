import { motion } from 'framer-motion';
import { presetGpnDefault, presetGpnDark } from '@consta/uikit/Theme';

// ... (lines 2-3500 remain unchanged, but I can't skip them in replace_file_content unless I target specific blocks)
// I will target the import line and the variants definition separately.

import { Button } from '@consta/uikit/Button';
import { Collapse } from '@consta/uikit/Collapse';
import { Loader } from '@consta/uikit/Loader';
import { Text } from '@consta/uikit/Text';
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import AnalyticsPanel from './components/AnalyticsPanel';
import DomainTree from './components/DomainTree';
import AdminPanel, {
  type ArtifactDraftPayload,
  type DomainDraftPayload,
  type ExpertDraftPayload,
  type ModuleDraftPayload,
  type ModuleDraftPrefillRequest,
  type UserDraftPayload
} from './components/AdminPanel';
import FiltersPanel from './components/FiltersPanel';
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
import GraphView, { type GraphNode } from './components/GraphView';
import NodeDetails from './components/NodeDetails';
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
import { initialEmployeeTasks } from './data/employeeTasks';
import type { TaskListItem } from './types/tasks';
import { loadStoredTasks, persistStoredTasks } from './utils/employeeTasks';
import { LayoutShell, MENU_ITEMS } from './components/LayoutShell';
import { CreateGraphModal } from './components/CreateGraphModal';
import { useAuth } from './context/AuthContext';
import {
  GraphProvider,
  buildDefaultGraphCopyOptions,
  buildLocalSnapshot,
  useGraph,
  LOCAL_GRAPH_ID,
  LOCAL_GRAPH_SUMMARY,
  STORAGE_KEY_ACTIVE_GRAPH_ID
} from './context/GraphContext';
import Login from './components/Login';
import { GraphContainer } from './features/graph/GraphContainer';
import { ExpertsContainer } from './features/experts/ExpertsContainer';
import { InitiativesContainer } from './features/initiatives/InitiativesContainer';
import { EmployeeTasksContainer } from './features/employeeTasks/EmployeeTasksContainer';
import { AdminContainer } from './features/admin/AdminContainer';
import { ThemeContainer } from './features/theme/ThemeContainer';

const allStatuses: ModuleStatus[] = ['production', 'in-dev', 'deprecated'];
const initialProducts = buildProductList(initialModules);
const MAX_LAYOUT_SPAN = 1800;

const StatsDashboard = lazy(async () => ({
  default: (await import('./components/StatsDashboard')).default
}));

const viewTabs = [
  { label: 'Связи', value: 'graph' },
  { label: 'Статистика', value: 'stats' },
  { label: 'Экспертиза', value: 'experts' },
  { label: 'Инициативы', value: 'initiatives' },
  { label: 'Задачи моих сотрудников', value: 'employee-tasks' },
  { label: 'Администрирование', value: 'admin' }
] as const;

type ViewMode = (typeof viewTabs)[number]['value'];
type ThemeMode = 'light' | 'dark';

type AdminNotice = {
  id: number;
  type: 'success' | 'error';
  message: string;
};

const GRAPH_UNAVAILABLE_MESSAGE =
  'Выбранный граф недоступен. Обновите список графов и попробуйте снова.';

const isAnalyticsPanelEnabled =
  (import.meta.env.VITE_ENABLE_ANALYTICS_PANEL ?? 'true').toLowerCase() !== 'false';

function AppContent() {
  const { user, logout } = useAuth();
  const {
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
  } = useGraph();
  const setModuleDataState = useCallback(
    (next: ModuleNode[] | ((prev: ModuleNode[]) => ModuleNode[])) => {
      setModuleData((prev) => {
        const updated = typeof next === 'function' ? (next as (prev: ModuleNode[]) => ModuleNode[])(prev) : next;
        return recalculateReuseScores(updated);
      });
    },
    [setModuleData]
  );
  const [employeeTasks, setEmployeeTasks] = useState<TaskListItem[]>(() =>
    loadStoredTasks() ?? initialEmployeeTasks
  );
  const [users, setUsers] = useState<Array<{ id: string; username: string; role: 'admin' | 'user' }>>([]);
  const domainDataRef = useRef(domainData);
  const moduleDataRef = useRef(moduleData);
  const artifactDataRef = useRef(artifactData);
  const initiativeDataRef = useRef(initiativeData);
  const expertProfilesRef = useRef(expertProfiles);
  useEffect(() => {
    persistStoredTasks(employeeTasks);
  }, [employeeTasks]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('graph');
  const [isDomainTreeOpen, setIsDomainTreeOpen] = useState(false);
  const [areFiltersOpen, setAreFiltersOpen] = useState(true);
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const [sidebarBaseHeight, setSidebarBaseHeight] = useState<number | null>(null);
  const [adminNotice, setAdminNotice] = useState<AdminNotice | null>(null);
  const highlightedDomainId = selectedNode?.type === 'domain' ? selectedNode.id : null;
  const [statsActivated, setStatsActivated] = useState(() => viewMode === 'stats');
  const adminNoticeIdRef = useRef(0);
  const moduleDraftPrefillIdRef = useRef(0);
  const [moduleDraftPrefill, setModuleDraftPrefill] = useState<ModuleDraftPrefillRequest | null>(null);
  const handleModuleDraftPrefillApplied = useCallback(() => {
    setModuleDraftPrefill(null);
  }, []);
  const layoutSnapshot = useMemo<GraphLayoutSnapshot>(
    () => ({ nodes: layoutPositions }),
    [layoutPositions]
  );
  const sidebarMaxHeight = useMemo(
    () => (sidebarBaseHeight ? sidebarBaseHeight * 2 : null),
    [sidebarBaseHeight]
  );
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');

  const visibleMenuItems = useMemo(() => {
    if (!user) return [];
    return MENU_ITEMS.filter((item) => {
      if (item.id === 'admin' && user.role !== 'admin') {
        return false;
      }
      return true;
    });
  }, [user]);

  useEffect(() => {
    const saved = localStorage.getItem('app-theme');
    if (saved === 'light') {
      setThemeMode('light');
      return;
    }

    if (saved !== 'light') {
      localStorage.setItem('app-theme', 'light');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('app-theme', themeMode);
  }, [themeMode]);

  const handleSetThemeMode = useCallback((mode: ThemeMode) => {
    setThemeMode(mode);
  }, []);


  const [graphNameDraft, setGraphNameDraft] = useState('');
  const [graphSourceIdDraft, setGraphSourceIdDraft] = useState<string | null>(null);
  const [graphCopyOptions, setGraphCopyOptions] = useState<Set<GraphDataScope>>(
    buildDefaultGraphCopyOptions
  );
  const [isGraphActionInProgress, setIsGraphActionInProgress] = useState(false);
  const [graphActionStatus, setGraphActionStatus] = useState<
    { type: 'success' | 'error'; message: string } | null
  >(null);
  const handleGraphSourceIdChange = useCallback((value: string | null) => {
    setGraphSourceIdDraft(value);

    if (value === null) {
      setGraphCopyOptions(buildDefaultGraphCopyOptions());
    }
  }, []);
  const handleUpdateExpertSkills = useCallback((expertId: string, skills: ExpertSkill[]) => {
    setExpertProfiles((prev) =>
      prev.map((expert) => (expert.id === expertId ? { ...expert, skills } : expert))
    );
  }, []);
  const handleUpdateExpertSoftSkills = useCallback(
    (expertId: string, softSkills: string[]) => {
      setExpertProfiles((prev) =>
        prev.map((expert) => (expert.id === expertId ? { ...expert, softSkills } : expert))
      );
    },
    []
  );


  useLayoutEffect(() => {
    const element = sidebarRef.current;
    if (!element) {
      return;
    }

    const measure = () => {
      const target = sidebarRef.current;
      if (!target) {
        return;
      }

      if (isDomainTreeOpen) {
        return;
      }

      if (!areFiltersOpen) {
        return;
      }

      const height = Math.max(target.getBoundingClientRect().height, 0);
      if (height < 1) {
        return;
      }
      setSidebarBaseHeight((prev) => {
        if (prev === null || Math.abs(prev - height) > 0.5) {
          return height;
        }

        return prev;
      });
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [isDomainTreeOpen, areFiltersOpen]);

  const fetchUsers = useCallback(() => {
    if (!user || user.role !== 'admin') return;
    fetch('/api/users')
      .then((res) => res.json())
      .then((data) => setUsers(data))
      .catch((err) => console.error('Failed to fetch users', err));
  }, [user]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);


  const showAdminNotice = useCallback(
    (type: AdminNotice['type'], message: string) => {
      adminNoticeIdRef.current += 1;
      setAdminNotice({ id: adminNoticeIdRef.current, type, message });
    },
    []
  );

  const dismissAdminNotice = useCallback(() => {
    setAdminNotice(null);
  }, []);

  const handleCreateUser = useCallback(
    (draft: UserDraftPayload) => {
      fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft)
      })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to create user');
          return res.json();
        })
        .then(() => {
          fetchUsers();
          showAdminNotice('success', 'Пользователь успешно создан');
        })
        .catch((err) => {
          console.error(err);
          showAdminNotice('error', 'Не удалось создать пользователя');
        });
    },
    [fetchUsers, showAdminNotice]
  );

  const handleUpdateUser = useCallback(
    (id: string, draft: UserDraftPayload) => {
      fetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft)
      })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to update user');
          return res.json();
        })
        .then(() => {
          fetchUsers();
          showAdminNotice('success', 'Пользователь успешно обновлен');
        })
        .catch((err) => {
          console.error(err);
          showAdminNotice('error', 'Не удалось обновить пользователя');
        });
    },
    [fetchUsers, showAdminNotice]
  );

  const handleDeleteUser = useCallback(
    (id: string) => {
      fetch(`/api/users/${id}`, {
        method: 'DELETE'
      })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to delete user');
          fetchUsers();
          showAdminNotice('success', 'Пользователь успешно удален');
        })
        .catch((err) => {
          console.error(err);
          showAdminNotice('error', 'Не удалось удалить пользователя');
        });
    },
    [fetchUsers, showAdminNotice]
  );

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

  useEffect(() => {
    domainDataRef.current = domainData;
  }, [domainData]);

  useEffect(() => {
    moduleDataRef.current = moduleData;
  }, [moduleData]);

  useEffect(() => {
    artifactDataRef.current = artifactData;
  }, [artifactData]);

  useEffect(() => {
    initiativeDataRef.current = initiativeData;
  }, [initiativeData]);

  useEffect(() => {
    expertProfilesRef.current = expertProfiles;
  }, [expertProfiles]);

  const applySnapshot = useCallback((snapshot: GraphSnapshotPayload) => {
    const scopes = new Set<GraphDataScope>(
      snapshot.scopesIncluded ?? ['domains', 'modules', 'artifacts', 'experts', 'initiatives']
    );

    const currentDomains = domainDataRef.current;
    const currentModules = moduleDataRef.current;
    const currentArtifacts = artifactDataRef.current;
    const currentExperts = expertProfilesRef.current;
    const currentInitiatives = initiativeDataRef.current;

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
    setModuleDataState(recalculateReuseScores(nextModules));
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
  }, []);

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

  const patchInitiative = useCallback(
    (initiativeId: string, updater: (initiative: Initiative) => Initiative) => {
      let didChange = false;
      setInitiativeData((prev) =>
        prev.map((initiative) => {
          if (initiative.id !== initiativeId) {
            return initiative;
          }
          const next = updater(initiative);
          if (next !== initiative) {
            didChange = true;
          }
          return next;
        })
      );
      if (didChange) {
        markGraphDirty();
      }
    },
    [markGraphDirty]
  );

  const handleToggleInitiativePin = useCallback(
    (initiativeId: string, roleId: string, expertId: string) => {
      patchInitiative(initiativeId, (initiative) => {
        let updated = false;
        const roles = initiative.roles.map((role) => {
          if (role.id !== roleId) {
            return role;
          }
          const hasExpert = role.pinnedExpertIds.includes(expertId);
          let nextPinned = hasExpert
            ? role.pinnedExpertIds.filter((id) => id !== expertId)
            : [...role.pinnedExpertIds, expertId];
          if (!hasExpert && role.required > 0 && nextPinned.length > role.required) {
            nextPinned = nextPinned.slice(nextPinned.length - role.required);
          }
          const pinnedChanged =
            nextPinned.length !== role.pinnedExpertIds.length ||
            nextPinned.some((id, index) => role.pinnedExpertIds[index] !== id);

          let workItemsChanged = false;
          let updatedWorkItems: typeof role.workItems = role.workItems;

          if (role.workItems && role.workItems.length > 0) {
            const nextWorkItems = role.workItems.map((item, index) => {
              const nextAssigned =
                nextPinned.length > 0 ? nextPinned[index % nextPinned.length] : undefined;
              if (nextAssigned === item.assignedExpertId) {
                return item;
              }
              workItemsChanged = true;
              return { ...item, assignedExpertId: nextAssigned };
            });
            if (workItemsChanged) {
              updatedWorkItems = nextWorkItems;
            }
          }

          if (!pinnedChanged && !workItemsChanged) {
            return role;
          }
          updated = true;
          return {
            ...role,
            pinnedExpertIds: nextPinned,
            ...(role.workItems ? { workItems: updatedWorkItems } : {})
          };
        });
        if (!updated) {
          return initiative;
        }
        return { ...initiative, roles, lastUpdated: new Date().toISOString() };
      });
    },
    [patchInitiative]
  );

  const handleAddInitiativeRisk = useCallback(
    (
      initiativeId: string,
      payload: { description: string; severity: Initiative['risks'][number]['severity'] }
    ) => {
      const description = payload.description.trim();
      if (!description) {
        return;
      }
      patchInitiative(initiativeId, (initiative) => {
        const riskId = `${initiative.id}-risk-${Date.now()}`;
        const risk = {
          id: riskId,
          description,
          severity: payload.severity,
          createdAt: new Date().toISOString()
        } satisfies Initiative['risks'][number];
        return {
          ...initiative,
          risks: [...initiative.risks, risk],
          lastUpdated: new Date().toISOString()
        };
      });
    },
    [patchInitiative]
  );

  const handleRemoveInitiativeRisk = useCallback(
    (initiativeId: string, riskId: string) => {
      patchInitiative(initiativeId, (initiative) => {
        const nextRisks = initiative.risks.filter((risk) => risk.id !== riskId);
        if (nextRisks.length === initiative.risks.length) {
          return initiative;
        }
        return { ...initiative, risks: nextRisks, lastUpdated: new Date().toISOString() };
      });
    },
    [patchInitiative]
  );

  const handleInitiativeStatusChange = useCallback(
    (initiativeId: string, status: Initiative['status']) => {
      patchInitiative(initiativeId, (initiative) => {
        if (initiative.status === status) {
          return initiative;
        }
        return { ...initiative, status, lastUpdated: new Date().toISOString() };
      });
    },
    [patchInitiative]
  );

  const handleInitiativeExport = useCallback(
    (initiativeId: string) => {
      const initiative = initiativeData.find((item) => item.id === initiativeId);
      if (!initiative) {
        return;
      }
      const expertMap = new Map(expertProfiles.map((expert) => [expert.id, expert]));
      const team: ModuleDraftPayload['projectTeam'] = [];

      initiative.roles.forEach((role) => {
        const orderedCandidates = [...role.candidates].sort((a, b) => b.score - a.score);
        const selected = new Set<string>();
        role.pinnedExpertIds.forEach((id) => {
          if (expertMap.has(id)) {
            selected.add(id);
          }
        });
        for (const candidate of orderedCandidates) {
          if (selected.size >= Math.max(1, role.required)) {
            break;
          }
          if (selected.has(candidate.expertId)) {
            continue;
          }
          if (!expertMap.has(candidate.expertId)) {
            continue;
          }
          selected.add(candidate.expertId);
        }
        Array.from(selected).forEach((expertId) => {
          const expert = expertMap.get(expertId);
          if (!expert) {
            return;
          }
          team.push({
            id: `${initiative.id}-${role.id}-${expertId}`,
            fullName: expert.fullName,
            role: role.role
          });
        });
      });

      const moduleCandidates = [
        ...initiative.plannedModuleIds,
        ...initiative.potentialModules
      ];
      const linkedModule = moduleCandidates
        .map((moduleId) => moduleData.find((module) => module.id === moduleId))
        .find((module): module is ModuleNode => Boolean(module));

      const productName = linkedModule?.productName?.trim()
        ? linkedModule.productName
        : initiative.targetModuleName;

      moduleDraftPrefillIdRef.current += 1;
      const prefillDraft: Partial<ModuleDraftPayload> = {};
      if (!linkedModule) {
        prefillDraft.name = initiative.targetModuleName;
        prefillDraft.productName = productName;
        prefillDraft.domainIds = initiative.domains;
      }
      if (team.length > 0) {
        prefillDraft.projectTeam = team;
      }

      setModuleDraftPrefill({
        id: moduleDraftPrefillIdRef.current,
        mode: linkedModule ? 'edit' : 'create',
        moduleId: linkedModule?.id,
        draft: prefillDraft
      });

      patchInitiative(initiativeId, (current) => {
        if (current.status === 'converted') {
          return { ...current, lastUpdated: new Date().toISOString() };
        }
        return { ...current, status: 'converted', lastUpdated: new Date().toISOString() };
      });

      setViewMode('admin');
      showAdminNotice(
        'success',
        `Команда инициативы «${initiative.name}» передана в черновик модуля.`
      );
    },
    [
      initiativeData,
      expertProfiles,
      moduleData,
      patchInitiative,
      setViewMode,
      showAdminNotice,
      setModuleDraftPrefill
    ]
  );

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

    void persistGraphSnapshot(
      activeGraphId,
      {
        version: GRAPH_SNAPSHOT_VERSION,
        exportedAt: new Date().toISOString(),
        modules: moduleData,
        domains: domainData,
        artifacts: artifactData,
        experts: expertProfiles,
        initiatives: initiativeData,
        layout: { nodes: constrainedLayout }
      },
      { signal: controller.signal }
    );

    return () => {
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
    activeGraphId,
    persistGraphSnapshot
  ]);


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
      setModuleDataState(recalculatedModules);

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
      setViewMode('graph');
      if (createdModule) {
        showAdminNotice('success', `Модуль «${createdModule.name}» создан.`);
      }
    },
    [
      defaultDomainId,
      attachableDomainIdSet,
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

      setModuleDataState(recalculatedModules);

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

      setModuleDataState(recalculateReuseScores(nextModulesBase));
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
        setModuleDataState((prev) =>
          recalculateReuseScores(
            prev.map((module) =>
              moduleSet.has(module.id) && !module.domains.includes(domainId)
                ? { ...module, domains: [...module.domains, domainId] }
                : module
            )
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
      setViewMode('graph');
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
      setModuleDataState((prev) =>
        recalculateReuseScores(
          prev.map((module) => {
            const hasDomain = module.domains.includes(domainId);
            if (moduleSet.has(module.id)) {
              return hasDomain ? module : { ...module, domains: [...module.domains, domainId] };
            }
            return hasDomain
              ? { ...module, domains: module.domains.filter((id) => id !== domainId) }
              : module;
          })
        )
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
      setModuleDataState((prev) =>
        recalculateReuseScores(
          prev.map((module) => ({
            ...module,
            domains: module.domains.filter((id) => !removedIds.has(id))
          }))
        )
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

      setModuleDataState((prev) =>
        recalculateReuseScores(
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
        )
      );

      setSelectedNode({ ...newArtifact, type: 'artifact', reuseScore: 0 });
      setSelectedDomains((prev) => {
        const next = new Set(prev);
        next.add(domainId);
        return next;
      });
      setViewMode('graph');
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

      setModuleDataState((prev) =>
        recalculateReuseScores(
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
              const outputIndex = dataOut.findIndex(
                (output) => output.artifactId === artifactId
              );
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

            if (
              produces !== module.produces ||
              dataOut !== module.dataOut ||
              dataIn !== module.dataIn
            ) {
              next = { ...module, produces, dataOut, dataIn };
            }

            return next;
          })
        )
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

      setModuleDataState((prev) =>
        recalculateReuseScores(
          prev.map((module) => ({
            ...module,
            produces: module.produces.filter((id) => id !== artifactId),
            dataOut: module.dataOut.filter((output) => output.label !== existing.name),
            dataIn: module.dataIn.filter((input) => input.sourceId !== artifactId)
          }))
        )
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

  const handlePlannerCreateInitiative = useCallback(
    (request: InitiativeCreationRequest): Initiative => {
      const existingIds = new Set(initiativeData.map((initiative) => initiative.id));
      const initiativeId = createEntityId('initiative', request.name, existingIds);
      const expertNameById = new Map(expertProfiles.map((expert) => [expert.id, expert.fullName]));
      const normalizedName = request.name.trim() || `Новая инициатива ${existingIds.size + 1}`;
      const normalizedDescription = request.description.trim() || 'Описание не заполнено';
      const normalizedOwner = request.owner.trim() || 'Ответственный не указан';
      const normalizedImpact = request.expectedImpact.trim() || 'Эффект не оценён';
      const normalizedTarget = request.targetModuleName.trim() || normalizedName;
      const normalizedStartDate = request.startDate?.trim() || new Date().toISOString().slice(0, 10);
      const domains = request.domains.map((domain) => domain.trim()).filter(Boolean);
      const { potentialModules, plannedModuleIds } = preparePlannerModuleSelections(
        request.potentialModules
      );
      const roleEntries = request.roles.map((role, index) => {
        const roleId = role.id?.trim() || `${initiativeId}-role-${index + 1}`;
        const sanitizedWorkItems = role.workItems.map((item, workIndex) => ({
          id: item.id?.trim() || `${roleId}-work-${workIndex + 1}`,
          title: item.title.trim() || `Работа ${workIndex + 1}`,
          description: item.description.trim() || 'Описание не заполнено',
          startDay: Math.max(0, Math.round(item.startDay)),
          durationDays: Math.max(1, Math.round(item.durationDays)),
          effortDays: Math.max(1, Math.round(item.effortDays)),
          tasks: (item.tasks ?? [])
            .map((task) => task.skill.trim())
            .filter(Boolean)
        }));

        return {
          draft: {
            id: roleId,
            role: role.role,
            required: Math.max(1, Math.round(role.required)),
            skills: role.skills.map((skill) => skill.trim()).filter(Boolean),
            workItems: sanitizedWorkItems
          } satisfies RolePlanningDraft,
          comment: role.comment?.trim() || undefined
        };
      });

      const planningRoles = roleEntries.map((entry) => entry.draft);
      const matchReports = buildRoleMatchReports(planningRoles, expertProfiles);

      const roles: InitiativeRolePlan[] = planningRoles.map((planningRole, index) => {
        const report = matchReports[index];
        const candidates = buildCandidatesFromReport(report);
        const pinnedExpertIds = selectPinnedExperts(candidates, planningRole.required);
        const workItems: InitiativeRoleWork[] = assignExpertsToWorkItems(
          planningRole.workItems,
          pinnedExpertIds
        );

        return {
          id: planningRole.id,
          role: planningRole.role,
          required: planningRole.required,
          pinnedExpertIds,
          candidates,
          workItems
        };
      });

      const requiredSkillLabels = new Set<string>();
      const workScheduleLookup = new Map<
        string,
        { startDay: number; durationDays: number; roleName: InitiativeRolePlan['role'] }
      >();
      roleEntries.forEach((entry) => {
        entry.draft.skills.forEach((skillId) => {
          if (!skillId) {
            return;
          }
          requiredSkillLabels.add(getSkillNameById(skillId) ?? skillId);
        });
        entry.draft.workItems.forEach((item) => {
          workScheduleLookup.set(item.id, {
            startDay: item.startDay,
            durationDays: item.durationDays,
            roleName: entry.draft.role
          });
          item.tasks.forEach((taskId) => {
            if (!taskId) {
              return;
            }
            requiredSkillLabels.add(getSkillNameById(taskId) ?? taskId);
          });
        });
      });

      const requiredSkills = Array.from(requiredSkillLabels).sort((a, b) =>
        a.localeCompare(b, 'ru')
      );

      const assignedExpertNameByWorkItem = new Map<string, string>();
      roles.forEach((rolePlan) => {
        (rolePlan.workItems ?? []).forEach((item) => {
          if (!item.assignedExpertId) {
            return;
          }
          const expertName = expertNameById.get(item.assignedExpertId) ?? item.assignedExpertId;
          assignedExpertNameByWorkItem.set(item.id, expertName);
        });
      });

      const normalizedWorkItemsFromRequest: InitiativeWorkItem[] = (request.workItems ?? []).map(
        (item, index) => {
          const rawId = item.id?.trim() ?? '';
          const lookupKey = rawId || item.id || '';
          const schedule = lookupKey ? workScheduleLookup.get(lookupKey) : undefined;
          const id = rawId || `${initiativeId}-timeline-${index + 1}`;
          const title = item.title.trim() || `Работа ${index + 1}`;
          const description = item.description.trim() || 'Описание не заполнено';
          const ownerCandidate = item.owner.trim();
          const owner =
            ownerCandidate ||
            (lookupKey ? assignedExpertNameByWorkItem.get(lookupKey) : undefined) ||
            (schedule ? schedule.roleName : undefined) ||
            normalizedOwner;
          const timeframeCandidate = item.timeframe.trim();
          const timeframe =
            timeframeCandidate ||
            (schedule
              ? `Д${schedule.startDay + 1} – Д${schedule.startDay + schedule.durationDays}`
              : 'Срок не определён');
          const status = item.status ?? 'discovery';

          return {
            id,
            title,
            description,
            owner,
            status,
            timeframe
          } satisfies InitiativeWorkItem;
        }
      );

      const fallbackStatusOrder: InitiativeWorkItemStatus[] = [
        'discovery',
        'design',
        'pilot',
        'delivery'
      ];
      let fallbackStatusIndex = 0;
      const fallbackWorkItemMap = new Map<string, InitiativeWorkItem>();
      roleEntries.forEach((entry) => {
        entry.draft.workItems.forEach((item) => {
          if (fallbackWorkItemMap.has(item.id)) {
            return;
          }
          const schedule = workScheduleLookup.get(item.id);
          const timeframe = schedule
            ? `Д${schedule.startDay + 1} – Д${schedule.startDay + schedule.durationDays}`
            : 'Срок не определён';
          const status =
            fallbackStatusOrder[
            Math.min(fallbackStatusOrder.length - 1, fallbackStatusIndex)
            ];
          fallbackStatusIndex += 1;
          fallbackWorkItemMap.set(item.id, {
            id: item.id,
            title: item.title,
            description: item.description,
            owner: schedule?.roleName ?? entry.draft.role,
            status,
            timeframe
          });
        });
      });

      const workItemsSource =
        normalizedWorkItemsFromRequest.length > 0
          ? normalizedWorkItemsFromRequest
          : Array.from(fallbackWorkItemMap.values());

      const workItems: InitiativeWorkItem[] = workItemsSource.filter(
        (item, index, array) =>
          array.findIndex((candidate) => candidate.id === item.id) === index
      );

      const approvalStages: InitiativeApprovalStage[] = [];
      (request.approvalStages ?? []).forEach((stage, index) => {
        const trimmedTitle = stage.title.trim();
        const trimmedApprover = stage.approver.trim();
        const trimmedComment = stage.comment?.trim() ?? '';
        if (!trimmedTitle && !trimmedApprover && !trimmedComment) {
          return;
        }
        approvalStages.push({
          id: stage.id?.trim() || `${initiativeId}-approval-${index + 1}`,
          title: trimmedTitle || `Этап согласования ${index + 1}`,
          approver: trimmedApprover || 'Не назначен',
          status: stage.status ?? 'pending',
          comment: trimmedComment || undefined
        });
      });

      const works: InitiativeWork[] = roles.flatMap((rolePlan) =>
        (rolePlan.workItems ?? []).map((item) => ({
          id: `${rolePlan.id}-${item.id}`,
          title: item.title,
          description: item.description,
          effortHours: Math.max(0, Math.round(item.effortDays)) * 8
        }))
      );

      const requirements: InitiativeRequirement[] = roleEntries.map((entry) => ({
        id: `${entry.draft.id}-req`,
        role: entry.draft.role,
        skills: entry.draft.skills,
        count: entry.draft.required,
        comment: entry.comment
      }));

      const initiative: Initiative = {
        id: initiativeId,
        name: normalizedName,
        description: normalizedDescription,
        domains,
        plannedModuleIds,
        requiredSkills,
        workItems,
        approvalStages,
        startDate: normalizedStartDate,
        status: request.status,
        owner: normalizedOwner,
        expectedImpact: normalizedImpact,
        targetModuleName: normalizedTarget,
        lastUpdated: new Date().toISOString(),
        risks: [],
        roles,
        potentialModules,
        works,
        requirements,
        customer: {
          companies: request.customer.companies
            .map((value) => value.trim())
            .filter((value) => value.length > 0),
          units: request.customer.units
            .map((value) => value.trim())
            .filter((value) => value.length > 0),
          representative: request.customer.representative.trim(),
          contact: request.customer.contact.trim(),
          comment: request.customer.comment?.trim() || undefined
        }
      };

      markGraphDirty();
      setInitiativeData((prev) => [...prev, initiative]);
      showAdminNotice('success', `Инициатива «${initiative.name}» создана.`);
      return initiative;
    },
    [expertProfiles, initiativeData, markGraphDirty, showAdminNotice]
  );

  const handlePlannerUpdateInitiative = useCallback(
    (initiativeId: string, request: InitiativeCreationRequest): Initiative => {
      const existing = initiativeData.find((initiative) => initiative.id === initiativeId);
      if (!existing) {
        throw new Error('Инициатива не найдена. Обновление невозможно.');
      }

      const normalizedName = request.name.trim() || existing.name;
      const normalizedDescription = request.description.trim() || existing.description;
      const normalizedOwner = request.owner.trim() || existing.owner;
      const normalizedImpact = request.expectedImpact.trim() || existing.expectedImpact;
      const normalizedTarget = request.targetModuleName.trim() || existing.targetModuleName;
      const normalizedStartDate = request.startDate?.trim() || existing.startDate || new Date().toISOString().slice(0, 10);
      const domains = request.domains.map((domain) => domain.trim()).filter(Boolean);
      const { potentialModules, plannedModuleIds } = preparePlannerModuleSelections(
        request.potentialModules
      );

      const roleEntries = request.roles.map((role, index) => {
        const roleId = role.id?.trim() || `${initiativeId}-role-${index + 1}`;
        const sanitizedWorkItems = role.workItems.map((item, workIndex) => ({
          id: item.id?.trim() || `${roleId}-work-${workIndex + 1}`,
          title: item.title.trim() || `Работа ${workIndex + 1}`,
          description: item.description.trim() || 'Описание не заполнено',
          startDay: Math.max(0, Math.round(item.startDay)),
          durationDays: Math.max(1, Math.round(item.durationDays)),
          effortDays: Math.max(1, Math.round(item.effortDays)),
          tasks: (item.tasks ?? [])
            .map((task) => task.skill.trim())
            .filter(Boolean)
        }));

        return {
          draft: {
            id: roleId,
            role: role.role,
            required: Math.max(1, Math.round(role.required)),
            skills: role.skills.map((skill) => skill.trim()).filter(Boolean),
            workItems: sanitizedWorkItems
          } satisfies RolePlanningDraft,
          comment: role.comment?.trim() || undefined
        };
      });

      const planningRoles = roleEntries.map((entry) => entry.draft);
      const matchReports = buildRoleMatchReports(planningRoles, expertProfiles);

      const roles: InitiativeRolePlan[] = planningRoles.map((planningRole, index) => {
        const report = matchReports[index];
        const candidates = buildCandidatesFromReport(report);
        const pinnedExpertIds = selectPinnedExperts(candidates, planningRole.required);
        const workItems: InitiativeRoleWork[] = assignExpertsToWorkItems(
          planningRole.workItems,
          pinnedExpertIds
        );

        return {
          id: planningRole.id,
          role: planningRole.role,
          required: planningRole.required,
          pinnedExpertIds,
          candidates,
          workItems
        };
      });

      const works: InitiativeWork[] = roles.flatMap((rolePlan) =>
        (rolePlan.workItems ?? []).map((item) => ({
          id: `${rolePlan.id}-${item.id}`,
          title: item.title,
          description: item.description,
          effortHours: Math.max(0, Math.round(item.effortDays)) * 8
        }))
      );

      const requirements: InitiativeRequirement[] = roleEntries.map((entry) => ({
        id: `${entry.draft.id}-req`,
        role: entry.draft.role,
        skills: entry.draft.skills,
        count: entry.draft.required,
        comment: entry.comment
      }));

      const updated: Initiative = {
        ...existing,
        name: normalizedName,
        description: normalizedDescription,
        domains,
        plannedModuleIds,
        status: request.status,
        owner: normalizedOwner,
        expectedImpact: normalizedImpact,
        targetModuleName: normalizedTarget,
        startDate: normalizedStartDate,
        lastUpdated: new Date().toISOString(),
        roles,
        potentialModules,
        works,
        requirements,
        customer: {
          companies: request.customer.companies ?? [],
          units: request.customer.units ?? [],
          representative: request.customer.representative.trim(),
          contact: request.customer.contact.trim(),
          comment: request.customer.comment?.trim() || undefined
        }
      };

      markGraphDirty();
      setInitiativeData((prev) =>
        prev.map((initiative) => (initiative.id === initiativeId ? updated : initiative))
      );

      return updated;
    },
    [expertProfiles, initiativeData, markGraphDirty]
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
    return <Login />;
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

  return (
    <ThemeContainer preset={themePreset} themeKey={themeMode}>
      <LayoutShell
        currentView={viewMode}
        onViewChange={setViewMode}
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
          <div className={styles.loadingState} style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
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
                className={`${styles.noticeBanner} ${adminNotice.type === 'success' ? styles.noticeSuccess : styles.noticeError
                  }`}
                role={adminNotice.type === 'error' ? 'alert' : 'status'}
                aria-live={adminNotice.type === 'error' ? 'assertive' : 'polite'}
              >
                <Text
                  size="s"
                  view="primary"
                  className={styles.noticeMessage}
                >
                  {adminNotice.message}
                </Text>
                <Button size="xs" view="ghost" label="Скрыть" onClick={dismissAdminNotice} />
              </div>
            )}
            <GraphContainer
              isActive={isGraphActive}
              pageVariants={pageVariants}
              sidebarRef={sidebarRef}
              sidebarMaxHeight={sidebarMaxHeight}
              isDomainTreeOpen={isDomainTreeOpen}
              onToggleDomainTree={() => setIsDomainTreeOpen((prev) => !prev)}
              areFiltersOpen={areFiltersOpen}
              onToggleFilters={() => setAreFiltersOpen((prev) => !prev)}
              onToggleDomain={handleDomainToggle}
              domainDescendants={domainDescendants}
              onSearchChange={handleSearchChange}
              allStatuses={allStatuses}
              onStatusToggle={(status) => {
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
              }}
              products={products}
              onProductFilterChange={(nextProducts) => {
                setSelectedNode(null);
                setProductFilter(nextProducts);
              }}
              companies={companies}
              onCompanyChange={(nextCompany) => {
                setSelectedNode(null);
                setCompanyFilter(nextCompany);
              }}
              onToggleConnections={(value) => setShowAllConnections(value)}
              graphModules={graphModules}
              graphDomains={graphDomains}
              graphArtifacts={graphArtifacts}
              graphInitiatives={graphInitiatives}
              filteredLinks={filteredLinks}
              graphVersion={`${activeGraphId ?? 'local'}:${graphRenderEpoch}`}
              onSelectNode={handleSelectNode}
              selectedNode={selectedNode}
              visibleDomainIds={relevantDomainIds}
              onLayoutChange={handleLayoutChange}
              shouldShowAnalytics={shouldShowAnalytics}
              filteredModules={filteredModules}
              domainNameMap={domainNameMap}
              moduleNameMap={moduleNameMap}
              artifactNameMap={artifactNameMap}
              expertProfiles={expertProfiles}
              onNavigate={handleNavigate}
            />
            {(statsActivated || isStatsActive) && (
              <motion.main
                className={styles.statsMain}
                initial="hidden"
                animate={isStatsActive ? 'visible' : 'hidden'}
                variants={pageVariants}
              >
                <Suspense fallback={<Loader size="m" />}>
                  <StatsDashboard
                    modules={moduleData}
                    domains={domainData}
                    artifacts={artifactData}
                    reuseHistory={reuseIndexHistory}
                  />
                </Suspense>
              </motion.main>
            )}
            <ExpertsContainer
              isActive={isExpertsActive}
              pageVariants={pageVariants}
              experts={expertProfiles}
              modules={moduleData}
              moduleNameMap={moduleNameMap}
              moduleDomainMap={moduleDomainMap}
              domainNameMap={domainNameMap}
              initiatives={initiativeData}
              onUpdateExpertSkills={handleUpdateExpertSkills}
              onUpdateExpertSoftSkills={handleUpdateExpertSoftSkills}
            />
            <InitiativesContainer
              isActive={isInitiativesActive}
              pageVariants={pageVariants}
              initiatives={initiativeData}
              experts={expertProfiles}
              domains={domainData}
              modules={moduleData}
              domainNameMap={domainNameMap}
              employeeTasks={employeeTasks}
              onTogglePin={handleToggleInitiativePin}
              onAddRisk={handleAddInitiativeRisk}
              onRemoveRisk={handleRemoveInitiativeRisk}
              onStatusChange={handleInitiativeStatusChange}
              onExport={handleInitiativeExport}
              onCreateInitiative={handlePlannerCreateInitiative}
              onUpdateInitiative={handlePlannerUpdateInitiative}
            />
            <EmployeeTasksContainer
              isActive={isEmployeeTasksActive}
              pageVariants={pageVariants}
              experts={expertProfiles}
              initiatives={initiativeData}
              tasks={employeeTasks}
              onTasksChange={setEmployeeTasks}
            />
            <AdminContainer
              isActive={isAdminActive}
              pageVariants={pageVariants}
              modules={moduleData}
              domains={domainData}
              artifacts={artifactData}
              experts={expertProfiles}
              initiatives={initiativeData}
              employeeTasks={employeeTasks}
              moduleDraftPrefill={moduleDraftPrefill}
              onModuleDraftPrefillApplied={handleModuleDraftPrefillApplied}
              onCreateModule={handleCreateModule}
              onUpdateModule={handleUpdateModule}
              onDeleteModule={handleDeleteModule}
              onCreateDomain={handleCreateDomain}
              onUpdateDomain={handleUpdateDomain}
              onDeleteDomain={handleDeleteDomain}
              onCreateArtifact={handleCreateArtifact}
              onUpdateArtifact={handleUpdateArtifact}
              onDeleteArtifact={handleDeleteArtifact}
              onCreateExpert={handleCreateExpert}
              onUpdateExpert={handleUpdateExpert}
              onDeleteExpert={handleDeleteExpert}
              onUpdateEmployeeTasks={setEmployeeTasks}
              users={users}
              onCreateUser={handleCreateUser}
              onUpdateUser={handleUpdateUser}
              onDeleteUser={handleDeleteUser}
              currentUser={user}
              graphs={graphs}
              activeGraphId={activeGraphId}
              onGraphSelect={handleGraphSelect}
              onGraphCreate={handleCreateGraph}
              onGraphDelete={activeGraphId ? () => handleDeleteGraph(activeGraphId) : undefined}
              isGraphListLoading={isGraphsLoading}
              syncStatus={syncStatus}
              layout={layoutSnapshot}
              isSyncAvailable={isSyncAvailable}
              onImport={handleImportGraph}
              onImportFromGraph={handleImportFromExistingGraph}
              onRetryLoad={handleRetryLoadSnapshot}
              isReloading={isReloadingSnapshot}
            />
          </>
        )}
      </LayoutShell>
    </ThemeContainer>
  );
}

type ModuleBuildResult = {
  module: ModuleNode;
  consumedArtifactIds: string[];
};

function buildExpertFromDraft(
  expertId: string,
  draft: ExpertDraftPayload,
  options: {
    domainIdSet: Set<string>;
    moduleIdSet: Set<string>;
    fallbackName: string;
    fallbackProfile?: ExpertProfile;
    moduleNameMap: Record<string, string>;
  }
): ExpertProfile {
  const fallback = options.fallbackProfile;
  const fullName = draft.fullName.trim() || fallback?.fullName || options.fallbackName;
  const title = draft.title.trim() || fallback?.title || 'Роль не указана';
  const summary = draft.summary.trim() || fallback?.summary || 'Описание не заполнено';

  const domains = deduplicateNonEmpty(draft.domains).filter((id) => options.domainIdSet.has(id));
  const modules = deduplicateNonEmpty(draft.modules).filter((id) => options.moduleIdSet.has(id));
  const competencies = deduplicateNonEmpty(draft.competencies);
  const competencyRecordLookup = new Map<string, ExpertCompetencyRecord>();
  (draft.competencyRecords ?? []).forEach((record) => {
    const name = record.name.trim();
    if (!name || competencyRecordLookup.has(name)) {
      return;
    }
    const normalized: ExpertCompetencyRecord = { name };
    if (record.level) {
      normalized.level = record.level;
    }
    if (record.proofStatus) {
      normalized.proofStatus = record.proofStatus;
    }
    competencyRecordLookup.set(name, normalized);
  });
  const competencyRecords = competencies.map(
    (name) => competencyRecordLookup.get(name) ?? { name }
  );
  const consultingSkills = deduplicateNonEmpty(draft.consultingSkills);
  const softSkills = deduplicateNonEmpty(draft.softSkills ?? []);
  const focusAreas = deduplicateNonEmpty(draft.focusAreas);
  const languages = deduplicateNonEmpty(draft.languages);
  const moduleNames = modules
    .map((id) => options.moduleNameMap[id] ?? id)
    .filter((name): name is string => Boolean(name && name.trim()));
  const notableProjects = deduplicateNonEmpty(moduleNames);

  const experienceYears = Math.max(0, Math.round(draft.experienceYears ?? 0));
  const location = draft.location.trim() || fallback?.location || 'Локация не указана';
  const contact = draft.contact.trim() || fallback?.contact || 'Контакт не указан';
  const availabilityComment =
    draft.availabilityComment.trim() || fallback?.availabilityComment || 'Комментариев по доступности нет';

  const skills = draft.skills.map((skill) => ({
    ...skill,
    artifacts: [...skill.artifacts],
    usage: skill.usage ? { ...skill.usage } : undefined,
    createdAt: skill.createdAt ?? new Date().toISOString()
  }));

  return {
    id: expertId,
    fullName,
    title,
    summary,
    domains,
    modules,
    competencies,
    competencyRecords,
    consultingSkills,
    softSkills,
    focusAreas,
    experienceYears,
    location,
    contact,
    languages,
    notableProjects,
    availability: draft.availability,
    availabilityComment,
    skills
  };
}

function buildModuleFromDraft(
  moduleId: string,
  draft: ModuleDraftPayload,
  fallbackDomains: string[],
  allowedDomainIds: Set<string>,
  options: { fallbackName: string }
): ModuleBuildResult | null {
  const normalizedName = draft.name.trim() || options.fallbackName;
  const normalizedDescription = draft.description.trim() || 'Описание не заполнено';
  const normalizedProduct = draft.productName.trim() || 'Новый продукт';
  const normalizedCreatorCompany =
    draft.creatorCompany.trim() || 'Компания создатель не указана';

  const uniqueDomains = deduplicateNonEmpty(draft.domainIds).filter((id) => allowedDomainIds.has(id));
  const fallbackCandidates = deduplicateNonEmpty(fallbackDomains).filter((id) => allowedDomainIds.has(id));
  const resolvedDomains = uniqueDomains.length > 0 ? uniqueDomains : fallbackCandidates;
  if (resolvedDomains.length === 0) {
    return null;
  }

  const dependencies = deduplicateNonEmpty(draft.dependencyIds).filter((id) => id !== moduleId);

  const preparedInputs = (draft.dataIn.length > 0 ? draft.dataIn : [{ id: '', label: '', sourceId: undefined }]).map((input, index) => ({
    id: input.id?.trim() || `input-${index + 1}`,
    label: input.label.trim() || `Вход ${index + 1}`,
    sourceId: input.sourceId?.trim() || undefined
  }));
  const consumedArtifactIds = deduplicateNonEmpty(preparedInputs.map((input) => input.sourceId ?? null));

  const preparedOutputs = (draft.dataOut.length > 0
    ? draft.dataOut
    : [{ id: '', label: '', artifactId: undefined }]
  ).map((output, index) => ({
    id: output.id?.trim() || `output-${index + 1}`,
    label: output.label.trim() || `Выход ${index + 1}`,
    artifactId: output.artifactId?.trim() || undefined
  }));
  const produces = deduplicateNonEmpty(preparedOutputs.map((output) => output.artifactId ?? null));

  const technologyStack = deduplicateNonEmpty(draft.technologyStack.map((item) => item.trim())).filter(Boolean);

  const preparedTeam = (draft.projectTeam.length > 0 ? draft.projectTeam : [{ id: '', fullName: '', role: 'Аналитик' }]).map((member, index) => ({
    id: member.id?.trim() || `member-${index + 1}`,
    fullName: member.fullName.trim() || `Участник ${index + 1}`,
    role: member.role
  }));

  const libraries = draft.libraries
    .map((library) => ({ name: library.name.trim(), version: library.version.trim() }))
    .filter((library) => library.name || library.version)
    .map((library) => ({
      name: library.name || 'Не указано',
      version: library.version || '—'
    }));

  const ridOwnerCompany = draft.ridOwner.company.trim() || 'Не указано';
  const ridOwnerDivision = draft.ridOwner.division.trim() || 'Не указано';

  const localization = draft.localization.trim() || 'ru';

  const normalizedCompanies = draft.userStats.companies
    .map((company) => {
      const name = company.name?.trim() ?? '';
      const licenses = Math.max(
        0,
        Math.trunc(typeof company.licenses === 'number' ? company.licenses : 0)
      );
      if (!name) {
        return null;
      }
      return { name, licenses };
    })
    .filter((company): company is { name: string; licenses: number } => company !== null);

  const mergedCompanies = new Map<string, number>();
  normalizedCompanies.forEach((company) => {
    mergedCompanies.set(company.name, (mergedCompanies.get(company.name) ?? 0) + company.licenses);
  });

  const userStats = {
    companies: Array.from(mergedCompanies.entries())
      .map(([name, licenses]) => ({ name, licenses }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  };

  const reuseScore = clampNumber(draft.reuseScore ?? 0, 0, 100);
  const metrics: ModuleMetrics = {
    coverage: clampNumber(draft.metrics.coverage ?? 0, 0, 100),
    tests: Math.max(0, draft.metrics.tests ?? 0),
    automationRate: clampNumber(draft.metrics.automationRate ?? 0, 0, 100)
  };

  const nonFunctional: NonFunctionalRequirements = {
    responseTimeMs: Math.max(0, draft.nonFunctional.responseTimeMs ?? 0),
    throughputRps: Math.max(0, draft.nonFunctional.throughputRps ?? 0),
    resourceConsumption: draft.nonFunctional.resourceConsumption.trim() || '—',
    baselineUsers: Math.max(0, draft.nonFunctional.baselineUsers ?? 0)
  };

  const module: ModuleNode = {
    id: moduleId,
    name: normalizedName,
    description: normalizedDescription,
    domains: resolvedDomains,
    creatorCompany: normalizedCreatorCompany,
    productName: normalizedProduct,
    projectTeam: preparedTeam,
    technologyStack,
    localization,
    ridOwner: { company: ridOwnerCompany, division: ridOwnerDivision },
    userStats,
    status: draft.status,
    repository: draft.repository?.trim() || undefined,
    api: draft.api?.trim() || undefined,
    specificationUrl: draft.specificationUrl.trim() || '#',
    apiContractsUrl: draft.apiContractsUrl.trim() || '#',
    techDesignUrl: draft.techDesignUrl.trim() || '#',
    architectureDiagramUrl: draft.architectureDiagramUrl.trim() || '#',
    licenseServerIntegrated: draft.licenseServerIntegrated,
    libraries,
    clientType: draft.clientType,
    deploymentTool: draft.deploymentTool,
    dependencies,
    produces,
    reuseScore,
    metrics,
    dataIn: preparedInputs,
    dataOut: preparedOutputs,
    formula: draft.formula.trim(),
    nonFunctional
  };

  return { module, consumedArtifactIds };
}

function recalculateReuseScores(modules: ModuleNode[]): ModuleNode[] {
  if (modules.length === 0) {
    return modules;
  }

  const integrationMap = buildModuleIntegrationMap(modules);
  const denominator = Math.max(1, modules.length - 1);

  return modules.map((module) => {
    const connections = integrationMap.get(module.id);
    const score = connections ? Math.min(1, connections.size / denominator) : 0;
    return { ...module, reuseScore: score };
  });
}

function buildModuleIntegrationMap(modules: ModuleNode[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();

  modules.forEach((module) => {
    map.set(module.id, new Set());
  });

  const artifactConsumers = new Map<string, Set<string>>();

  modules.forEach((module) => {
    module.dataIn.forEach((input) => {
      if (!input.sourceId) {
        return;
      }
      const consumers = artifactConsumers.get(input.sourceId) ?? new Set<string>();
      consumers.add(module.id);
      artifactConsumers.set(input.sourceId, consumers);
    });
  });

  modules.forEach((module) => {
    module.dependencies.forEach((dependencyId) => {
      if (!map.has(dependencyId) || dependencyId === module.id) {
        return;
      }
      map.get(module.id)?.add(dependencyId);
      map.get(dependencyId)?.add(module.id);
    });

    module.dataOut.forEach((output) => {
      if (!output.artifactId) {
        return;
      }
      const consumers = artifactConsumers.get(output.artifactId);
      consumers?.forEach((consumerId) => {
        if (!map.has(consumerId) || consumerId === module.id) {
          return;
        }
        map.get(module.id)?.add(consumerId);
        map.get(consumerId)?.add(module.id);
      });
    });
  });

  return map;
}

function clampNumber(value: number, min: number, max: number): number {
  const normalized = Number.isFinite(value) ? value : min;
  if (normalized < min) {
    return min;
  }
  if (normalized > max) {
    return max;
  }
  return normalized;
}

function buildCompanyList(modules: ModuleNode[]): string[] {
  const names = new Set<string>();

  modules.forEach((module) => {
    module.userStats.companies.forEach((company) => {
      const normalized = company.name.trim();
      if (normalized) {
        names.add(normalized);
      }
    });
  });

  return Array.from(names).sort((a, b) => a.localeCompare(b, 'ru'));
}

function buildProductList(modules: ModuleNode[]): string[] {
  const products = new Set<string>();
  modules.forEach((module) => {
    if (module.productName) {
      products.add(module.productName);
    }
  });
  return Array.from(products).sort((a, b) => a.localeCompare(b, 'ru'));
}

function normalizeLayoutPositions(
  positions: Record<string, GraphLayoutNodePosition>,
  maxSpan = MAX_LAYOUT_SPAN
): { positions: Record<string, GraphLayoutNodePosition>; changed: boolean } {
  const entries = Object.entries(positions);
  if (entries.length === 0) {
    return { positions, changed: false };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  entries.forEach(([, position]) => {
    if (!position) {
      return;
    }

    if (typeof position.x === 'number' && Number.isFinite(position.x)) {
      minX = Math.min(minX, position.x);
      maxX = Math.max(maxX, position.x);
    }

    if (typeof position.y === 'number' && Number.isFinite(position.y)) {
      minY = Math.min(minY, position.y);
      maxY = Math.max(maxY, position.y);
    }
  });

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return { positions, changed: false };
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const span = Math.max(width, height);

  if (!Number.isFinite(span) || span <= 0 || span <= maxSpan) {
    return { positions, changed: false };
  }

  const scale = maxSpan / span;
  if (!Number.isFinite(scale) || scale <= 0) {
    return { positions, changed: false };
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  let changed = false;
  const normalized: Record<string, GraphLayoutNodePosition> = {};

  entries.forEach(([id, position]) => {
    if (!position) {
      return;
    }

    const { x, y, fx, fy } = position;
    if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) {
      normalized[id] = position;
      return;
    }

    const normalizedX = roundCoordinate(centerX + (x - centerX) * scale);
    const normalizedY = roundCoordinate(centerY + (y - centerY) * scale);
    const next: GraphLayoutNodePosition = { x: normalizedX, y: normalizedY };

    if (typeof fx === 'number' && Number.isFinite(fx)) {
      const normalizedFx = roundCoordinate(centerX + (fx - centerX) * scale);
      next.fx = normalizedFx;
      if (normalizedFx !== fx) {
        changed = true;
      }
    }

    if (typeof fy === 'number' && Number.isFinite(fy)) {
      const normalizedFy = roundCoordinate(centerY + (fy - centerY) * scale);
      next.fy = normalizedFy;
      if (normalizedFy !== fy) {
        changed = true;
      }
    }

    if (normalizedX !== x || normalizedY !== y) {
      changed = true;
    }

    normalized[id] = next;
  });

  if (!changed) {
    return { positions, changed: false };
  }

  return { positions: normalized, changed: true };
}

function needsEngineLayoutCapture(
  layout: Record<string, GraphLayoutNodePosition>,
  activeIds: Set<string>
): boolean {
  for (const id of activeIds) {
    const position = layout[id];
    if (!position) {
      return true;
    }

    if (typeof position.x !== 'number' || Number.isNaN(position.x)) {
      return true;
    }

    if (typeof position.y !== 'number' || Number.isNaN(position.y)) {
      return true;
    }
  }

  return false;
}

function mergeLayoutPositions(
  prev: Record<string, GraphLayoutNodePosition>,
  next: Record<string, GraphLayoutNodePosition>
): Record<string, GraphLayoutNodePosition> {
  const merged: Record<string, GraphLayoutNodePosition> = { ...prev };

  Object.entries(next).forEach(([id, position]) => {
    const existing = merged[id];
    if (!existing || !layoutPositionsEqual(existing, position)) {
      merged[id] = position;
    }
  });

  return merged;
}

function pruneLayoutPositions(
  positions: Record<string, GraphLayoutNodePosition>,
  activeIds: Set<string>
): Record<string, GraphLayoutNodePosition> {
  const result: Record<string, GraphLayoutNodePosition> = {};

  Object.entries(positions).forEach(([id, position]) => {
    if (activeIds.has(id)) {
      result[id] = position;
    }
  });

  return result;
}

function layoutsEqual(
  prev: Record<string, GraphLayoutNodePosition>,
  next: Record<string, GraphLayoutNodePosition>
): boolean {
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);

  if (prevKeys.length !== nextKeys.length) {
    return false;
  }

  return prevKeys.every((key) => {
    const prevPosition = prev[key];
    const nextPosition = next[key];

    if (!nextPosition) {
      return false;
    }

    return layoutPositionsEqual(prevPosition, nextPosition);
  });
}

function layoutPositionsEqual(
  prev: GraphLayoutNodePosition,
  next: GraphLayoutNodePosition
): boolean {
  if (prev.x !== next.x || prev.y !== next.y) {
    return false;
  }

  const prevFx = prev.fx ?? null;
  const nextFx = next.fx ?? null;
  if (prevFx !== nextFx) {
    return false;
  }

  const prevFy = prev.fy ?? null;
  const nextFy = next.fy ?? null;
  return prevFy === nextFy;
}

function resolveInitialModulePosition(
  positions: Record<string, GraphLayoutNodePosition>,
  anchorIds: string[]
): GraphLayoutNodePosition | null {
  const anchors = anchorIds
    .map((id) => positions[id])
    .filter((position): position is GraphLayoutNodePosition => Boolean(position));
  const fallbackEntries = Object.values(positions);

  const anchorValues = extractAxisValues(anchors);
  const fallbackValues = extractAxisValues(fallbackEntries);

  const xValues = anchorValues.x.length > 0 ? anchorValues.x : fallbackValues.x;
  const yValues = anchorValues.y.length > 0 ? anchorValues.y : fallbackValues.y;

  if (xValues.length === 0 || yValues.length === 0) {
    return { x: 0, y: 0 };
  }

  const anchorAverageX = anchorValues.x.length > 0
    ? anchorValues.x.reduce((sum, value) => sum + value, 0) / anchorValues.x.length
    : Math.max(...xValues);
  const averageY = yValues.reduce((sum, value) => sum + value, 0) / yValues.length;

  const horizontalOffset = anchorValues.x.length > 0 ? 80 : 140;
  const jitterSeed = Object.keys(positions).length;
  const verticalJitter = ((jitterSeed % 5) - 2) * 45;

  return {
    x: roundCoordinate(anchorAverageX + horizontalOffset),
    y: roundCoordinate(averageY + verticalJitter)
  };
}

function extractAxisValues(positions: GraphLayoutNodePosition[]): {
  x: number[];
  y: number[];
} {
  const x = positions
    .map((position) => getAxisCoordinate(position, 'x'))
    .filter((value): value is number => value !== null);
  const y = positions
    .map((position) => getAxisCoordinate(position, 'y'))
    .filter((value): value is number => value !== null);

  return { x, y };
}

function getAxisCoordinate(
  position: GraphLayoutNodePosition,
  axis: 'x' | 'y'
): number | null {
  const fixed = axis === 'x' ? position.fx : position.fy;
  if (typeof fixed === 'number' && Number.isFinite(fixed)) {
    return fixed;
  }

  const fallback = axis === 'x' ? position.x : position.y;
  if (typeof fallback === 'number' && Number.isFinite(fallback)) {
    return fallback;
  }

  return null;
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(2));
}

function collectSearchableValues(value: unknown, target: string[]): void {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === 'string') {
    target.push(value);
    return;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    target.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectSearchableValues(item, target));
    return;
  }

  if (typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) => {
      collectSearchableValues(item, target);
    });
  }
}

function deduplicateNonEmpty(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    if (!value) {
      return;
    }
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  });
  return result;
}

function createEntityId(prefix: string, name: string, existing: Set<string>): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const base = normalized ? `${prefix}-${normalized}` : `${prefix}-${Date.now()}`;
  let candidate = base;
  let counter = 1;
  while (existing.has(candidate)) {
    candidate = `${base}-${counter++}`;
  }
  return candidate;
}

function addDomainToTree(domains: DomainNode[], parentId: string | undefined, newDomain: DomainNode): DomainNode[] {
  if (!parentId) {
    return [...domains, newDomain];
  }

  const [next, inserted] = insertDomain(domains, parentId, newDomain);
  if (inserted) {
    return next;
  }

  return [...domains, newDomain];
}

function insertDomain(domains: DomainNode[], parentId: string, newDomain: DomainNode): [DomainNode[], boolean] {
  let inserted = false;
  const next = domains.map((domain) => {
    if (domain.id === parentId) {
      inserted = true;
      const children = domain.children ? [...domain.children, newDomain] : [newDomain];
      return { ...domain, children };
    }

    if (domain.children) {
      const [childUpdated, childInserted] = insertDomain(domain.children, parentId, newDomain);
      if (childInserted) {
        inserted = true;
        return { ...domain, children: childUpdated };
      }
    }

    return domain;
  });

  return [next, inserted];
}

function removeDomainFromTree(
  domains: DomainNode[],
  targetId: string,
  parentId: string | null = null
): [DomainNode[], DomainNode | null, string | null] {
  let removed: DomainNode | null = null;
  let removedParent: string | null = null;

  const next = domains
    .map((domain) => {
      if (domain.id === targetId) {
        removed = domain;
        removedParent = parentId;
        return null;
      }

      if (domain.children) {
        const [children, childRemoved, childParent] = removeDomainFromTree(domain.children, targetId, domain.id);
        if (childRemoved) {
          removed = childRemoved;
          removedParent = childParent;
          return { ...domain, children };
        }
      }

      return domain;
    })
    .filter((domain): domain is DomainNode => Boolean(domain));

  return [next, removed, removedParent];
}

function collectDomainIds(domain: DomainNode): string[] {
  const children = domain.children ?? [];
  return [domain.id, ...children.flatMap((child) => collectDomainIds(child))];
}

function buildModuleLinks(
  modules: ModuleNode[],
  artifacts: ArtifactNode[],
  allowedDomainIds: Set<string>
): GraphLink[] {
  const artifactMap = new Map<string, ArtifactNode>();
  artifacts.forEach((artifact) => artifactMap.set(artifact.id, artifact));

  return modules.flatMap((module) => {
    const domainLinks: GraphLink[] = module.domains
      .filter((domainId) => allowedDomainIds.has(domainId))
      .map((domainId) => ({
        source: module.id,
        target: domainId,
        type: 'domain'
      }));

    const dependencyLinks: GraphLink[] = module.dependencies.map((dependencyId) => ({
      source: module.id,
      target: dependencyId,
      type: 'dependency'
    }));

    const produceLinks: GraphLink[] = module.produces.map((artifactId) => ({
      source: module.id,
      target: artifactId,
      type: 'produces'
    }));

    const consumeLinks: GraphLink[] = module.dataIn
      .filter((input) => input.sourceId && artifactMap.has(input.sourceId))
      .map((input) => ({
        source: input.sourceId as string,
        target: module.id,
        type: 'consumes'
      }));

    return [...domainLinks, ...dependencyLinks, ...produceLinks, ...consumeLinks];
  });
}

function buildInitiativeLinks(
  initiatives: Initiative[],
  allowedDomainIds: Set<string>
): GraphLink[] {
  return initiatives.flatMap((initiative) => {
    const domainLinks: GraphLink[] = initiative.domains
      .filter((domainId) => allowedDomainIds.has(domainId))
      .map((domainId) => ({
        source: initiative.id,
        target: domainId,
        type: 'initiative-domain'
      }));

    const moduleLinks: GraphLink[] = initiative.plannedModuleIds.map((moduleId) => ({
      source: initiative.id,
      target: moduleId,
      type: 'initiative-plan'
    }));

    return [...domainLinks, ...moduleLinks];
  });
}

function flattenDomainTree(domains: DomainNode[]): DomainNode[] {
  return domains.flatMap((domain) => [domain, ...(domain.children ? flattenDomainTree(domain.children) : [])]);
}

function collectAttachableDomainIds(domains: DomainNode[]): string[] {
  const result: string[] = [];

  const visit = (nodes: DomainNode[], depth: number) => {
    nodes.forEach((node) => {
      if (depth > 0 && !node.isCatalogRoot) {
        result.push(node.id);
      }
      if (node.children) {
        visit(node.children, depth + 1);
      }
    });
  };

  visit(domains, 0);
  return result;
}

function collectCatalogDomainIds(domains: DomainNode[]): string[] {
  return flattenDomainTree(domains)
    .filter((domain) => domain.isCatalogRoot)
    .map((domain) => domain.id);
}

function buildDomainDescendants(domains: DomainNode[]): Map<string, string[]> {
  const map = new Map<string, string[]>();

  const visit = (node: DomainNode): string[] => {
    const collected = new Set<string>([node.id]);

    node.children?.forEach((child) => {
      visit(child).forEach((id) => collected.add(id));
    });

    map.set(node.id, Array.from(collected));
    return Array.from(collected);
  };

  domains.forEach((domain) => {
    visit(domain);
  });

  return map;
}

function buildDomainAncestors(domains: DomainNode[]): Map<string, string[]> {
  const map = new Map<string, string[]>();

  const visit = (node: DomainNode, ancestors: string[]) => {
    map.set(node.id, ancestors);
    node.children?.forEach((child) => {
      visit(child, [...ancestors, node.id]);
    });
  };

  domains.forEach((domain) => visit(domain, []));

  return map;
}

function filterDomainTreeByIds(domains: DomainNode[], allowed: Set<string>): DomainNode[] {
  if (allowed.size === 0) {
    return [];
  }

  return domains
    .map((domain) => {
      const children = domain.children ? filterDomainTreeByIds(domain.children, allowed) : [];
      const include = allowed.has(domain.id) || children.length > 0;

      if (!include) {
        return null;
      }

      return {
        ...domain,
        children: children.length > 0 ? children : undefined
      } as DomainNode;
    })
    .filter((domain): domain is DomainNode => domain !== null);
}

type LinkEndpoint = string | { id: string };

function getLinkEndpointId(value: LinkEndpoint): string {
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return value.id;
  }

  return value;
}

function App() {
  return (
    <GraphProvider>
      <AppContent />
    </GraphProvider>
  );
}

export default App;
