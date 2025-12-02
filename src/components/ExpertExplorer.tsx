import { Badge } from '@consta/uikit/Badge';
import { Button } from '@consta/uikit/Button';
import { Card } from '@consta/uikit/Card';
import { Combobox, type ComboboxPropRenderValue } from '@consta/uikit/Combobox';
import { Loader } from '@consta/uikit/Loader';
import { Switch } from '@consta/uikit/Switch';
import { Tabs } from '@consta/uikit/Tabs';
import { Text } from '@consta/uikit/Text';
import { TextField } from '@consta/uikit/TextField';
import { useTheme, type ThemePreset } from '@consta/uikit/Theme';
import clsx from 'clsx';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import ForceGraph2D, {
  ForceGraphMethods,
  LinkObject,
  NodeObject
} from 'react-force-graph-2d';
import {
  domainNameById,
  type Initiative,
  type ExpertProfile,
  type ExpertSkill,
  type ModuleNode,
  type TeamRole
} from '../data';
import styles from './ExpertExplorer.module.css';
import SkillEditorModal from './SkillEditorModal';
import SoftSkillEditorModal from './SoftSkillEditorModal';

type ViewOption = {
  label: string;
  value: 'list' | 'graph' | 'roles' | 'assignments';
};

type ViewMode = ViewOption['value'];

type ExpertExplorerProps = {
  experts: ExpertProfile[];
  modules: ModuleNode[];
  moduleNameMap: Record<string, string>;
  moduleDomainMap: Record<string, string[]>;
  domainNameMap: Record<string, string>;
  initiatives: Initiative[];
  onUpdateExpertSkills: (expertId: string, skills: ExpertSkill[]) => void | Promise<void>;
  onUpdateExpertSoftSkills: (
    expertId: string,
    softSkills: string[]
  ) => void | Promise<void>;
};

type SkillFocus = {
  type: 'domain' | 'competency' | 'consulting' | 'soft';
  originId: string;
  label: string;
  expertIds: string[];
};

type AssignmentFocus = {
  type: 'module' | 'initiative';
  id: string;
};

type ForceNode = NodeObject & {
  id: string;
  type: SkillFocus['type'] | 'expert' | 'role' | 'module' | 'initiative';
  originId: string;
  label: string;
  connectionCount?: number;
};

type ForceLink = LinkObject & {
  id: string;
  type: SkillFocus['type'] | 'role' | 'module' | 'initiative' | 'plan';
  preferredDistance?: number;
};

type ExpertPalette = {
  background: string;
  text: string;
  textMuted: string;
  textOnAccent: string;
  expert: string;
  domain: string;
  competency: string;
  consulting: string;
  soft: string;
  role: string;
  module: string;
  initiative: string;
  edge: string;
  edgeHighlight: string;
  roleEdge: string;
  moduleEdge: string;
  initiativeEdge: string;
  planEdge: string;
};

const resolveSoftSkills = (expert: ExpertProfile): string[] =>
  Array.isArray(expert.softSkills) ? expert.softSkills : [];

type RoleAssignmentMap = Map<TeamRole, Map<string, Set<string>>>;

type ExpertRoleMap = Map<string, Map<TeamRole, Set<string>>>;

type RoleAggregate = {
  role: TeamRole;
  expertCount: number;
  experts: {
    profile: ExpertProfile;
    moduleIds: string[];
  }[];
  moduleIds: string[];
  topSkills: {
    id: string;
    label: string;
    count: number;
  }[];
};

type AvailabilityMeta = {
  label: string;
  status: 'success' | 'warning' | 'system';
};


type GraphDensityOption = {
  label: string;
  value: 'all' | 'shared' | 'core';
  minConnections: number;
  description: string;
};

const viewOptions: ViewOption[] = [
  { label: 'Список', value: 'list' },
  { label: 'Граф навыков', value: 'graph' },
  { label: 'Граф назначений', value: 'assignments' },
  { label: 'По ролям', value: 'roles' }
];

const availabilityMeta: Record<ExpertProfile['availability'], AvailabilityMeta> = {
  available: { label: 'Готов к консалтингу', status: 'success' },
  partial: { label: 'Ограниченная доступность', status: 'warning' },
  busy: { label: 'Планирование заранее', status: 'system' }
};

const DEFAULT_PALETTE: ExpertPalette = {
  background: '#ffffff',
  text: '#1f1f1f',
  textMuted: '#525966',
  textOnAccent: '#ffffff',
  expert: '#3F8CFF',
  domain: '#FF8C69',
  competency: '#45C7B0',
  consulting: '#A067FF',
  soft: '#FF9EC7',
  role: '#FFB347',
  module: '#2E8BC0',
  initiative: '#FF6FA7',
  edge: 'rgba(82, 96, 115, 0.35)',
  edgeHighlight: '#3F8CFF',
  roleEdge: 'rgba(255, 179, 71, 0.45)',
  moduleEdge: 'rgba(46, 139, 192, 0.45)',
  initiativeEdge: 'rgba(255, 111, 167, 0.45)',
  planEdge: 'rgba(255, 111, 167, 0.32)'
};

const graphDensityOptions: GraphDensityOption[] = [
  {
    label: 'Все навыки',
    value: 'all',
    minConnections: 1,
    description: 'Полная детализация с сохранением всех редких навыков'
  },
  {
    label: 'Совпадения 2+',
    value: 'shared',
    minConnections: 2,
    description: 'Скрывать навыки, которые есть только у одного эксперта'
  },
  {
    label: 'Ядро 3+',
    value: 'core',
    minConnections: 3,
    description: 'Показывать только навыки, которыми делятся как минимум три эксперта'
  }
];

const isSkillNode = (node: ForceNode) =>
  node.type === 'domain' ||
  node.type === 'competency' ||
  node.type === 'consulting' ||
  node.type === 'soft';

const getNodeBaseRadius = (node: ForceNode): number =>
  node.type === 'expert'
    ? 14
    : node.type === 'initiative'
      ? 13
      : node.type === 'role'
        ? 12
        : node.type === 'module' || node.type === 'domain'
          ? 11
          : node.type === 'competency' || node.type === 'soft'
            ? 10
            : 9;

const getNodeRenderRadius = (node: ForceNode): number => {
  const baseRadius = getNodeBaseRadius(node);
  const connectionIntensity = Math.sqrt(Math.max(node.connectionCount ?? 0, 0));
  return baseRadius + Math.min(8, connectionIntensity * 2);
};

const skillTypeLabel: Record<SkillFocus['type'], string> = {
  domain: 'Домен',
  competency: 'Компетенция',
  consulting: 'Консалтинговый навык',
  soft: 'Soft skill'
};

const initiativeStatusLabel: Record<Initiative['status'], string> = {
  initiated: 'Инициирована',
  'in-progress': 'В работе',
  converted: 'Внедрена'
};

const MAX_FOCUSED_EXPERTS = 6;

const ExpertExplorer: React.FC<ExpertExplorerProps> = ({
  experts,
  modules,
  moduleNameMap,
  moduleDomainMap,
  domainNameMap,
  initiatives,
  onUpdateExpertSkills,
  onUpdateExpertSoftSkills
}) => {
  const { theme, themeClassNames } = useTheme();
  const [palette, setPalette] = useState<ExpertPalette>(() => resolveExpertPalette(themeClassNames));

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState<string[]>([]);
  const [competencyFilter, setCompetencyFilter] = useState<string[]>([]);
  const [consultingFilter, setConsultingFilter] = useState<string[]>([]);
  const [softSkillFilter, setSoftSkillFilter] = useState<string[]>([]);
  const [roleFilter, setRoleFilter] = useState<TeamRole[]>([]);
  const [skillFilterMode, setSkillFilterMode] = useState<'inclusive' | 'strict'>('inclusive');
  const [graphDensity, setGraphDensity] = useState<GraphDensityOption['value']>('all');
  const [includeSoftSkills, setIncludeSoftSkills] = useState(true);
  const [selectedExpertId, setSelectedExpertId] = useState<string | null>(null);
  const [isSkillEditorOpen, setIsSkillEditorOpen] = useState(false);
  const [skillEditorExpert, setSkillEditorExpert] = useState<ExpertProfile | null>(null);
  const [isSoftSkillEditorOpen, setIsSoftSkillEditorOpen] = useState(false);
  const [softSkillEditorExpert, setSoftSkillEditorExpert] = useState<ExpertProfile | null>(null);
  const [focusedSkill, setFocusedSkill] = useState<SkillFocus | null>(null);
  const [focusedAssignment, setFocusedAssignment] = useState<AssignmentFocus | null>(null);
  const [selectedRole, setSelectedRole] = useState<TeamRole | null>(null);
  const [graphInstanceKey, setGraphInstanceKey] = useState(0);
  const [roleGraphInstanceKey, setRoleGraphInstanceKey] = useState(0);
  const [isSkillGraphVisible, setIsSkillGraphVisible] = useState(true);
  const [isRoleGraphVisible, setIsRoleGraphVisible] = useState(true);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const graphRef = useRef<ForceGraphMethods | null>(null);
  const initialGraphZoomAppliedRef = useRef<Record<'graph' | 'assignments', boolean>>({
    graph: false,
    assignments: false
  });
  const graphContainerRef = useRef<HTMLDivElement | null>(null);
  const [graphDimensions, setGraphDimensions] = useState({ width: 0, height: 0 });
  const roleGraphRef = useRef<ForceGraphMethods | null>(null);
  const roleGraphZoomAppliedRef = useRef(false);
  const roleGraphContainerRef = useRef<HTMLDivElement | null>(null);
  const [roleGraphDimensions, setRoleGraphDimensions] = useState({ width: 0, height: 0 });

  const refreshGraphInstance = useCallback((ref: React.RefObject<ForceGraphMethods | null>) => {
    const refresh = (ref.current as unknown as { refresh?: () => void })?.refresh;
    if (typeof refresh === 'function') {
      refresh.call(ref.current);
    }
  }, []);

  useLayoutEffect(() => {
    const applyPalette = () => {
      const nextPalette = resolveExpertPalette(themeClassNames);
      setPalette((prev) => (areExpertPalettesEqual(prev, nextPalette) ? prev : nextPalette));
    };

    applyPalette();

    if (typeof MutationObserver === 'undefined' || typeof window === 'undefined') {
      return;
    }

    const target = findThemeElement(themeClassNames) ?? document.body;
    const observer = new MutationObserver(applyPalette);

    observer.observe(target, { attributes: true, attributeFilter: ['class', 'style'] });

    return () => observer.disconnect();
  }, [theme, themeClassNames]);

  useEffect(() => {
    refreshGraphInstance(graphRef);
    refreshGraphInstance(roleGraphRef);
  }, [palette, refreshGraphInstance]);

  useEffect(() => {
    setIsSkillGraphVisible(false);
    setIsRoleGraphVisible(false);
    const frame = window.requestAnimationFrame(() => {
      setGraphInstanceKey((value) => value + 1);
      setRoleGraphInstanceKey((value) => value + 1);
      setIsSkillGraphVisible(true);
      setIsRoleGraphVisible(true);
    });

    graphRef.current = null;
    roleGraphRef.current = null;
    setFocusedSkill(null);
    setFocusedAssignment(null);
    setSelectedRole(null);
    initialGraphZoomAppliedRef.current = { graph: false, assignments: false };
    roleGraphZoomAppliedRef.current = false;

    return () => window.cancelAnimationFrame(frame);
  }, [palette]);
  useEffect(() => {
    if (!includeSoftSkills && focusedSkill?.type === 'soft') {
      setFocusedSkill(null);
    }
  }, [focusedSkill, includeSoftSkills]);
  const activeGraphDensity = useMemo(() => {
    return graphDensityOptions.find((option) => option.value === graphDensity) ?? graphDensityOptions[0];
  }, [graphDensity]);

  const resolveDomainName = useCallback(
    (domainId: string) => domainNameMap[domainId] ?? domainNameById[domainId] ?? domainId,
    [domainNameMap]
  );

  const expertById = useMemo(() => {
    const map = new Map<string, ExpertProfile>();
    experts.forEach((expert) => map.set(expert.id, expert));
    return map;
  }, [experts]);

  const initiativeById = useMemo(() => {
    const map = new Map<string, Initiative>();
    initiatives.forEach((initiative) => map.set(initiative.id, initiative));
    return map;
  }, [initiatives]);

  const roleAssignments = useMemo<RoleAssignmentMap>(() => {
    const assignments: RoleAssignmentMap = new Map();
    const nameIndex = new Map<string, string>();

    experts.forEach((expert) => {
      nameIndex.set(expert.fullName.toLowerCase(), expert.id);
    });

    modules.forEach((module) => {
      module.projectTeam.forEach((member) => {
        const expertId = nameIndex.get(member.fullName.toLowerCase());
        if (!expertId) {
          return;
        }

        let roleMap = assignments.get(member.role);
        if (!roleMap) {
          roleMap = new Map();
          assignments.set(member.role, roleMap);
        }

        let moduleSet = roleMap.get(expertId);
        if (!moduleSet) {
          moduleSet = new Set();
          roleMap.set(expertId, moduleSet);
        }

        moduleSet.add(module.id);
      });
    });

    return assignments;
  }, [experts, modules]);

  const expertRolesMap = useMemo<ExpertRoleMap>(() => {
    const map: ExpertRoleMap = new Map();

    roleAssignments.forEach((expertMap, role) => {
      expertMap.forEach((moduleIds, expertId) => {
        let roles = map.get(expertId);
        if (!roles) {
          roles = new Map();
          map.set(expertId, roles);
        }
        roles.set(role, new Set(moduleIds));
      });
    });

    return map;
  }, [roleAssignments]);

  const roleOptions = useMemo<TeamRole[]>(() => {
    return Array.from(roleAssignments.keys()).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [roleAssignments]);

  const softSkillOptions = useMemo(() => {
    const set = new Set<string>();
    experts.forEach((expert) => {
      resolveSoftSkills(expert).forEach((skill) => set.add(skill));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [experts]);

  const normalizedSearch = search.trim().toLowerCase();
  const selectedDomainSet = useMemo(
    () => new Set(domainFilter),
    [domainFilter]
  );
  const selectedCompetencySet = useMemo(
    () => new Set(competencyFilter),
    [competencyFilter]
  );
  const selectedConsultingSet = useMemo(
    () => new Set(consultingFilter),
    [consultingFilter]
  );
  const selectedSoftSkillSet = useMemo(() => new Set(softSkillFilter), [softSkillFilter]);
  const selectedRoleSet = useMemo(() => new Set(roleFilter), [roleFilter]);

  const matchesFilters = useCallback(
    (
      expert: ExpertProfile,
      options?: Partial<{
        applyDomain: boolean;
        applyCompetency: boolean;
        applyConsulting: boolean;
        applySoft: boolean;
        applyRole: boolean;
      }>
    ) => {
      const {
        applyDomain = true,
        applyCompetency = true,
        applyConsulting = true,
        applySoft = true,
        applyRole = true
      } = options ?? {};

      const requiresCompleteMatch = skillFilterMode === 'strict';

      const domainMatches = selectedDomainSet.size
        ? expert.domains.filter((domainId) => selectedDomainSet.has(domainId)).length
        : 0;
      const domainSatisfied = requiresCompleteMatch
        ? domainMatches === selectedDomainSet.size
        : domainMatches > 0;
      if (applyDomain && selectedDomainSet.size > 0 && !domainSatisfied) {
        return {
          passes: false,
          domainMatches,
          competencyMatches: 0,
          consultingMatches: 0
        } as const;
      }

      const competencyMatches = selectedCompetencySet.size
        ? expert.competencies.filter((competency) => selectedCompetencySet.has(competency))
          .length
        : 0;
      const competencySatisfied = requiresCompleteMatch
        ? competencyMatches === selectedCompetencySet.size
        : competencyMatches > 0;
      if (applyCompetency && selectedCompetencySet.size > 0 && !competencySatisfied) {
        return {
          passes: false,
          domainMatches,
          competencyMatches,
          consultingMatches: 0
        } as const;
      }

      const consultingMatches = selectedConsultingSet.size
        ? expert.consultingSkills.filter((skill) => selectedConsultingSet.has(skill)).length
        : 0;
      const consultingSatisfied = requiresCompleteMatch
        ? consultingMatches === selectedConsultingSet.size
        : consultingMatches > 0;
      if (applyConsulting && selectedConsultingSet.size > 0 && !consultingSatisfied) {
        return {
          passes: false,
          domainMatches,
          competencyMatches,
          consultingMatches
        } as const;
      }

      if (applySoft && selectedSoftSkillSet.size > 0) {
        const hasAllSoftSkills = Array.from(selectedSoftSkillSet).every((skill) =>
          resolveSoftSkills(expert).includes(skill)
        );
        if (!hasAllSoftSkills) {
          return {
            passes: false,
            domainMatches,
            competencyMatches,
            consultingMatches
          } as const;
        }
      }

      if (applyRole && selectedRoleSet.size > 0) {
        const expertRoles = expertRolesMap.get(expert.id);
        if (!expertRoles) {
          return {
            passes: false,
            domainMatches,
            competencyMatches,
            consultingMatches
          } as const;
        }

        const hasSelectedRole = Array.from(expertRoles.keys()).some((role) =>
          selectedRoleSet.has(role)
        );
        if (!hasSelectedRole) {
          return {
            passes: false,
            domainMatches,
            competencyMatches,
            consultingMatches
          } as const;
        }
      }

      return {
        passes: true,
        domainMatches,
        competencyMatches,
        consultingMatches
      } as const;
    },
    [
      expertRolesMap,
      selectedCompetencySet,
      selectedConsultingSet,
      selectedDomainSet,
      selectedRoleSet,
      selectedSoftSkillSet,
      skillFilterMode
    ]
  );

  const domainOptions = useMemo(() => {
    const set = new Set<string>(Object.keys(domainNameMap));
    experts.forEach((expert) => {
      const result = matchesFilters(expert, { applyDomain: false });
      if (!result.passes) {
        return;
      }
      expert.domains.forEach((domainId) => set.add(domainId));
    });
    return Array.from(set).sort((a, b) =>
      resolveDomainName(a).localeCompare(resolveDomainName(b), 'ru')
    );
  }, [domainNameMap, experts, matchesFilters, resolveDomainName]);

  const competencyOptions = useMemo(() => {
    const set = new Set<string>();
    experts.forEach((expert) => {
      const result = matchesFilters(expert, { applyCompetency: false });
      if (!result.passes) {
        return;
      }
      expert.competencies.forEach((competency) => set.add(competency));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [experts, matchesFilters]);

  const competencySelectionSummary = useMemo(() => {
    if (competencyFilter.length === 0) {
      return null;
    }
    const total = competencyOptions.length;
    return `Выбрано ${competencyFilter.length} из ${total}`;
  }, [competencyFilter.length, competencyOptions.length]);

  const renderCompetencyValue = useCallback<ComboboxPropRenderValue<string>>(
    ({ item }) => {
      if (!competencySelectionSummary) {
        return null;
      }
      if (competencyFilter[0] !== item) {
        return null;
      }
      return <span className={styles.comboboxValueSummary}>{competencySelectionSummary}</span>;
    },
    [competencyFilter, competencySelectionSummary]
  );

  const consultingOptions = useMemo(() => {
    const set = new Set<string>();
    experts.forEach((expert) => {
      const result = matchesFilters(expert, { applyConsulting: false });
      if (!result.passes) {
        return;
      }
      expert.consultingSkills.forEach((skill) => set.add(skill));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [experts, matchesFilters]);

  const filteredExperts = useMemo(() => {
    const hasMatchSort =
      selectedDomainSet.size > 0 ||
      selectedCompetencySet.size > 0 ||
      selectedConsultingSet.size > 0;

    const entries: { expert: ExpertProfile; score: number }[] = [];

    experts.forEach((expert) => {
      const { passes, domainMatches, competencyMatches, consultingMatches } =
        matchesFilters(expert);

      if (!passes) {
        return;
      }

      if (normalizedSearch) {
        const moduleNames = expert.modules.map(
          (moduleId) => moduleNameMap[moduleId] ?? moduleId
        );
        const domainNames = expert.domains.map((domainId) => resolveDomainName(domainId));
        const expertRoles = expertRolesMap.get(expert.id);
        const roleLabels = expertRoles ? Array.from(expertRoles.keys()) : [];
        const haystack = [
          expert.fullName,
          expert.title,
          expert.summary,
          expert.location,
          expert.contact,
          ...moduleNames,
          ...domainNames,
          ...expert.competencies,
          ...expert.consultingSkills,
          ...resolveSoftSkills(expert),
          ...expert.focusAreas,
          ...expert.notableProjects,
          ...expert.languages,
          ...roleLabels
        ]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(normalizedSearch)) {
          return;
        }
      }

      const matchScore =
        (selectedDomainSet.size > 0 ? domainMatches : 0) +
        (selectedCompetencySet.size > 0 ? competencyMatches : 0) +
        (selectedConsultingSet.size > 0 ? consultingMatches : 0);

      entries.push({ expert, score: matchScore });
    });

    return entries
      .sort((a, b) => {
        if (hasMatchSort) {
          return (
            b.score - a.score ||
            a.expert.fullName.localeCompare(b.expert.fullName, 'ru')
          );
        }
        return a.expert.fullName.localeCompare(b.expert.fullName, 'ru');
      })
      .map((entry) => entry.expert);
  }, [
    experts,
    expertRolesMap,
    matchesFilters,
    moduleNameMap,
    normalizedSearch,
    resolveDomainName,
    selectedCompetencySet,
    selectedConsultingSet,
    selectedDomainSet
  ]);

  const selectedExpert = useMemo(
    () => filteredExperts.find((expert) => expert.id === selectedExpertId) ?? null,
    [filteredExperts, selectedExpertId]
  );

  const roleAggregations = useMemo<RoleAggregate[]>(() => {
    const aggregates: RoleAggregate[] = [];

    roleAssignments.forEach((expertMap, role) => {
      const expertsForRole = filteredExperts.filter((expert) =>
        expertMap.has(expert.id)
      );

      if (expertsForRole.length === 0) {
        return;
      }

      const moduleSet = new Set<string>();
      const skillCounts = new Map<string, number>();
      const expertEntries = expertsForRole.map((expert) => {
        const moduleIds = Array.from(expertMap.get(expert.id) ?? []);
        moduleIds.forEach((moduleId) => moduleSet.add(moduleId));
        expert.competencies.forEach((competency) => {
          skillCounts.set(competency, (skillCounts.get(competency) ?? 0) + 1);
        });

        return {
          profile: expert,
          moduleIds
        };
      });

      const topSkills = Array.from(skillCounts.entries())
        .sort((a, b) => {
          if (b[1] !== a[1]) {
            return b[1] - a[1];
          }
          return a[0].localeCompare(b[0], 'ru');
        })
        .slice(0, 6)
        .map(([id, count]) => ({ id, label: id, count }));

      aggregates.push({
        role,
        expertCount: expertEntries.length,
        experts: expertEntries,
        moduleIds: Array.from(moduleSet),
        topSkills
      });
    });

    return aggregates.sort(
      (a, b) => b.expertCount - a.expertCount || a.role.localeCompare(b.role, 'ru')
    );
  }, [filteredExperts, roleAssignments]);

  const roleAggregationMap = useMemo(
    () => new Map(roleAggregations.map((item) => [item.role, item])),
    [roleAggregations]
  );

  useEffect(() => {
    if (roleAggregations.length === 0) {
      setSelectedRole(null);
      return;
    }

    if (!selectedRole || !roleAggregationMap.has(selectedRole)) {
      setSelectedRole(roleAggregations[0].role);
    }
  }, [roleAggregationMap, roleAggregations, selectedRole]);

  useEffect(() => {
    if (!isRoleGraphVisible || viewMode !== 'roles') {
      return;
    }

    if (!selectedRole) {
      return;
    }

    const aggregate = roleAggregationMap.get(selectedRole);
    if (!aggregate) {
      return;
    }

    if (
      !selectedExpertId ||
      !aggregate.experts.some((entry) => entry.profile.id === selectedExpertId)
    ) {
      const fallbackId = aggregate.experts[0]?.profile.id ?? null;
      if (fallbackId !== selectedExpertId) {
        setSelectedExpertId(fallbackId);
      }
    }
  }, [roleAggregationMap, selectedExpertId, selectedRole, viewMode]);

  const selectedRoleAggregate = selectedRole
    ? roleAggregationMap.get(selectedRole) ?? null
    : null;

  const selectedExpertRoles = useMemo(() => {
    if (!selectedExpert) {
      return [] as { role: TeamRole; modules: { id: string; name: string }[] }[];
    }

    const roleEntries = expertRolesMap.get(selectedExpert.id);
    if (!roleEntries) {
      return [] as { role: TeamRole; modules: { id: string; name: string }[] }[];
    }

    return Array.from(roleEntries.entries())
      .map(([role, moduleIds]) => ({
        role,
        modules: Array.from(moduleIds).map((moduleId) => ({
          id: moduleId,
          name: moduleNameMap[moduleId] ?? moduleId
        }))
      }))
      .sort((a, b) => a.role.localeCompare(b.role, 'ru'));
  }, [expertRolesMap, moduleNameMap, selectedExpert]);

  useEffect(() => {
    if (filteredExperts.length === 0) {
      setSelectedExpertId(null);
      return;
    }

    if (focusedSkill) {
      return;
    }

    if (!selectedExpertId || !filteredExperts.some((expert) => expert.id === selectedExpertId)) {
      setSelectedExpertId(filteredExperts[0].id);
    }
  }, [filteredExperts, focusedSkill, selectedExpertId]);

  useEffect(() => {
    if (isSkillEditorOpen && selectedExpert && (!skillEditorExpert || skillEditorExpert.id !== selectedExpert.id)) {
      setSkillEditorExpert(selectedExpert);
    }
  }, [isSkillEditorOpen, selectedExpert, skillEditorExpert]);

  useEffect(() => {
    if (
      isSoftSkillEditorOpen &&
      selectedExpert &&
      (!softSkillEditorExpert || softSkillEditorExpert.id !== selectedExpert.id)
    ) {
      setSoftSkillEditorExpert(selectedExpert);
    }
  }, [isSoftSkillEditorOpen, selectedExpert, softSkillEditorExpert]);

  const handleOpenSkillEditor = useCallback((expert: ExpertProfile) => {
    setSkillEditorExpert(expert);
    setIsSkillEditorOpen(true);
  }, []);

  const handleCloseSkillEditor = useCallback(() => {
    setIsSkillEditorOpen(false);
    setSkillEditorExpert(null);
  }, []);

  const handleSaveSkills = useCallback(
    async (skills: ExpertSkill[]) => {
      const targetExpert = skillEditorExpert ?? selectedExpert;
      if (!targetExpert) {
        return;
      }
      await Promise.resolve(onUpdateExpertSkills(targetExpert.id, skills));
      setIsSkillEditorOpen(false);
      setSkillEditorExpert(null);
    },
    [onUpdateExpertSkills, selectedExpert, skillEditorExpert]
  );

  const handleOpenSoftSkillEditor = useCallback((expert: ExpertProfile) => {
    setSoftSkillEditorExpert(expert);
    setIsSoftSkillEditorOpen(true);
  }, []);

  const handleCloseSoftSkillEditor = useCallback(() => {
    setIsSoftSkillEditorOpen(false);
    setSoftSkillEditorExpert(null);
  }, []);

  const handleSaveSoftSkills = useCallback(
    async (softSkills: string[]) => {
      const targetExpert = softSkillEditorExpert ?? selectedExpert;
      if (!targetExpert) {
        return;
      }
      await Promise.resolve(onUpdateExpertSoftSkills(targetExpert.id, softSkills));
      setIsSoftSkillEditorOpen(false);
      setSoftSkillEditorExpert(null);
    },
    [onUpdateExpertSoftSkills, selectedExpert, softSkillEditorExpert]
  );

  useEffect(() => {
    if (!focusedSkill) {
      return;
    }

    const hasExpert = focusedSkill.expertIds.some((expertId) =>
      filteredExperts.some((expert) => expert.id === expertId)
    );
    if (!hasExpert) {
      setFocusedSkill(null);
    }
  }, [filteredExperts, focusedSkill]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined' || typeof window.ResizeObserver === 'undefined') {
      return;
    }

    if (!isSkillGraphVisible || (viewMode !== 'graph' && viewMode !== 'assignments')) {
      return;
    }

    const element = graphContainerRef.current;
    if (!element) {
      return;
    }

    const measure = (target: Element | null) => {
      if (!target) {
        return;
      }

      const { width, height } = (target as HTMLElement).getBoundingClientRect();
      setGraphDimensions({
        width: Math.max(0, width),
        height: Math.max(0, height)
      });
    };

    measure(element);

    const observer = new window.ResizeObserver((entries) => {
      const entry = entries[0];
      measure(entry?.target ?? null);
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, [viewMode]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined' || typeof window.ResizeObserver === 'undefined') {
      return;
    }

    if (viewMode !== 'roles') {
      return;
    }

    const element = roleGraphContainerRef.current;
    if (!element) {
      return;
    }

    const measure = (target: Element | null) => {
      if (!target) {
        return;
      }

      const { width, height } = (target as HTMLElement).getBoundingClientRect();
      setRoleGraphDimensions({
        width: Math.max(0, width),
        height: Math.max(0, height)
      });
    };

    measure(element);

    const observer = new window.ResizeObserver((entries) => {
      const entry = entries[0];
      measure(entry?.target ?? null);
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, [viewMode]);

  const skillGraphData = useMemo(() => {
    const nodes: ForceNode[] = [];
    const links: ForceLink[] = [];
    const seenNodes = new Map<string, ForceNode>();

    const ensureNode = (node: ForceNode) => {
      if (seenNodes.has(node.id)) {
        return seenNodes.get(node.id)!;
      }
      const enrichedNode: ForceNode = {
        ...node,
        connectionCount: node.connectionCount ?? 0
      };
      seenNodes.set(node.id, enrichedNode);
      nodes.push(enrichedNode);
      return enrichedNode;
    };

    const appendLink = (link: ForceLink) => {
      const sourceId =
        typeof link.source === 'string'
          ? link.source
          : (link.source as ForceNode).id;
      const targetId =
        typeof link.target === 'string'
          ? link.target
          : (link.target as ForceNode).id;

      const sourceNode = seenNodes.get(sourceId);
      const targetNode = seenNodes.get(targetId);
      const sourceLabelLength = sourceNode?.label.length ?? 0;
      const targetLabelLength = targetNode?.label.length ?? 0;
      const projectedConnections =
        (sourceNode?.connectionCount ?? 0) +
        (targetNode?.connectionCount ?? 0) +
        2;

      const baseDistance = 50;
      const labelFactor = 4.5;
      const densityFactor = 6;

      link.preferredDistance =
        baseDistance +
        labelFactor * Math.max(sourceLabelLength, targetLabelLength) +
        densityFactor * Math.sqrt(projectedConnections);

      links.push(link);

      if (sourceNode) {
        sourceNode.connectionCount = (sourceNode.connectionCount ?? 0) + 1;
      }
      if (targetNode) {
        targetNode.connectionCount = (targetNode.connectionCount ?? 0) + 1;
      }
    };

    filteredExperts.forEach((expert) => {
      const expertNodeId = `expert:${expert.id}`;
      ensureNode({
        id: expertNodeId,
        originId: expert.id,
        type: 'expert',
        label: expert.fullName
      });

      expert.domains.forEach((domainId) => {
        const nodeId = `domain:${domainId}`;
        ensureNode({
          id: nodeId,
          originId: domainId,
          type: 'domain',
          label: resolveDomainName(domainId)
        });
        appendLink({
          id: `${expertNodeId}->${nodeId}`,
          source: expertNodeId,
          target: nodeId,
          type: 'domain'
        });
      });

      expert.competencies.forEach((competency) => {
        const nodeId = `competency:${competency}`;
        ensureNode({
          id: nodeId,
          originId: competency,
          type: 'competency',
          label: competency
        });
        appendLink({
          id: `${expertNodeId}->${nodeId}`,
          source: expertNodeId,
          target: nodeId,
          type: 'competency'
        });
      });

      expert.consultingSkills.forEach((skill) => {
        const nodeId = `consulting:${skill}`;
        ensureNode({
          id: nodeId,
          originId: skill,
          type: 'consulting',
          label: skill
        });
        appendLink({
          id: `${expertNodeId}->${nodeId}`,
          source: expertNodeId,
          target: nodeId,
          type: 'consulting'
        });
      });

      if (includeSoftSkills) {
        resolveSoftSkills(expert).forEach((skill) => {
          const nodeId = `soft:${skill}`;
          ensureNode({
            id: nodeId,
            originId: skill,
            type: 'soft',
            label: skill
          });
          appendLink({
            id: `${expertNodeId}->${nodeId}`,
            source: expertNodeId,
            target: nodeId,
            type: 'soft'
          });
        });
      }
    });

    nodes.forEach((node) => {
      const connections = node.connectionCount ?? 0;
      node.val = 1 + Math.sqrt(connections);
    });

    return { nodes, links };
  }, [filteredExperts, includeSoftSkills, resolveDomainName]);

  const {
    nodes: assignmentGraphNodes,
    links: assignmentGraphLinks,
    expertAssignments,
    moduleExperts,
    initiativeExperts,
    initiativeModules,
    moduleInitiatives
  } = useMemo(() => {
    const nodes: ForceNode[] = [];
    const links: ForceLink[] = [];
    const seenNodes = new Map<string, ForceNode>();
    const seenLinks = new Set<string>();
    const expertAssignments = new Map<string, { modules: Set<string>; initiatives: Set<string> }>();
    const moduleExperts = new Map<string, Set<string>>();
    const initiativeExperts = new Map<string, Set<string>>();
    const initiativeModules = new Map<string, Set<string>>();
    const moduleInitiatives = new Map<string, Set<string>>();
    const filteredExpertIds = new Set(filteredExperts.map((expert) => expert.id));

    const ensureNode = (node: ForceNode) => {
      if (seenNodes.has(node.id)) {
        return seenNodes.get(node.id)!;
      }
      const enrichedNode: ForceNode = {
        ...node,
        connectionCount: node.connectionCount ?? 0
      };
      seenNodes.set(node.id, enrichedNode);
      nodes.push(enrichedNode);
      return enrichedNode;
    };

    const registerConnection = (nodeId: string) => {
      const targetNode = seenNodes.get(nodeId);
      if (targetNode) {
        targetNode.connectionCount = (targetNode.connectionCount ?? 0) + 1;
      }
    };

    const appendLink = (link: ForceLink) => {
      if (seenLinks.has(link.id)) {
        return;
      }
      seenLinks.add(link.id);
      links.push(link);
      const sourceId =
        typeof link.source === 'string'
          ? link.source
          : (link.source as ForceNode).id;
      const targetId =
        typeof link.target === 'string'
          ? link.target
          : (link.target as ForceNode).id;
      registerConnection(sourceId);
      registerConnection(targetId);
    };

    const ensureAssignmentRecord = (expertId: string) => {
      let record = expertAssignments.get(expertId);
      if (!record) {
        record = { modules: new Set<string>(), initiatives: new Set<string>() };
        expertAssignments.set(expertId, record);
      }
      return record;
    };

    filteredExperts.forEach((expert) => {
      const expertNodeId = `expert:${expert.id}`;
      ensureNode({
        id: expertNodeId,
        originId: expert.id,
        type: 'expert',
        label: expert.fullName
      });

      const record = ensureAssignmentRecord(expert.id);
      const moduleIds = new Set(expert.modules);
      moduleIds.forEach((moduleId) => {
        const moduleNodeId = `module:${moduleId}`;
        ensureNode({
          id: moduleNodeId,
          originId: moduleId,
          type: 'module',
          label: moduleNameMap[moduleId] ?? moduleId
        });
        record.modules.add(moduleId);
        let expertSet = moduleExperts.get(moduleId);
        if (!expertSet) {
          expertSet = new Set();
          moduleExperts.set(moduleId, expertSet);
        }
        expertSet.add(expert.id);
        appendLink({
          id: `${expertNodeId}->${moduleNodeId}`,
          source: expertNodeId,
          target: moduleNodeId,
          type: 'module'
        });
      });
    });

    initiatives.forEach((initiative) => {
      const relatedExperts = new Set<string>();

      initiative.roles.forEach((rolePlan) => {
        rolePlan.pinnedExpertIds.forEach((expertId) => {
          if (filteredExpertIds.has(expertId)) {
            relatedExperts.add(expertId);
          }
        });

        rolePlan.workItems?.forEach((item) => {
          if (item.assignedExpertId && filteredExpertIds.has(item.assignedExpertId)) {
            relatedExperts.add(item.assignedExpertId);
          }
        });
      });

      if (relatedExperts.size === 0) {
        return;
      }

      const initiativeNodeId = `initiative:${initiative.id}`;
      ensureNode({
        id: initiativeNodeId,
        originId: initiative.id,
        type: 'initiative',
        label: initiative.name
      });

      let initiativeExpertSet = initiativeExperts.get(initiative.id);
      if (!initiativeExpertSet) {
        initiativeExpertSet = new Set();
        initiativeExperts.set(initiative.id, initiativeExpertSet);
      }

      relatedExperts.forEach((expertId) => {
        initiativeExpertSet!.add(expertId);
        const record = ensureAssignmentRecord(expertId);
        record.initiatives.add(initiative.id);
        const expertNodeId = `expert:${expertId}`;
        appendLink({
          id: `${expertNodeId}->${initiativeNodeId}`,
          source: expertNodeId,
          target: initiativeNodeId,
          type: 'initiative'
        });
      });

      const moduleIds = new Set<string>([
        ...initiative.plannedModuleIds,
        ...(initiative.potentialModules ?? [])
      ]);

      let initiativeModuleSet = initiativeModules.get(initiative.id);
      if (!initiativeModuleSet) {
        initiativeModuleSet = new Set();
      }

      moduleIds.forEach((moduleId) => {
        if (!moduleId) {
          return;
        }
        const moduleNodeId = `module:${moduleId}`;
        ensureNode({
          id: moduleNodeId,
          originId: moduleId,
          type: 'module',
          label: moduleNameMap[moduleId] ?? moduleId
        });
        initiativeModuleSet!.add(moduleId);
        appendLink({
          id: `${initiativeNodeId}->${moduleNodeId}`,
          source: initiativeNodeId,
          target: moduleNodeId,
          type: 'plan'
        });
        let moduleInitiativeSet = moduleInitiatives.get(moduleId);
        if (!moduleInitiativeSet) {
          moduleInitiativeSet = new Set();
          moduleInitiatives.set(moduleId, moduleInitiativeSet);
        }
        moduleInitiativeSet.add(initiative.id);
      });

      if (initiativeModuleSet.size > 0) {
        initiativeModules.set(initiative.id, initiativeModuleSet);
      }
    });

    nodes.forEach((node) => {
      const connections = node.connectionCount ?? 0;
      node.val = 1 + Math.sqrt(connections);
    });

    return {
      nodes,
      links,
      expertAssignments,
      moduleExperts,
      initiativeExperts,
      initiativeModules,
      moduleInitiatives
    };
  }, [filteredExperts, initiatives, moduleNameMap]);

  const displayedSkillGraphData = useMemo(() => {
    if (activeGraphDensity.minConnections <= 1) {
      return { nodes: skillGraphData.nodes, links: skillGraphData.links };
    }

    const allowedNodeIds = new Set<string>();
    const filteredNodes = skillGraphData.nodes.filter((node) => {
      if (!isSkillNode(node)) {
        allowedNodeIds.add(node.id);
        return true;
      }
      if ((node.connectionCount ?? 0) >= activeGraphDensity.minConnections) {
        allowedNodeIds.add(node.id);
        return true;
      }
      return false;
    });

    const filteredLinks = skillGraphData.links.filter((link) => {
      const sourceId =
        typeof link.source === 'string'
          ? link.source
          : (link.source as ForceNode).id;
      const targetId =
        typeof link.target === 'string'
          ? link.target
          : (link.target as ForceNode).id;
      return allowedNodeIds.has(sourceId) && allowedNodeIds.has(targetId);
    });

    return { nodes: filteredNodes, links: filteredLinks };
  }, [activeGraphDensity, skillGraphData]);

  const graphVisibilityStats = useMemo(() => {
    const totalSkills = skillGraphData.nodes.filter(isSkillNode).length;
    const visibleSkills = displayedSkillGraphData.nodes.filter(isSkillNode).length;
    return {
      totalSkills,
      visibleSkills,
      hiddenSkills: Math.max(0, totalSkills - visibleSkills)
    };
  }, [displayedSkillGraphData.nodes, skillGraphData.nodes]);

  const assignmentGraphData = useMemo(
    () => ({ nodes: assignmentGraphNodes, links: assignmentGraphLinks }),
    [assignmentGraphLinks, assignmentGraphNodes]
  );

  const skillGraphNodes = displayedSkillGraphData.nodes;
  const skillGraphLinks = displayedSkillGraphData.links;

  useEffect(() => {
    if (viewMode === 'graph' || viewMode === 'assignments') {
      initialGraphZoomAppliedRef.current[viewMode] = false;
    }
    if (viewMode === 'roles') {
      roleGraphZoomAppliedRef.current = false;
    }
  }, [viewMode]);

  useEffect(() => {
    if (!isSkillGraphVisible || (viewMode !== 'graph' && viewMode !== 'assignments')) {
      return;
    }

    const graph = graphRef.current;
    if (!graph) {
      return;
    }

    const zoomKey: 'graph' | 'assignments' = viewMode;
    const padding = initialGraphZoomAppliedRef.current[zoomKey] ? 120 : 40;
    const timeout = window.setTimeout(() => {
      if (zoomKey === 'graph') {
        graph.zoomToFit(400, padding, (node) => (node as ForceNode).type === 'expert');
      } else {
        graph.zoomToFit(400, padding);
      }
      initialGraphZoomAppliedRef.current[zoomKey] = true;
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [
    graphDimensions.height,
    graphDimensions.width,
    graphInstanceKey,
    isSkillGraphVisible,
    viewMode
  ]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!isSkillGraphVisible || !graph) {
      return;
    }

    const linkForce = graph.d3Force('link') as {
      distance?: (distance: (link: LinkObject) => number) => void;
    };

    if (!linkForce || typeof linkForce.distance !== 'function') {
      return;
    }

    const defaultDistance = 80;
    if (viewMode === 'graph') {
      linkForce.distance((link: LinkObject) => {
        const typed = link as ForceLink;
        return typed.preferredDistance ?? defaultDistance;
      });
    } else {
      linkForce.distance(() => defaultDistance);
    }

    graph.d3ReheatSimulation();
  }, [assignmentGraphLinks, graphInstanceKey, isSkillGraphVisible, skillGraphLinks, viewMode]);

  useEffect(() => {
    if (viewMode !== 'graph') {
      setFocusedSkill(null);
    }
    if (viewMode !== 'assignments') {
      setFocusedAssignment(null);
    }
  }, [viewMode]);

  useEffect(() => {
    if (!focusedSkill || activeGraphDensity.minConnections <= 1) {
      return;
    }
    const skillNodeId = `${focusedSkill.type}:${focusedSkill.originId}`;
    const exists = displayedSkillGraphData.nodes.some((node) => node.id === skillNodeId);
    if (!exists) {
      setFocusedSkill(null);
    }
  }, [activeGraphDensity.minConnections, displayedSkillGraphData.nodes, focusedSkill]);

  useEffect(() => {
    if (!focusedAssignment) {
      return;
    }

    if (focusedAssignment.type === 'module') {
      const hasExperts = moduleExperts.get(focusedAssignment.id)?.size;
      const hasInitiatives = moduleInitiatives.get(focusedAssignment.id)?.size;
      if (!hasExperts && !hasInitiatives) {
        setFocusedAssignment(null);
      }
      return;
    }

    if (!initiativeExperts.get(focusedAssignment.id)?.size) {
      setFocusedAssignment(null);
    }
  }, [focusedAssignment, initiativeExperts, moduleExperts, moduleInitiatives]);

  const roleGraphData = useMemo(() => {
    if (!selectedRoleAggregate) {
      return { nodes: [] as ForceNode[], links: [] as ForceLink[] };
    }

    const nodes: ForceNode[] = [];
    const links: ForceLink[] = [];
    const seenNodes = new Map<string, ForceNode>();

    const ensureNode = (node: ForceNode) => {
      if (seenNodes.has(node.id)) {
        return seenNodes.get(node.id)!;
      }
      const enrichedNode: ForceNode = {
        ...node,
        connectionCount: node.connectionCount ?? 0
      };
      seenNodes.set(node.id, enrichedNode);
      nodes.push(enrichedNode);
      return enrichedNode;
    };

    const appendLink = (link: ForceLink) => {
      links.push(link);
      const sourceId =
        typeof link.source === 'string'
          ? link.source
          : (link.source as ForceNode).id;
      const targetId =
        typeof link.target === 'string'
          ? link.target
          : (link.target as ForceNode).id;
      const sourceNode = seenNodes.get(sourceId);
      const targetNode = seenNodes.get(targetId);
      if (sourceNode) {
        sourceNode.connectionCount = (sourceNode.connectionCount ?? 0) + 1;
      }
      if (targetNode) {
        targetNode.connectionCount = (targetNode.connectionCount ?? 0) + 1;
      }
    };

    const roleNodeId = `role:${selectedRoleAggregate.role}`;
    ensureNode({
      id: roleNodeId,
      originId: selectedRoleAggregate.role,
      type: 'role',
      label: selectedRoleAggregate.role
    });

    const topSkillSet = new Set(selectedRoleAggregate.topSkills.map((skill) => skill.id));

    selectedRoleAggregate.experts.forEach(({ profile }) => {
      const expertNodeId = `expert:${profile.id}`;
      ensureNode({
        id: expertNodeId,
        originId: profile.id,
        type: 'expert',
        label: profile.fullName
      });

      appendLink({
        id: `${roleNodeId}->${expertNodeId}`,
        source: roleNodeId,
        target: expertNodeId,
        type: 'role'
      });

      profile.competencies.forEach((competency) => {
        if (!topSkillSet.has(competency)) {
          return;
        }
        const skillNodeId = `competency:${competency}`;
        ensureNode({
          id: skillNodeId,
          originId: competency,
          type: 'competency',
          label: competency
        });

        appendLink({
          id: `${expertNodeId}->competency:${competency}`,
          source: expertNodeId,
          target: skillNodeId,
          type: 'competency'
        });
      });
    });

    nodes.forEach((node) => {
      const connections = node.connectionCount ?? 0;
      node.val = 1 + Math.sqrt(connections);
    });

    return { nodes, links };
  }, [selectedRoleAggregate]);

  useEffect(() => {
    if (viewMode !== 'roles') {
      return;
    }

    const graph = roleGraphRef.current;
    if (!graph) {
      return;
    }

    const padding = roleGraphZoomAppliedRef.current ? 120 : 40;
    const timeout = window.setTimeout(() => {
      graph.zoomToFit(400, padding);
      roleGraphZoomAppliedRef.current = true;
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [
    isRoleGraphVisible,
    roleGraphData,
    roleGraphDimensions.height,
    roleGraphDimensions.width,
    roleGraphInstanceKey,
    viewMode
  ]);

  useEffect(() => {
    if (viewMode !== 'graph' && viewMode !== 'assignments') {
      return;
    }

    const graph = graphRef.current;
    if (!graph) {
      return;
    }

    const chargeForce = graph.d3Force('charge');
    if (chargeForce && typeof (chargeForce as { strength?: unknown }).strength === 'function') {
      const extraRepulsion =
        viewMode === 'graph' ? Math.min(260, skillGraphNodes.length * 0.85) : 0;
      const charge = viewMode === 'assignments' ? -220 : -120 - extraRepulsion;
      (chargeForce as { strength: (value: number) => void }).strength(charge);
    }

    // Add collision force to prevent overlap
    // Note: d3-force-3d is not available, so we skip explicit collision force for now.
    // The charge force provides some repulsion.

    const linkForce = graph.d3Force('link');
    if (viewMode === 'assignments' && linkForce && typeof (linkForce as { distance?: unknown }).distance === 'function') {
      (linkForce as { distance: (value: number) => void }).distance(110);
    }

    if (viewMode === 'graph' && linkForce && typeof (linkForce as { distance?: unknown }).distance === 'function') {
      (linkForce as { distance: (link: LinkObject) => number }).distance((link: LinkObject) => {
        const typed = link as ForceLink;
        // Tighter connections for direct skill links, looser for soft skills
        if (typed.type === 'soft') return 100;
        if (typed.type === 'domain') return 60;
        return typed.preferredDistance ?? 80;
      });
    }

    if (linkForce && typeof (linkForce as { strength?: unknown }).strength === 'function') {
      const strength = viewMode === 'assignments' ? 0.55 : 0.8;
      (linkForce as { strength: (value: number) => void }).strength(strength);
    }
  }, [
    assignmentGraphLinks,
    assignmentGraphNodes,
    skillGraphLinks,
    skillGraphNodes,
    graphInstanceKey,
    viewMode
  ]);

  useEffect(() => {
    if (viewMode !== 'roles') {
      return;
    }

    const graph = roleGraphRef.current;
    if (!graph) {
      return;
    }

    const chargeForce = graph.d3Force('charge');
    if (chargeForce && typeof (chargeForce as { strength?: unknown }).strength === 'function') {
      (chargeForce as { strength: (value: number) => void }).strength(-200);
    }

    const linkForce = graph.d3Force('link');
    if (linkForce && typeof (linkForce as { distance?: unknown }).distance === 'function') {
      (linkForce as { distance: (value: number) => void }).distance(110);
    }
    if (linkForce && typeof (linkForce as { strength?: unknown }).strength === 'function') {
      (linkForce as { strength: (value: number) => void }).strength(0.7);
    }
  }, [isSkillGraphVisible, roleGraphData, roleGraphInstanceKey, viewMode]);

  const highlightNodeIds = useMemo(() => {
    const set = new Set<string>();

    if (selectedExpert) {
      set.add(`expert:${selectedExpert.id}`);
      if (viewMode === 'graph') {
        selectedExpert.domains.forEach((domainId) => set.add(`domain:${domainId}`));
        selectedExpert.competencies.forEach((competency) =>
          set.add(`competency:${competency}`)
        );
        selectedExpert.consultingSkills.forEach((skill) =>
          set.add(`consulting:${skill}`)
        );
        if (includeSoftSkills) {
          resolveSoftSkills(selectedExpert).forEach((skill) => set.add(`soft:${skill}`));
        }
      }

      if (viewMode === 'assignments') {
        const record = expertAssignments.get(selectedExpert.id);
        record?.modules.forEach((moduleId) => set.add(`module:${moduleId}`));
        record?.initiatives.forEach((initiativeId) => {
          set.add(`initiative:${initiativeId}`);
          const relatedModules = initiativeModules.get(initiativeId);
          relatedModules?.forEach((moduleId) => set.add(`module:${moduleId}`));
        });
      }
    }

    if (viewMode === 'graph' && focusedSkill) {
      set.add(`${focusedSkill.type}:${focusedSkill.originId}`);
      focusedSkill.expertIds.forEach((expertId) => set.add(`expert:${expertId}`));
    }

    if (viewMode === 'assignments' && focusedAssignment) {
      set.add(`${focusedAssignment.type}:${focusedAssignment.id}`);
      if (focusedAssignment.type === 'module') {
        const expertsForModule = moduleExperts.get(focusedAssignment.id);
        expertsForModule?.forEach((expertId) => set.add(`expert:${expertId}`));
        const initiativesForModule = moduleInitiatives.get(focusedAssignment.id);
        initiativesForModule?.forEach((initiativeId) => set.add(`initiative:${initiativeId}`));
      } else {
        const expertsForInitiative = initiativeExperts.get(focusedAssignment.id);
        expertsForInitiative?.forEach((expertId) => set.add(`expert:${expertId}`));
        const modulesForInitiative = initiativeModules.get(focusedAssignment.id);
        modulesForInitiative?.forEach((moduleId) => set.add(`module:${moduleId}`));
      }
    }

    if (viewMode === 'roles' && selectedRoleAggregate) {
      set.add(`role:${selectedRoleAggregate.role}`);
      selectedRoleAggregate.experts.forEach(({ profile }) => {
        set.add(`expert:${profile.id}`);
      });
      selectedRoleAggregate.topSkills.forEach((skill) => {
        set.add(`competency:${skill.id}`);
      });
    }

    return set;
  }, [
    expertAssignments,
    focusedAssignment,
    focusedSkill,
    initiativeExperts,
    initiativeModules,
    moduleExperts,
    moduleInitiatives,
    selectedExpert,
    selectedRoleAggregate,
    includeSoftSkills,
    viewMode
  ]);

  const highlightLinkIds = useMemo(() => {
    const set = new Set<string>();
    if (selectedExpert) {
      if (viewMode === 'graph') {
        selectedExpert.domains.forEach((domainId) =>
          set.add(`expert:${selectedExpert.id}->domain:${domainId}`)
        );
        selectedExpert.competencies.forEach((competency) =>
          set.add(`expert:${selectedExpert.id}->competency:${competency}`)
        );
        selectedExpert.consultingSkills.forEach((skill) =>
          set.add(`expert:${selectedExpert.id}->consulting:${skill}`)
        );
        if (includeSoftSkills) {
          resolveSoftSkills(selectedExpert).forEach((skill) =>
            set.add(`expert:${selectedExpert.id}->soft:${skill}`)
          );
        }
      }

      if (viewMode === 'assignments') {
        const record = expertAssignments.get(selectedExpert.id);
        record?.modules.forEach((moduleId) =>
          set.add(`expert:${selectedExpert.id}->module:${moduleId}`)
        );
        record?.initiatives.forEach((initiativeId) => {
          set.add(`expert:${selectedExpert.id}->initiative:${initiativeId}`);
          const relatedModules = initiativeModules.get(initiativeId);
          relatedModules?.forEach((moduleId) =>
            set.add(`initiative:${initiativeId}->module:${moduleId}`)
          );
        });
      }
    }

    if (viewMode === 'graph' && focusedSkill) {
      focusedSkill.expertIds.forEach((expertId) =>
        set.add(`expert:${expertId}->${focusedSkill.type}:${focusedSkill.originId}`)
      );
    }

    if (viewMode === 'assignments' && focusedAssignment) {
      if (focusedAssignment.type === 'module') {
        const expertsForModule = moduleExperts.get(focusedAssignment.id);
        expertsForModule?.forEach((expertId) =>
          set.add(`expert:${expertId}->module:${focusedAssignment.id}`)
        );
        const initiativesForModule = moduleInitiatives.get(focusedAssignment.id);
        initiativesForModule?.forEach((initiativeId) =>
          set.add(`initiative:${initiativeId}->module:${focusedAssignment.id}`)
        );
      } else {
        const expertsForInitiative = initiativeExperts.get(focusedAssignment.id);
        expertsForInitiative?.forEach((expertId) =>
          set.add(`expert:${expertId}->initiative:${focusedAssignment.id}`)
        );
        const modulesForInitiative = initiativeModules.get(focusedAssignment.id);
        modulesForInitiative?.forEach((moduleId) =>
          set.add(`initiative:${focusedAssignment.id}->module:${moduleId}`)
        );
      }
    }

    if (viewMode === 'roles' && selectedRoleAggregate) {
      selectedRoleAggregate.experts.forEach(({ profile }) => {
        set.add(`role:${selectedRoleAggregate.role}->expert:${profile.id}`);
        selectedRoleAggregate.topSkills.forEach((skill) => {
          if (profile.competencies.includes(skill.id)) {
            set.add(`expert:${profile.id}->competency:${skill.id}`);
          }
        });
      });
    }

    return set;
  }, [
    expertAssignments,
    focusedAssignment,
    focusedSkill,
    initiativeExperts,
    initiativeModules,
    moduleExperts,
    moduleInitiatives,
    selectedExpert,
    selectedRoleAggregate,
    includeSoftSkills,
    viewMode
  ]);

  const selectedExpertAssignments = useMemo(() => {
    if (!selectedExpert) {
      return null as { modules: string[]; initiatives: string[] } | null;
    }
    const record = expertAssignments.get(selectedExpert.id);
    if (!record) {
      return { modules: [], initiatives: [] };
    }
    return {
      modules: Array.from(record.modules),
      initiatives: Array.from(record.initiatives)
    };
  }, [expertAssignments, selectedExpert]);

  const focusedAssignmentDetails = useMemo(() => {
    if (!focusedAssignment) {
      return null as
        | (
          | {
            type: 'module';
            label: string;
            expertIds: string[];
            initiativeIds: string[];
          }
          | {
            type: 'initiative';
            label: string;
            status: Initiative['status'] | null;
            expertIds: string[];
            moduleIds: string[];
          }
        )
        | null;
    }

    if (focusedAssignment.type === 'module') {
      return {
        type: 'module' as const,
        label: moduleNameMap[focusedAssignment.id] ?? focusedAssignment.id,
        expertIds: Array.from(moduleExperts.get(focusedAssignment.id) ?? []),
        initiativeIds: Array.from(moduleInitiatives.get(focusedAssignment.id) ?? [])
      };
    }

    const initiative = initiativeById.get(focusedAssignment.id) ?? null;
    return {
      type: 'initiative' as const,
      label: initiative?.name ?? focusedAssignment.id,
      status: initiative?.status ?? null,
      expertIds: Array.from(initiativeExperts.get(focusedAssignment.id) ?? []),
      moduleIds: Array.from(initiativeModules.get(focusedAssignment.id) ?? [])
    };
  }, [
    focusedAssignment,
    initiativeById,
    initiativeExperts,
    initiativeModules,
    moduleExperts,
    moduleInitiatives,
    moduleNameMap
  ]);

  const focusedSkillExperts = useMemo(() => {
    if (!focusedSkill) {
      return [];
    }

    return focusedSkill.expertIds
      .map((expertId) => expertById.get(expertId) ?? null)
      .filter((expert): expert is ExpertProfile => Boolean(expert));
  }, [expertById, focusedSkill]);

  const handleSelectExpert = useCallback((expertId: string) => {
    setSelectedExpertId(expertId);
    setFocusedSkill(null);
    setFocusedAssignment(null);
  }, []);

  const handleNodeClick = useCallback(
    (node?: NodeObject) => {
      if (!node) {
        return;
      }

      const typed = node as ForceNode;
      if (typed.type === 'expert') {
        handleSelectExpert(typed.originId);
        return;
      }

      if (typed.type === 'role') {
        const roleId = typed.originId as TeamRole;
        setSelectedRole(roleId);
        const aggregate = roleAggregationMap.get(roleId);
        const firstExpertId = aggregate?.experts[0]?.profile.id;
        if (firstExpertId) {
          handleSelectExpert(firstExpertId);
        }
        return;
      }

      if (viewMode === 'assignments') {
        if (typed.type === 'module') {
          setFocusedSkill(null);
          setFocusedAssignment({ type: 'module', id: typed.originId });
          const expertsForModule = moduleExperts.get(typed.originId);
          const firstExpertId = expertsForModule ? Array.from(expertsForModule)[0] : undefined;
          if (firstExpertId) {
            handleSelectExpert(firstExpertId);
          }
          return;
        }

        if (typed.type === 'initiative') {
          setFocusedSkill(null);
          setFocusedAssignment({ type: 'initiative', id: typed.originId });
          const expertsForInitiative = initiativeExperts.get(typed.originId);
          const firstExpertId = expertsForInitiative
            ? Array.from(expertsForInitiative)[0]
            : undefined;
          if (firstExpertId) {
            handleSelectExpert(firstExpertId);
          }
          return;
        }
      }

      if (viewMode !== 'graph') {
        return;
      }

      const relatedExperts = filteredExperts.filter((expert) => {
        if (typed.type === 'domain') {
          return expert.domains.includes(typed.originId);
        }
        if (typed.type === 'competency') {
          return expert.competencies.includes(typed.originId);
        }
        if (typed.type === 'consulting') {
          return expert.consultingSkills.includes(typed.originId);
        }
        if (typed.type === 'soft') {
          return resolveSoftSkills(expert).includes(typed.originId);
        }
        return false;
      });

      setFocusedAssignment(null);
      setFocusedSkill({
        type: typed.type,
        originId: typed.originId,
        label: typed.label,
        expertIds: relatedExperts.map((expert) => expert.id)
      });

      setSelectedExpertId(null);
    },
    [
      filteredExperts,
      handleSelectExpert,
      initiativeExperts,
      moduleExperts,
      roleAggregationMap,
      viewMode
    ]
  );

  const handleNodeHover = useCallback((node: NodeObject | null) => {
    setHoveredNodeId(node ? (node as ForceNode).id : null);
  }, []);

  const nodeCanvasObject = useCallback(
    (node: NodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const typed = node as ForceNode;

      const connectionIntensity = Math.sqrt(Math.max(typed.connectionCount ?? 0, 0));
      const radius = getNodeRenderRadius(typed);

      const baseColor =
        typed.type === 'expert'
          ? palette.expert
          : typed.type === 'initiative'
            ? palette.initiative
            : typed.type === 'role'
              ? palette.role
              : typed.type === 'module'
                ? palette.module
                : typed.type === 'domain'
                  ? palette.domain
                  : typed.type === 'competency'
                    ? palette.competency
                    : typed.type === 'soft'
                      ? palette.soft
                      : palette.consulting;

      const isSolid =
        typed.type === 'expert' || typed.type === 'role' || typed.type === 'initiative';
      const isHighlighted = highlightNodeIds.has(typed.id);
      const isHovered = hoveredNodeId === typed.id;
      const isFocused = focusedSkill?.originId === typed.originId && focusedSkill?.type === typed.type;

      const fillColor = isHighlighted || isSolid || isHovered ? baseColor : withAlpha(baseColor, 0.22);

      // Adaptive font sizing based on zoom level
      const fontSizeBase =
        typed.type === 'expert'
          ? 14
          : typed.type === 'initiative'
            ? 13
            : typed.type === 'role'
              ? 13
              : typed.type === 'module' || typed.type === 'domain'
                ? 12
                : 11;

      // Better font scaling - larger at low zoom, smaller at high zoom
      const fontSize = Math.max(
        8,
        Math.min(
          fontSizeBase + Math.min(3, connectionIntensity),
          (fontSizeBase + Math.min(3, connectionIntensity)) / Math.pow(globalScale, 0.5)
        )
      );

      const textY = (node.y ?? 0) + radius + 5 / globalScale;

      ctx.save();

      // Node shadow - only at medium zoom levels
      if (globalScale > 0.5 && globalScale < 3) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
        ctx.shadowBlur = 6 / globalScale;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2 / globalScale;
      }

      // Glow for highlighted/focused/hovered nodes
      if (isHighlighted || isFocused || isHovered) {
        ctx.shadowColor = withAlpha(baseColor, 0.5);
        ctx.shadowBlur = 12 / Math.sqrt(globalScale);
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }

      // Draw node circle
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI, false);
      ctx.fillStyle = fillColor;
      ctx.globalAlpha = isHighlighted || isSolid || isHovered ? 1 : 0.9;
      ctx.fill();

      // Active ring for highlighted nodes
      if (isHighlighted || isFocused || isHovered) {
        ctx.lineWidth = 2 / globalScale;
        ctx.strokeStyle = withAlpha(baseColor, 0.6);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(node.x ?? 0, node.y ?? 0, radius + 3 / globalScale, 0, 2 * Math.PI, false);
        ctx.strokeStyle = withAlpha(baseColor, 0.3);
        ctx.lineWidth = 1 / globalScale;
        ctx.stroke();
      }

      ctx.restore();

      // Text rendering - completely separate context to avoid shadow bleeding
      ctx.save();

      const fontWeight = isHighlighted || isHovered ? '600' : '500';
      ctx.font = `${fontWeight} ${fontSize}px "Inter", "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      // Only show text at reasonable zoom levels
      if (globalScale > 0.4) {
        // Text background/outline for contrast - use light color, not shadow
        if (globalScale < 2) {
          ctx.lineWidth = 3.5 / globalScale;
          ctx.strokeStyle = palette.background;
          ctx.globalAlpha = 0.9;
          ctx.strokeText(typed.label, node.x ?? 0, textY);
        }

        // Main text
        ctx.globalAlpha = 1;
        if (isHighlighted || isHovered) {
          ctx.fillStyle = palette.text;
        } else {
          ctx.fillStyle = isSolid ? palette.text : palette.textMuted;
          if (!isSolid && globalScale < 1.5) {
            ctx.globalAlpha = Math.min(0.95, 0.6 + globalScale * 0.25);
          }
        }

        ctx.fillText(typed.label, node.x ?? 0, textY);
      }

      ctx.restore();
    },
    [highlightNodeIds, focusedSkill, palette, hoveredNodeId]
  );

  const linkColor = useCallback(
    (link: LinkObject) => {
      const typed = link as ForceLink;
      if (typed.id && highlightLinkIds.has(typed.id)) {
        return palette.edgeHighlight;
      }
      if (typed.type === 'role') {
        return palette.roleEdge;
      }
      if (typed.type === 'initiative') {
        return palette.initiativeEdge;
      }
      if (typed.type === 'module') {
        return palette.moduleEdge;
      }
      if (typed.type === 'plan') {
        return palette.planEdge;
      }
      if (typed.type === 'soft') {
        return withAlpha(palette.soft, 0.45);
      }
      return palette.edge;
    },
    [highlightLinkIds, palette]
  );

  const linkWidth = useCallback(
    (link: LinkObject) => {
      const typed = link as ForceLink;
      return typed.id && highlightLinkIds.has(typed.id) ? 1.6 : 0.6;
    },
    [highlightLinkIds]
  );

  const resetFilters = useCallback(() => {
    setSearch('');
    setDomainFilter([]);
    setCompetencyFilter([]);
    setConsultingFilter([]);
    setSoftSkillFilter([]);
    setRoleFilter([]);
    setFocusedSkill(null);
    setFocusedAssignment(null);
    setSelectedRole(null);
  }, []);

  const summary = useMemo(() => {
    const domainSet = new Set<string>();
    const competencySet = new Set<string>();
    const consultingSet = new Set<string>();
    const softSet = new Set<string>();
    const moduleSet = new Set<string>();
    const roleSet = new Set<TeamRole>();

    filteredExperts.forEach((expert) => {
      expert.domains.forEach((domainId) => domainSet.add(domainId));
      expert.competencies.forEach((competency) => competencySet.add(competency));
      expert.consultingSkills.forEach((skill) => consultingSet.add(skill));
      resolveSoftSkills(expert).forEach((skill) => softSet.add(skill));
      expert.modules.forEach((moduleId) => moduleSet.add(moduleId));
      const roles = expertRolesMap.get(expert.id);
      roles?.forEach((_, role) => roleSet.add(role));
    });

    return {
      domains: domainSet,
      competencies: competencySet,
      consulting: consultingSet,
      soft: softSet,
      modules: moduleSet,
      roles: roleSet
    };
  }, [expertRolesMap, filteredExperts]);

  const activeView =
    viewOptions.find((option) => option.value === viewMode) ?? viewOptions[0];

  return (
    <div className={styles.root}>
      <section className={styles.controls}>
        <div className={styles.field}>
          <Text size="xs" weight="semibold">
            Поиск
          </Text>
          <TextField
            size="s"
            placeholder="Введите ФИО, компетенцию или модуль"
            value={search}
            onChange={(value) => setSearch(value ?? '')}
            className={styles.searchField}
          />
        </div>
        <div className={styles.field}>
          <Text size="xs" weight="semibold">
            Домены
          </Text>
          <Combobox<string>
            size="s"
            items={domainOptions}
            value={domainFilter}
            multiple
            getItemKey={(item) => item}
            getItemLabel={(item) => resolveDomainName(item)}
            onChange={(value) => setDomainFilter(value ?? [])}
            placeholder="Все домены"
          />
        </div>
        <div className={styles.field}>
          <Text size="xs" weight="semibold">
            Компетенции
          </Text>
          <Combobox<string>
            size="s"
            items={competencyOptions}
            value={competencyFilter}
            multiple
            getItemKey={(item) => item}
            getItemLabel={(item) => item}
            onChange={(value) => setCompetencyFilter(value ?? [])}
            placeholder="Все компетенции"
            renderValue={competencySelectionSummary ? renderCompetencyValue : undefined}
          />
        </div>
        <div className={styles.field}>
          <Text size="xs" weight="semibold">
            Консалтинговые навыки
          </Text>
          <Combobox<string>
            size="s"
            items={consultingOptions}
            value={consultingFilter}
            multiple
            getItemKey={(item) => item}
            getItemLabel={(item) => item}
            onChange={(value) => setConsultingFilter(value ?? [])}
            placeholder="Все навыки"
          />
        </div>
        <div className={styles.field}>
          <Text size="xs" weight="semibold">
            Soft skills
          </Text>
          <Combobox<string>
            size="s"
            items={softSkillOptions}
            value={softSkillFilter}
            multiple
            getItemKey={(item) => item}
            getItemLabel={(item) => item}
            onChange={(value) => setSoftSkillFilter(value ?? [])}
            placeholder="Все soft skills"
          />
        </div>
        <div className={styles.field}>
          <Text size="xs" weight="semibold">
            Командные роли
          </Text>
          <Combobox<TeamRole>
            size="s"
            items={roleOptions}
            value={roleFilter}
            multiple
            getItemKey={(item) => item}
            getItemLabel={(item) => item}
            onChange={(value) => setRoleFilter(value ?? [])}
            placeholder="Все роли"
          />
        </div>
        <div className={styles.filterModeToggle}>
          <Switch
            size="s"
            checked={skillFilterMode === 'strict'}
            label="Искать навыки у одного эксперта"
            onChange={({ target }) =>
              setSkillFilterMode(target.checked ? 'strict' : 'inclusive')
            }
          />
          <Text size="2xs" view="ghost" className={styles.filterModeDescription}>
            {skillFilterMode === 'strict'
              ? 'Показываются эксперты, которые покрывают все выбранные фильтры.'
              : 'Отображаются эксперты с любым из выбранных навыков, ранжированные по совпадениям.'}
          </Text>
        </div>
      </section>

      <section className={styles.summaryRow}>
        <Card className={styles.summaryCard} verticalSpace="m" horizontalSpace="l" shadow={false}>
          <Text size="xs" view="secondary">
            Отобранные эксперты
          </Text>
          <Text size="2xl" weight="bold">
            {filteredExperts.length}
          </Text>
          <Text size="xs" view="ghost">
            из {experts.length} в каталоге
          </Text>
        </Card>
        <Card className={styles.summaryCard} verticalSpace="m" horizontalSpace="l" shadow={false}>
          <Text size="xs" view="secondary">
            Командные роли
          </Text>
          <Text size="2xl" weight="bold">
            {summary.roles.size}
          </Text>
          <Text size="xs" view="ghost">
            представлены у выбранных экспертов
          </Text>
        </Card>
        <Card className={styles.summaryCard} verticalSpace="m" horizontalSpace="l" shadow={false}>
          <Text size="xs" view="secondary">
            Компетенции
          </Text>
          <Text size="2xl" weight="bold">
            {summary.competencies.size}
          </Text>
          <Text size="xs" view="ghost">
            объединены по выбранным экспертам
          </Text>
        </Card>
        <Card className={styles.summaryCard} verticalSpace="m" horizontalSpace="l" shadow={false}>
          <Text size="xs" view="secondary">
            Консалтинг
          </Text>
          <Text size="2xl" weight="bold">
            {summary.consulting.size}
          </Text>
          <Text size="xs" view="ghost">
            уникальных форматов поддержки
          </Text>
        </Card>
        <Card className={styles.summaryCard} verticalSpace="m" horizontalSpace="l" shadow={false}>
          <Text size="xs" view="secondary">
            Soft skills
          </Text>
          <Text size="2xl" weight="bold">
            {summary.soft.size}
          </Text>
          <Text size="xs" view="ghost">
            отмечены у отобранных экспертов
          </Text>
        </Card>
        <Card className={styles.summaryCard} verticalSpace="m" horizontalSpace="l" shadow={false}>
          <Text size="xs" view="secondary">
            Модули
          </Text>
          <Text size="2xl" weight="bold">
            {summary.modules.size}
          </Text>
          <Text size="xs" view="ghost">
            где эксперты являются носителями знаний
          </Text>
        </Card>
      </section>

      <section className={styles.viewToolbar}>
        <Tabs
          size="s"
          items={viewOptions}
          value={activeView}
          getItemKey={(item) => item.value}
          getItemLabel={(item) => item.label}
          onChange={(tab) => setViewMode(tab.value)}
          className={styles.modeTabs}
        />
        <div className={styles.toolbarActions}>
          <Badge
            size="s"
            view="stroked"
            label={`${filteredExperts.length} экспертов`}
            className={styles.countBadge}
          />
          <Button size="s" view="ghost" label="Сбросить фильтры" onClick={resetFilters} />
        </div>
      </section>

      <section
        className={clsx(styles.content, {
          [styles.listLayout]: viewMode === 'list'
        })}
      >
        {viewMode === 'list' ? (
          <div className={styles.listPane}>
            {filteredExperts.length === 0 ? (
              <div className={styles.placeholder}>
                <Text size="s" view="secondary">
                  Под подходящие условия не попал ни один эксперт.
                </Text>
                <Text size="xs" view="ghost">
                  Попробуйте расширить фильтры или очистить поиск.
                </Text>
              </div>
            ) : (
              <div className={styles.list}>
                {filteredExperts.map((expert) => {
                  const availability = availabilityMeta[expert.availability];
                  const isActive = expert.id === selectedExpertId;
                  return (
                    <Card
                      key={expert.id}
                      className={clsx(styles.expertCard, {
                        [styles.expertCardActive]: isActive
                      })}
                      verticalSpace="m"
                      horizontalSpace="m"
                      shadow={false}
                      onClick={() => handleSelectExpert(expert.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleSelectExpert(expert.id);
                        }
                      }}
                    >
                      <div className={styles.expertCardHeader}>
                        <Text size="l" weight="bold">
                          {expert.fullName}
                        </Text>
                        <Text size="s" view="secondary">
                          {expert.title}
                        </Text>
                      </div>

                      <div className={styles.expertCardMeta}>
                        <Badge size="s" view="stroked" status="system" label={`${expert.experienceYears} лет опыта`} />
                        <Badge size="s" view="stroked" status="system" label={expert.location} />
                        <Badge
                          size="s"
                          view="filled"
                          status={availability.status}
                          label={availability.label}
                        />
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        ) : viewMode === 'graph' ? (
          <div className={styles.graphPane}>
            {focusedSkill && (
              <Card className={styles.focusCard} verticalSpace="m" horizontalSpace="l" shadow={false}>
                <Text size="xs" view="secondary">
                  {skillTypeLabel[focusedSkill.type]}
                </Text>
                <Text size="s" weight="semibold">
                  {focusedSkill.label}
                </Text>
                <Text size="xs" view="ghost">
                  Экспертов: {focusedSkill.expertIds.length}
                </Text>
                <div className={styles.focusExpertButtons}>
                  {focusedSkill.expertIds.slice(0, MAX_FOCUSED_EXPERTS).map((expertId) => {
                    const expert = expertById.get(expertId);
                    if (!expert) {
                      return null;
                    }
                    return (
                      <Button
                        key={expert.id}
                        size="xs"
                        view={expert.id === selectedExpertId ? 'primary' : 'ghost'}
                        label={expert.fullName}
                        onClick={() => handleSelectExpert(expert.id)}
                        className={styles.focusExpertButton}
                      />
                    );
                  })}
                  {focusedSkill.expertIds.length > MAX_FOCUSED_EXPERTS && (
                    <Badge
                      size="xs"
                      view="filled"
                      label={`+${focusedSkill.expertIds.length - MAX_FOCUSED_EXPERTS}`}
                    />
                  )}
                </div>
              </Card>
            )}
            <div className={styles.graphControls}>
              <div className={styles.graphFilterButtons}>
                {graphDensityOptions.map((option) => (
                  <Button
                    key={option.value}
                    size="xs"
                    view={option.value === activeGraphDensity.value ? 'primary' : 'ghost'}
                    label={option.label}
                    onClick={() => setGraphDensity(option.value)}
                    className={styles.graphFilterButton}
                  />
                ))}
              </div>
              <div className={styles.graphFilterMeta}>
                <Text size="xs" view="secondary">
                  {graphVisibilityStats.totalSkills > 0
                    ? `Показано ${graphVisibilityStats.visibleSkills} из ${graphVisibilityStats.totalSkills} навыков`
                    : 'Нет навыков для отображения'}
                  {graphVisibilityStats.hiddenSkills > 0
                    ? `, скрыто ${graphVisibilityStats.hiddenSkills}`
                    : ''}
                </Text>
                <Text size="xs" view="secondary">{activeGraphDensity.description}</Text>
              </div>
              <div className={styles.graphSoftToggle}>
                <Switch
                  size="s"
                  checked={includeSoftSkills}
                  label="Учитывать soft skills"
                  onChange={({ target }) => setIncludeSoftSkills(target.checked)}
                />
                <Text size="2xs" view="secondary" className={styles.graphSoftToggleDescription}>
                  {includeSoftSkills
                    ? 'Показываются связи и узлы soft skills'
                    : 'Связи через soft skills скрыты из графа'}
                </Text>
              </div>
            </div>
            <div ref={graphContainerRef} className={styles.graphContainer}>
              {filteredExperts.length === 0 ? (
                <div className={styles.graphPlaceholder}>
                  <Text size="s" view="secondary">
                    Нет данных для построения графа с выбранными фильтрами.
                  </Text>
                </div>
              ) : isSkillGraphVisible ? (
                <ForceGraph2D
                  key={graphInstanceKey}
                  ref={graphRef}
                  width={graphDimensions.width}
                  height={graphDimensions.height}
                  graphData={displayedSkillGraphData}
                  backgroundColor={palette.background}
                  nodeRelSize={4}
                  cooldownTicks={80}
                  onNodeClick={handleNodeClick}
                  onNodeHover={handleNodeHover}
                  nodeCanvasObject={nodeCanvasObject}
                  nodeCanvasObjectMode={() => 'replace'}
                  linkColor={linkColor}
                  linkWidth={linkWidth}
                  enableZoomInteraction
                  enablePanInteraction
                />
              ) : (
                <Loader size="m" />
              )}
            </div>
          </div>
        ) : viewMode === 'assignments' ? (
          <div className={styles.graphPane}>
            {focusedAssignmentDetails ? (
              <Card className={styles.focusCard} verticalSpace="m" horizontalSpace="l" shadow={false}>
                <Text size="xs" view="secondary">
                  {focusedAssignmentDetails.type === 'module' ? 'Модуль' : 'Инициатива'}
                </Text>
                <Text size="s" weight="semibold">
                  {focusedAssignmentDetails.label}
                </Text>
                <Text size="xs" view="secondary">
                  {focusedAssignmentDetails.expertIds.length > 0
                    ? `Экспертов: ${focusedAssignmentDetails.expertIds.length}`
                    : 'Нет связанных экспертов'}
                </Text>
                {focusedAssignmentDetails.type === 'module' ? (
                  focusedAssignmentDetails.initiativeIds.length > 0 ? (
                    <div className={styles.focusMeta}>
                      <Text size="xs" view="secondary">
                        Инициативы
                      </Text>
                      <div className={styles.badgeGroup}>
                        {focusedAssignmentDetails.initiativeIds.map((initiativeId) => (
                          <Badge
                            key={initiativeId}
                            size="xs"
                            view="stroked"
                            label={initiativeById.get(initiativeId)?.name ?? initiativeId}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <Text size="xs" view="secondary">Нет связанных инициатив</Text>
                  )
                ) : (
                  <>
                    {focusedAssignmentDetails.status && (
                      <Badge
                        size="xs"
                        view="stroked"
                        label={`Статус: ${initiativeStatusLabel[focusedAssignmentDetails.status] ??
                          focusedAssignmentDetails.status
                          }`}
                      />
                    )}
                    {focusedAssignmentDetails.moduleIds.length > 0 ? (
                      <div className={styles.focusMeta}>
                        <Text size="xs" view="secondary">
                          Модули
                        </Text>
                        <div className={styles.badgeGroup}>
                          {focusedAssignmentDetails.moduleIds.map((moduleId) => (
                            <Badge
                              key={moduleId}
                              size="xs"
                              view="stroked"
                              label={moduleNameMap[moduleId] ?? moduleId}
                            />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <Text size="xs" view="secondary">Нет привязанных модулей</Text>
                    )}
                  </>
                )}
                {focusedAssignmentDetails.expertIds.length > 0 && (
                  <div className={styles.focusExpertButtons}>
                    {focusedAssignmentDetails.expertIds.map((expertId) => {
                      const expert = expertById.get(expertId);
                      if (!expert) {
                        return null;
                      }
                      return (
                        <Button
                          key={expert.id}
                          size="xs"
                          view={expert.id === selectedExpertId ? 'primary' : 'ghost'}
                          label={expert.fullName}
                          onClick={() => handleSelectExpert(expert.id)}
                          className={styles.focusExpertButton}
                        />
                      );
                    })}
                  </div>
                )}
              </Card>
            ) : selectedExpert && selectedExpertAssignments ? (
              <Card className={styles.focusCard} verticalSpace="m" horizontalSpace="l" shadow={false}>
                <Text size="xs" view="secondary">Назначения эксперта</Text>
                <Text size="s" weight="semibold">{selectedExpert.fullName}</Text>
                {selectedExpertAssignments.initiatives.length === 0 &&
                  selectedExpertAssignments.modules.length === 0 ? (
                  <Text size="xs" view="secondary">
                    Эксперт пока не привязан к инициативам и модулям.
                  </Text>
                ) : (
                  <>
                    {selectedExpertAssignments.initiatives.length > 0 && (
                      <div className={styles.focusMeta}>
                        <Text size="xs" view="secondary">Инициативы</Text>
                        <div className={styles.badgeGroup}>
                          {selectedExpertAssignments.initiatives.map((initiativeId) => (
                            <Badge
                              key={initiativeId}
                              size="xs"
                              view="stroked"
                              label={initiativeById.get(initiativeId)?.name ?? initiativeId}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedExpertAssignments.modules.length > 0 && (
                      <div className={styles.focusMeta}>
                        <Text size="xs" view="secondary">Модули</Text>
                        <div className={styles.badgeGroup}>
                          {selectedExpertAssignments.modules.map((moduleId) => (
                            <Badge
                              key={moduleId}
                              size="xs"
                              view="stroked"
                              label={moduleNameMap[moduleId] ?? moduleId}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </Card>
            ) : null}
            <div ref={graphContainerRef} className={styles.graphContainer}>
              {assignmentGraphData.nodes.length === 0 ? (
                <div className={styles.graphPlaceholder}>
                  <Text size="s" view="secondary">
                    Нет данных для визуализации назначений с выбранными фильтрами.
                  </Text>
                </div>
              ) : isSkillGraphVisible ? (
                <ForceGraph2D
                  key={graphInstanceKey}
                  ref={graphRef}
                  width={graphDimensions.width}
                  height={graphDimensions.height}
                  graphData={assignmentGraphData}
                  backgroundColor={palette.background}
                  nodeRelSize={4}
                  cooldownTicks={80}
                  onNodeClick={handleNodeClick}
                  onNodeHover={handleNodeHover}
                  nodeCanvasObject={nodeCanvasObject}
                  nodeCanvasObjectMode={() => 'replace'}
                  linkColor={linkColor}
                  linkWidth={linkWidth}
                  enableZoomInteraction
                  enablePanInteraction
                />
              ) : (
                <Loader size="m" />
              )}
            </div>
          </div>
        ) : (
          <div className={styles.rolePane}>
            {roleAggregations.length === 0 ? (
              <div className={styles.placeholder}>
                <Text size="s" view="secondary">
                  Нет экспертов с назначенными ролями для выбранных условий.
                </Text>
                <Text size="xs" view="secondary">
                  Уточните фильтры или уберите ограничение по ролям.
                </Text>
              </div>
            ) : (
              <>
                <div className={styles.roleListPane}>
                  <div className={styles.roleList}>
                    {roleAggregations.map((aggregate) => {
                      const isActive = aggregate.role === selectedRole;
                      const topPreview = aggregate.topSkills.slice(0, 3);
                      return (
                        <Card
                          key={aggregate.role}
                          className={clsx(styles.roleCard, {
                            [styles.roleCardActive]: isActive
                          })}
                          verticalSpace="l"
                          horizontalSpace="l"
                          shadow={false}
                          tabIndex={0}
                          role="button"
                          onClick={() => {
                            setSelectedRole(aggregate.role);
                            const firstExpertId = aggregate.experts[0]?.profile.id;
                            if (firstExpertId) {
                              handleSelectExpert(firstExpertId);
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSelectedRole(aggregate.role);
                              const firstExpertId = aggregate.experts[0]?.profile.id;
                              if (firstExpertId) {
                                handleSelectExpert(firstExpertId);
                              }
                            }
                          }}
                        >
                          <div className={styles.roleCardHeader}>
                            <Text size="s" weight="semibold">
                              {aggregate.role}
                            </Text>
                            <Badge
                              size="xs"
                              view="stroked"
                              label={`${aggregate.expertCount} экспертов`}
                            />
                          </div>
                          <Text size="xs" view="secondary">
                            {aggregate.moduleIds.length} модулей
                          </Text>
                          {topPreview.length > 0 && (
                            <div className={styles.badgeGroup}>
                              {topPreview.map((skill) => (
                                <Badge key={skill.id} size="xs" view="stroked" label={skill.label} />
                              ))}
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </div>
                <div className={styles.roleGraphPane}>
                  {selectedRoleAggregate ? (
                    <>
                      <Card className={styles.roleSummaryCard} verticalSpace="m" horizontalSpace="l" shadow={false}>
                        <Text size="xs" view="secondary">
                          Обзор роли
                        </Text>
                        <Text size="m" weight="semibold">
                          {selectedRoleAggregate.role}
                        </Text>
                        <div className={styles.roleSummaryStats}>
                          <Badge size="xs" view="filled" label={`${selectedRoleAggregate.expertCount} экспертов`} />
                          <Badge size="xs" view="stroked" label={`${selectedRoleAggregate.moduleIds.length} модулей`} />
                        </div>
                        {selectedRoleAggregate.topSkills.length > 0 && (
                          <div className={styles.badgeGroup}>
                            {selectedRoleAggregate.topSkills.map((skill) => (
                              <Badge
                                key={skill.id}
                                size="xs"
                                view="stroked"
                                label={`${skill.label} · ${skill.count}`}
                              />
                            ))}
                          </div>
                        )}
                        {selectedRoleAggregate.moduleIds.length > 0 && (
                          <div className={clsx(styles.badgeGroup, styles.roleModuleBadges)}>
                            {selectedRoleAggregate.moduleIds.map((moduleId) => (
                              <Badge
                                key={moduleId}
                                size="xs"
                                view="stroked"
                                label={moduleNameMap[moduleId] ?? moduleId}
                              />
                            ))}
                          </div>
                        )}
                      </Card>
                      <div ref={roleGraphContainerRef} className={styles.graphContainer}>
                        {roleGraphData.nodes.length === 0 ? (
                          <div className={styles.graphPlaceholder}>
                            <Text size="s" view="secondary">
                              Нет данных для построения графа по выбранной роли.
                            </Text>
                          </div>
                        ) : isRoleGraphVisible ? (
                          <ForceGraph2D
                            key={roleGraphInstanceKey}
                            ref={roleGraphRef}
                            width={roleGraphDimensions.width}
                            height={roleGraphDimensions.height}
                            graphData={roleGraphData}
                            backgroundColor={palette.background}
                            nodeRelSize={4}
                            cooldownTicks={80}
                            onNodeClick={handleNodeClick}
                            onNodeHover={handleNodeHover}
                            nodeCanvasObject={nodeCanvasObject}
                            nodeCanvasObjectMode={() => 'replace'}
                            linkColor={linkColor}
                            linkWidth={linkWidth}
                            enableZoomInteraction
                            enablePanInteraction
                          />
                        ) : (
                          <Loader size="m" />
                        )}
                      </div>
                      <Card className={styles.roleExpertsCard} verticalSpace="m" horizontalSpace="l" shadow={false}>
                        <Text size="xs" view="secondary">
                          Эксперты роли
                        </Text>
                        <div className={styles.focusExpertButtons}>
                          {selectedRoleAggregate.experts.map(({ profile }) => (
                            <Button
                              key={profile.id}
                              size="xs"
                              view={profile.id === selectedExpertId ? 'primary' : 'ghost'}
                              label={profile.fullName}
                              onClick={() => handleSelectExpert(profile.id)}
                              className={styles.focusExpertButton}
                            />
                          ))}
                        </div>
                      </Card>
                    </>
                  ) : (
                    <div className={styles.placeholder}>
                      <Text size="s" view="secondary">
                        Выберите роль, чтобы увидеть связанных экспертов.
                      </Text>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <aside className={styles.detailsPane}>
          {focusedSkill ? (
            <Card className={styles.focusCard} verticalSpace="m" horizontalSpace="l" shadow={false}>
              <Text size="xs" view="secondary">
                {skillTypeLabel[focusedSkill.type]}
              </Text>
              <Text size="s" weight="semibold">
                {focusedSkill.label}
              </Text>
              <Text size="xs" view="secondary">
                Экспертов: {focusedSkillExperts.length}
              </Text>
              {focusedSkillExperts.length > 0 ? (
                <ul className={styles.detailList}>
                  {focusedSkillExperts.map((expert) => (
                    <li key={expert.id} className={styles.detailListItem}>
                      <div className={styles.expertCardHeader}>
                        <Text size="s" weight="semibold">
                          {expert.fullName}
                        </Text>
                        <Text size="xs" view="secondary">
                          {expert.title}
                        </Text>
                      </div>
                      <div className={styles.badgeGroup}>
                        <Badge size="xs" view="stroked" status="system" label={`${expert.experienceYears} лет опыта`} />
                        <Badge size="xs" view="stroked" status="system" label={expert.location} />
                      </div>
                      <Button
                        size="xs"
                        view={expert.id === selectedExpertId ? 'primary' : 'ghost'}
                        label="Открыть профиль"
                        onClick={() => handleSelectExpert(expert.id)}
                        className={styles.focusExpertButton}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <Text size="xs" view="secondary">
                  Нет экспертов с этим навыком в текущей выборке.
                </Text>
              )}
            </Card>
          ) : selectedExpert ? (
            <ExpertDetails
              expert={selectedExpert}
              moduleNameMap={moduleNameMap}
              moduleDomainMap={moduleDomainMap}
              domainNameMap={domainNameMap}
              roles={selectedExpertRoles}
              onEditSkills={handleOpenSkillEditor}
              onEditSoftSkills={handleOpenSoftSkillEditor}
            />
          ) : (
            <div className={styles.placeholder}>
              <Text size="s" view="secondary">
                Выберите эксперта, чтобы увидеть детальную информацию.
              </Text>
            </div>
          )}
        </aside>
      </section>
      {isSkillEditorOpen && (skillEditorExpert ?? selectedExpert) && (
        <SkillEditorModal
          isOpen={isSkillEditorOpen}
          expert={(skillEditorExpert ?? selectedExpert)!}
          onClose={handleCloseSkillEditor}
          onSave={handleSaveSkills}
        />
      )}
      {isSoftSkillEditorOpen && (softSkillEditorExpert ?? selectedExpert) && (
        <SoftSkillEditorModal
          isOpen={isSoftSkillEditorOpen}
          expert={(softSkillEditorExpert ?? selectedExpert)!}
          onClose={handleCloseSoftSkillEditor}
          onSave={handleSaveSoftSkills}
        />
      )}
    </div>
  );
};

type ExpertRoleDetail = {
  role: TeamRole;
  modules: { id: string; name: string }[];
};

type ExpertDetailsProps = {
  expert: ExpertProfile;
  moduleNameMap: Record<string, string>;
  moduleDomainMap: Record<string, string[]>;
  domainNameMap: Record<string, string>;
  roles: ExpertRoleDetail[];
  onEditSkills: (expert: ExpertProfile) => void;
  onEditSoftSkills: (expert: ExpertProfile) => void;
};

const ExpertDetails: React.FC<ExpertDetailsProps> = ({
  expert,
  moduleNameMap,
  moduleDomainMap,
  domainNameMap,
  roles,
  onEditSkills,
  onEditSoftSkills
}) => {
  const availability = availabilityMeta[expert.availability];
  const modules = expert.modules.map((moduleId) => ({
    id: moduleId,
    name: moduleNameMap[moduleId] ?? moduleId,
    domains: moduleDomainMap[moduleId] ?? []
  }));

  return (
    <div className={styles.detailsContent}>
      <div className={styles.detailHeader}>
        <Text size="l" weight="bold">
          {expert.fullName}
        </Text>
        <Text size="s" view="secondary">
          {expert.title}
        </Text>
      </div>
      <div className={styles.detailActions}>
        <Button
          size="xs"
          view="secondary"
          label="Редактировать навыки"
          onClick={() => onEditSkills(expert)}
        />
        <Button
          size="xs"
          view="secondary"
          label="Редактировать soft skills"
          onClick={() => onEditSoftSkills(expert)}
        />
      </div>
      <Text size="s" view="secondary">
        {expert.summary}
      </Text>
      <div className={styles.detailBadges}>
        <Badge size="s" view="filled" label={`${expert.experienceYears} лет опыта`} />
        <Badge size="s" view="stroked" label={expert.location} />
        <Badge size="s" view="stroked" label={expert.languages.join(', ')} />
        <Badge size="s" view="filled" status={availability.status} label={availability.label} />
      </div>
      <Text size="xs" view="ghost">
        {expert.availabilityComment}
      </Text>

      {roles.length > 0 && (
        <section className={styles.detailSection}>
          <Text size="xs" weight="semibold" className={styles.sectionTitle}>
            Командные роли
          </Text>
          <ul className={styles.detailList}>
            {roles.map((role) => (
              <li key={role.role} className={styles.detailListItem}>
                <Text size="s" weight="semibold">
                  {role.role}
                </Text>
                <div className={styles.badgeGroup}>
                  {role.modules.map((module) => (
                    <Badge key={module.id} size="xs" view="stroked" label={module.name} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.detailSection}>
        <Text size="xs" weight="semibold" className={styles.sectionTitle}>
          Домены
        </Text>
        <div className={styles.badgeGroup}>
          {expert.domains.map((domainId) => (
            <Badge
              key={domainId}
              size="xs"
              view="stroked"
              label={domainNameMap[domainId] ?? domainNameById[domainId] ?? domainId}
            />
          ))}
        </div>
      </section>

      <section className={styles.detailSection}>
        <Text size="xs" weight="semibold" className={styles.sectionTitle}>
          Ключевые компетенции
        </Text>
        <div className={styles.badgeGroup}>
          {expert.competencies.map((competency) => (
            <Badge key={competency} size="xs" view="stroked" label={competency} />
          ))}
        </div>
      </section>

      <section className={styles.detailSection}>
        <Text size="xs" weight="semibold" className={styles.sectionTitle}>
          Soft skills
        </Text>
        <div className={styles.badgeGroup}>
          {resolveSoftSkills(expert).map((skill) => (
            <Badge key={skill} size="xs" view="stroked" label={skill} />
          ))}
        </div>
      </section>

      <section className={styles.detailSection}>
        <Text size="xs" weight="semibold" className={styles.sectionTitle}>
          Консалтинговая поддержка
        </Text>
        <div className={styles.badgeGroup}>
          {expert.consultingSkills.map((skill) => (
            <Badge key={skill} size="xs" view="stroked" label={skill} />
          ))}
        </div>
      </section>

      <section className={styles.detailSection}>
        <Text size="xs" weight="semibold" className={styles.sectionTitle}>
          Фокусы развития
        </Text>
        <ul className={styles.focusList}>
          {expert.focusAreas.map((item) => (
            <li key={item}>
              <Text size="xs">{item}</Text>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.detailSection}>
        <Text size="xs" weight="semibold" className={styles.sectionTitle}>
          Модули и продукты
        </Text>
        <ul className={styles.detailList}>
          {modules.map((module) => (
            <li key={module.id} className={styles.detailListItem}>
              <Text size="s" weight="semibold">
                {module.name}
              </Text>
              <div className={styles.badgeGroup}>
                {module.domains.map((domainId) => (
                  <Badge
                    key={`${module.id}-${domainId}`}
                    size="xs"
                    view="stroked"
                    label={domainNameMap[domainId] ?? domainNameById[domainId] ?? domainId}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.detailSection}>
        <Text size="xs" weight="semibold" className={styles.sectionTitle}>
          Ключевые результаты
        </Text>
        <ul className={styles.detailList}>
          {expert.notableProjects.map((project) => (
            <li key={project} className={styles.detailListItem}>
              <Text size="xs">{project}</Text>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.detailSection}>
        <Text size="xs" weight="semibold" className={styles.sectionTitle}>
          Контакты
        </Text>
        <Text size="xs">
          <a className={styles.contactLink} href={`mailto:${expert.contact}`}>
            {expert.contact}
          </a>
        </Text>
      </section>
    </div>
  );
};

function resolveExpertPalette(themeClassNames?: ThemePreset | string): ExpertPalette {
  if (typeof window === 'undefined') {
    return DEFAULT_PALETTE;
  }

  const stylesRef = getComputedStyle((findThemeElement(themeClassNames) as HTMLElement) ?? document.body);
  const getVar = (token: string, fallback: string) =>
    stylesRef.getPropertyValue(token).trim() || fallback;

  const edgeBase = getVar('--color-bg-border', DEFAULT_PALETTE.edge);
  const moduleColor = getVar('--color-bg-normal', DEFAULT_PALETTE.module);
  const initiativeColor = getVar('--color-bg-brand', DEFAULT_PALETTE.initiative);

  return {
    background: getVar('--color-bg-default', DEFAULT_PALETTE.background),
    text: getVar('--color-typo-primary', DEFAULT_PALETTE.text),
    textMuted: getVar('--color-typo-secondary', DEFAULT_PALETTE.textMuted),
    textOnAccent: getVar('--color-typo-ghost', DEFAULT_PALETTE.textOnAccent),
    expert: getVar('--color-bg-link', DEFAULT_PALETTE.expert),
    domain: getVar('--color-bg-warning', DEFAULT_PALETTE.domain),
    competency: getVar('--color-bg-success', DEFAULT_PALETTE.competency),
    consulting: getVar('--color-bg-info', DEFAULT_PALETTE.consulting),
    soft: getVar('--color-bg-system', DEFAULT_PALETTE.soft),
    role: getVar('--color-bg-alert', DEFAULT_PALETTE.role),
    module: moduleColor,
    initiative: initiativeColor,
    edge: edgeBase,
    edgeHighlight: getVar('--color-bg-link', DEFAULT_PALETTE.edgeHighlight),
    roleEdge: withAlpha(getVar('--color-bg-alert', DEFAULT_PALETTE.role), 0.45),
    moduleEdge: withAlpha(moduleColor, 0.45),
    initiativeEdge: withAlpha(initiativeColor, 0.45),
    planEdge: withAlpha(initiativeColor, 0.32)
  };
}

function findThemeElement(themeClassNames?: ThemePreset | string): Element | null {
  const tokens: string[] = [];

  if (typeof themeClassNames === 'string') {
    tokens.push(...themeClassNames.split(/\s+/).filter(Boolean));
  } else if (themeClassNames && typeof themeClassNames === 'object') {
    const color = (themeClassNames as ThemePreset).color;
    const colorToken = typeof color === 'string' ? color : color?.primary;

    [
      colorToken,
      (themeClassNames as ThemePreset).control,
      (themeClassNames as ThemePreset).font,
      (themeClassNames as ThemePreset).size,
      (themeClassNames as ThemePreset).space,
      (themeClassNames as ThemePreset).shadow
    ]
      .filter((token): token is string => Boolean(token && token.trim()))
      .forEach((token) => tokens.push(token.trim()));
  }

  const selectorVariants = [
    tokens.length > 0 ? tokens.map((token) => `.${token}`).join('') : null,
    tokens[0] ? `.${tokens[0]}` : null,
    '.Theme'
  ].filter(Boolean) as string[];

  for (const selector of selectorVariants) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    } catch {
      // Ignore invalid selectors and try the next fallback
    }
  }

  return null;
}

function areExpertPalettesEqual(a: ExpertPalette, b: ExpertPalette): boolean {
  return (
    a.background === b.background &&
    a.text === b.text &&
    a.textMuted === b.textMuted &&
    a.textOnAccent === b.textOnAccent &&
    a.expert === b.expert &&
    a.domain === b.domain &&
    a.competency === b.competency &&
    a.consulting === b.consulting &&
    a.soft === b.soft &&
    a.role === b.role &&
    a.module === b.module &&
    a.initiative === b.initiative &&
    a.edge === b.edge &&
    a.edgeHighlight === b.edgeHighlight &&
    a.roleEdge === b.roleEdge &&
    a.moduleEdge === b.moduleEdge &&
    a.initiativeEdge === b.initiativeEdge &&
    a.planEdge === b.planEdge
  );
}



function withAlpha(color: string, alpha: number) {
  if (!color.startsWith('#')) {
    return color;
  }

  const hex = color.slice(1);
  if (hex.length !== 6) {
    return color;
  }

  const numeric = Number.parseInt(hex, 16);
  const r = (numeric >> 16) & 255;
  const g = (numeric >> 8) & 255;
  const b = numeric & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default ExpertExplorer;
