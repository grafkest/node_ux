import { Badge } from '@consta/uikit/Badge';
import { Button } from '@consta/uikit/Button';
import { Card } from '@consta/uikit/Card';
import { Combobox } from '@consta/uikit/Combobox';
import { Modal } from '@consta/uikit/Modal';
import { Select } from '@consta/uikit/Select';
import { Text } from '@consta/uikit/Text';
import { TextField } from '@consta/uikit/TextField';
import { IconClose } from '@consta/icons/IconClose';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  DomainNode,
  ExpertProfile,
  ModuleNode,
  InitiativeApprovalStatus,
  InitiativeStatus,
  InitiativeWorkItemStatus,
  TeamRole
} from '../data';
import {
  defaultTeamRoles,
  getKnownRoles,
  getSkillNameById,
  getSkillsByRole
} from '../data/skills';
import InitiativeGanttChart, {
  type InitiativeGanttBlocker,
  type InitiativeGanttDependency,
  type InitiativeGanttResource,
  type InitiativeGanttTask
} from './InitiativeGanttChart';
import type { InitiativeCreationRequest } from '../types/initiativeCreation';
import {
  buildCandidatesFromReport,
  buildRoleMatchReports,
  type RolePlanningDraft
} from '../utils/initiativeMatching';
import { useSkillRegistryVersion } from '../utils/useSkillRegistryVersion';
import styles from './InitiativeCreationModal.module.css';

type SelectOption<Value extends string> = {
  label: string;
  value: Value;
};

type OptionItem = {
  id: string;
  label: string;
  value: string;
  isCustom?: boolean;
};

const NEW_DOMAIN_OPTION_ID = '__new-domain__';
const NEW_MODULE_OPTION_ID = '__new-module__';
const NEW_COMPANY_OPTION_ID = '__new-company__';
const NEW_UNIT_OPTION_ID = '__new-unit__';

const DOMAIN_CREATE_OPTION: OptionItem = {
  id: NEW_DOMAIN_OPTION_ID,
  label: 'Новый домен',
  value: NEW_DOMAIN_OPTION_ID
};

const MODULE_CREATE_OPTION: OptionItem = {
  id: NEW_MODULE_OPTION_ID,
  label: 'Новый модуль',
  value: NEW_MODULE_OPTION_ID
};

const COMPANY_CREATE_OPTION: OptionItem = {
  id: NEW_COMPANY_OPTION_ID,
  label: 'Создать нового',
  value: NEW_COMPANY_OPTION_ID
};

const UNIT_CREATE_OPTION: OptionItem = {
  id: NEW_UNIT_OPTION_ID,
  label: 'Добавить новое',
  value: NEW_UNIT_OPTION_ID
};

const collectGraphDomainIds = (domains: DomainNode[]): string[] => {
  const result: string[] = [];

  const visit = (nodes: DomainNode[]) => {
    nodes.forEach((node) => {
      const children = node.children ?? [];
      if (!node.isCatalogRoot && children.length === 0) {
        result.push(node.id);
      }
      if (children.length > 0) {
        visit(children);
      }
    });
  };

  visit(domains);
  return result;
};

type AssignmentStartMode = 'project-start' | 'after-assignment' | 'fixed-date';

type WorkAssignmentDraft = {
  id: string;
  role: TeamRole;
  task: string;
  description: string;
  effortDays: number;
  startDay: number;
  durationDays: number;
  startMode: AssignmentStartMode;
  startAfterId?: string | null;
  startDate?: string | null;
  isCustom?: boolean;
  tasks?: string[];
  minUnits?: number;
  maxUnits?: number;
  roleUnits?: number;
  canSplit?: boolean;
  parallel?: boolean;
  durationMode?: 'fixed-effort' | 'fixed-duration';
  constraints?: { id: string; label: string }[];
  priority?: number;
  wipLimitTag?: string;
  branchLabel?: string;
  calendarId?: string;
  assignedExpertId?: string;
};

type WorkDraft = {
  id: string;
  title: string;
  description: string;
  assumptions: string;
  owner: string;
  timeframe: string;
  status: InitiativeWorkItemStatus;
  assignments: WorkAssignmentDraft[];
};

type AssignmentSchedule = {
  startDay: number;
  durationDays: number;
  startDate: Date | null;
};

const buildAssignmentSchedule = (
  works: WorkDraft[],
  initiativeStartDate: string | null
): Map<string, AssignmentSchedule> => {
  const lookup = new Map<string, { assignment: WorkAssignmentDraft }>();
  works.forEach((work) => {
    work.assignments.forEach((assignment) => {
      lookup.set(assignment.id, { assignment });
    });
  });

  const baseStart = initiativeStartDate ? startOfDay(new Date(initiativeStartDate)) : null;
  const memo = new Map<string, number>();

  const computeStart = (assignmentId: string, visited: Set<string>): number => {
    if (memo.has(assignmentId)) {
      return memo.get(assignmentId) ?? 0;
    }
    const record = lookup.get(assignmentId);
    if (!record) {
      memo.set(assignmentId, 0);
      return 0;
    }
    const assignment = record.assignment;
    const sanitizedStart = Math.max(0, Math.round(assignment.startDay));
    const mode = assignment.startMode ?? 'project-start';
    let resolved = sanitizedStart;

    if (mode === 'project-start') {
      resolved = 0;
    } else if (mode === 'fixed-date') {
      if (assignment.startDate && baseStart) {
        const target = new Date(assignment.startDate);
        if (!Number.isNaN(target.getTime())) {
          resolved = Math.max(0, differenceInDays(baseStart, target));
        }
      }
    } else if (mode === 'after-assignment') {
      const referenceId = assignment.startAfterId;
      if (
        referenceId &&
        referenceId !== assignmentId &&
        lookup.has(referenceId) &&
        !visited.has(referenceId)
      ) {
        const nextVisited = new Set(visited);
        nextVisited.add(assignmentId);
        const referenceStart = computeStart(referenceId, nextVisited);
        const reference = lookup.get(referenceId);
        if (reference) {
          const referenceDuration = Math.max(1, Math.round(reference.assignment.durationDays));
          resolved = referenceStart + referenceDuration;
        }
      }
    }

    memo.set(assignmentId, resolved);
    return resolved;
  };

  const schedule = new Map<string, AssignmentSchedule>();
  lookup.forEach((record, assignmentId) => {
    const startDay = computeStart(assignmentId, new Set());
    const durationDays = Math.max(1, Math.round(record.assignment.durationDays));
    const startDate = baseStart ? addDays(baseStart, startDay) : null;
    schedule.set(assignmentId, { startDay, durationDays, startDate });
  });

  return schedule;
};

type ApprovalStageDraft = {
  id: string;
  title: string;
  approver: string;
  status: InitiativeApprovalStatus;
  comment: string;
};

type CreationStep = 'details' | 'work' | 'team';

type InitiativeCreationModalProps = {
  isOpen: boolean;
  experts: ExpertProfile[];
  domains: DomainNode[];
  modules: ModuleNode[];
  domainNameMap: Record<string, string>;
  onClose: () => void;
  onSubmit: (draft: InitiativeCreationRequest) => void | Promise<void>;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  mode?: 'create' | 'edit';
  initialDraft?: InitiativeCreationRequest | null;
};

const statusOptions: SelectOption<InitiativeStatus>[] = [
  { label: 'Инициирована', value: 'initiated' },
  { label: 'В работе', value: 'in-progress' },
  { label: 'Конвертирована', value: 'converted' }
];

const buildRoleOptions = (roles: TeamRole[]): SelectOption<TeamRole>[] =>
  roles.map((role) => ({ label: role, value: role }));

const workItemStatusOptions: SelectOption<InitiativeWorkItemStatus>[] = [
  { label: 'Исследование', value: 'discovery' },
  { label: 'Проектирование', value: 'design' },
  { label: 'Пилот', value: 'pilot' },
  { label: 'Внедрение', value: 'delivery' }
];

const startModeOptions: SelectOption<AssignmentStartMode>[] = [
  { label: 'С начала проекта', value: 'project-start' },
  { label: 'После задачи/работы', value: 'after-assignment' },
  { label: 'С определённой даты', value: 'fixed-date' }
];

const approvalStatusOptions: SelectOption<InitiativeApprovalStatus>[] = [
  { label: 'Ожидание', value: 'pending' },
  { label: 'В работе', value: 'in-progress' },
  { label: 'Одобрено', value: 'approved' }
];

const creationStepOrder: CreationStep[] = ['details', 'work', 'team'];
const creationStepTitles: Record<CreationStep, string> = {
  details: 'Вводная информация',
  work: 'Оценка работ',
  team: 'Команда'
};
const creationStepDescriptions: Record<CreationStep, string> = {
  details: 'Заполните данные о заказчике и основные параметры инициативы.',
  work: 'Опишите работы по ролям, сформируйте план и уточните задачи.',
  team: 'Сформируйте команду на основе ранжирования рекомендованных экспертов.'
};

const createId = () => `tmp-${Math.random().toString(36).slice(2, 11)}`;

const resolveTaskLabel = (rawValue: string, fallback: string): string => {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return fallback;
  }
  return getSkillNameById(trimmed) ?? trimmed;
};

const MS_IN_DAY = 24 * 60 * 60 * 1000;

const startOfDay = (input: Date): Date => {
  const result = new Date(input);
  result.setHours(0, 0, 0, 0);
  return result;
};

const addDays = (input: Date, amount: number): Date => {
  const result = new Date(input);
  result.setDate(result.getDate() + amount);
  return result;
};

const differenceInDays = (start: Date, end: Date): number => {
  const startTime = startOfDay(start).getTime();
  const endTime = startOfDay(end).getTime();
  return Math.floor((endTime - startTime) / MS_IN_DAY);
};

const startDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short',
  year: 'numeric'
});

const DEFAULT_ROLE: TeamRole = 'Аналитик';

const createWorkAssignmentDraft = (
  role: TeamRole = DEFAULT_ROLE,
  startDay = 0,
  durationDays = 5
): WorkAssignmentDraft => ({
  id: createId(),
  role,
  task: '',
  description: '',
  effortDays: 5,
  startDay,
  durationDays,
  startMode: 'project-start',
  startAfterId: null,
  startDate: null
});

const createWorkDraft = (role: TeamRole = DEFAULT_ROLE, offset = 0): WorkDraft => ({
  id: createId(),
  title: '',
  description: '',
  assumptions: '',
  owner: '',
  timeframe: '',
  status: 'discovery',
  assignments: [createWorkAssignmentDraft(role, offset)]
});

const createApprovalStageDraft = (): ApprovalStageDraft => ({
  id: createId(),
  title: '',
  approver: '',
  status: 'pending',
  comment: ''
});

const buildWorksFromCreationDraft = (
  draft: InitiativeCreationRequest,
  defaultRole: TeamRole
): WorkDraft[] => {
  const workMap = new Map<string, WorkDraft>();
  const baseStartDate = draft.startDate ? startOfDay(new Date(draft.startDate)) : null;
  const workItemMetadata = new Map(
    draft.workItems.map((item) => [item.id, item])
  );

  draft.roles.forEach((role) => {
    role.workItems.forEach((item, index) => {
      const workId = item.id || `${role.id}-work-${index + 1}`;
      const metadata = workItemMetadata.get(workId);
      let work = workMap.get(workId);

      if (!work) {
        work = {
          id: workId,
          title: item.title || metadata?.title || '',
          description: item.description || metadata?.description || '',
          assumptions: item.assumptions?.trim() ?? '',
          owner: metadata?.owner ?? '',
          timeframe: metadata?.timeframe ?? '',
          status: metadata?.status ?? 'discovery',
          assignments: []
        };
        workMap.set(workId, work);
      } else {
        if (!work.owner && metadata?.owner) {
          work.owner = metadata.owner;
        }
        if (!work.timeframe && metadata?.timeframe) {
          work.timeframe = metadata.timeframe;
        }
        if (!metadata && !work.status) {
          work.status = 'discovery';
        } else if (metadata?.status) {
          work.status = metadata.status;
        }
      }

      if (metadata) {
        workItemMetadata.delete(workId);
      }

      const tasks = item.tasks ?? [];
      const normalizedStart = Math.max(0, Math.round(item.startDay));
      const normalizedDuration = Math.max(1, Math.round(item.durationDays));
      const startDateValue =
        baseStartDate !== null ? addDays(baseStartDate, normalizedStart).toISOString().slice(0, 10) : null;
      const startMode: AssignmentStartMode =
        normalizedStart === 0 || !startDateValue ? 'project-start' : 'fixed-date';
      const assignment: WorkAssignmentDraft = {
        id: createId(),
        role: role.role,
        task: tasks[0]?.skill ?? '',
        description: item.description ?? '',
        effortDays: Math.max(1, Math.round(item.effortDays)),
        startDay: normalizedStart,
        durationDays: normalizedDuration,
        startMode,
        startAfterId: null,
        startDate: startDateValue,
        isCustom: tasks.some((task) => task.isCustom),
        tasks: tasks.map((task) => task.skill)
      };

      work.assignments.push(assignment);
    });
  });

  workItemMetadata.forEach((metadata, workId) => {
    const existing = workMap.get(workId);
    if (existing) {
      const nextTitle = metadata.title ?? '';
      const nextDescription = metadata.description ?? '';
      const nextOwner = metadata.owner ?? '';
      const nextTimeframe = metadata.timeframe ?? '';
      const nextStatus = metadata.status;

      existing.title = existing.title || nextTitle;
      existing.description = existing.description || nextDescription;
      if (nextOwner) {
        existing.owner = nextOwner;
      }
      if (nextTimeframe) {
        existing.timeframe = nextTimeframe;
      }
      if (nextStatus) {
        existing.status = nextStatus;
      } else if (!existing.status) {
        existing.status = 'discovery';
      }
      return;
    }

    workMap.set(workId, {
      id: workId,
      title: metadata.title ?? '',
      description: metadata.description ?? '',
      assumptions: '',
      owner: metadata.owner ?? '',
      timeframe: metadata.timeframe ?? '',
      status: metadata.status ?? 'discovery',
      assignments: [createWorkAssignmentDraft(defaultRole)]
    });
  });

  const works = Array.from(workMap.values()).map((work) => ({
    ...work,
    assumptions: work.assumptions ?? '',
    assignments:
      work.assignments.length > 0 ? work.assignments : [createWorkAssignmentDraft()]
  }));

  return works.length > 0 ? works : [createWorkDraft(defaultRole)];
};

const InitiativeCreationModal: React.FC<InitiativeCreationModalProps> = ({
  isOpen,
  experts,
  domains,
  modules,
  domainNameMap,
  onClose,
  onSubmit,
  isSubmitting = false,
  errorMessage = null,
  mode = 'create',
  initialDraft = null
}) => {
  const graphDomainIds = useMemo(() => collectGraphDomainIds(domains), [domains]);
  const domainBaseItems = useMemo<OptionItem[]>(
    () =>
      graphDomainIds
        .map((id) => ({ id, label: domainNameMap[id] ?? id, value: id }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
    [domainNameMap, graphDomainIds]
  );

  const moduleBaseItems = useMemo<OptionItem[]>(
    () =>
      modules
        .map((module) => ({ id: module.id, label: module.name, value: module.id }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
    [modules]
  );

  const companyBaseItems = useMemo<OptionItem[]>(() => {
    const companyNames = new Set<string>();
    modules.forEach((module) => {
      if (module.ridOwner?.company) {
        companyNames.add(module.ridOwner.company);
      }
      module.userStats.companies.forEach((company) => companyNames.add(company.name));
    });
    return Array.from(companyNames)
      .sort((a, b) => a.localeCompare(b, 'ru'))
      .map((name) => ({ id: name, label: name, value: name }));
  }, [modules]);

  const unitBaseItems = useMemo<OptionItem[]>(() => {
    const unitNames = new Set<string>();
    modules.forEach((module) => {
      if (module.ridOwner?.division) {
        unitNames.add(module.ridOwner.division);
      }
    });
    return Array.from(unitNames)
      .sort((a, b) => a.localeCompare(b, 'ru'))
      .map((name) => ({ id: name, label: name, value: name }));
  }, [modules]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('');
  const [expectedImpact, setExpectedImpact] = useState('');
  const [targetModule, setTargetModule] = useState('');
  const [status, setStatus] = useState<InitiativeStatus>('initiated');
  const [initiativeStartDate, setInitiativeStartDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [domainItems, setDomainItems] = useState<OptionItem[]>(() => [...domainBaseItems]);
  const [selectedDomains, setSelectedDomains] = useState<OptionItem[]>([]);
  const [isCreatingDomain, setIsCreatingDomain] = useState(false);
  const [newDomainLabel, setNewDomainLabel] = useState('');
  const [moduleItems, setModuleItems] = useState<OptionItem[]>(() => [...moduleBaseItems]);
  const [selectedModules, setSelectedModules] = useState<OptionItem[]>([]);
  const [isCreatingModule, setIsCreatingModule] = useState(false);
  const [newModuleLabel, setNewModuleLabel] = useState('');
  const [companyItems, setCompanyItems] = useState<OptionItem[]>(() => [...companyBaseItems]);
  const [selectedCompanies, setSelectedCompanies] = useState<OptionItem[]>([]);
  const [isCreatingCompany, setIsCreatingCompany] = useState(false);
  const [newCompanyLabel, setNewCompanyLabel] = useState('');
  const [unitItems, setUnitItems] = useState<OptionItem[]>(() => [...unitBaseItems]);
  const [selectedUnits, setSelectedUnits] = useState<OptionItem[]>([]);
  const [isCreatingUnit, setIsCreatingUnit] = useState(false);
  const [newUnitLabel, setNewUnitLabel] = useState('');
  const [customerRepresentative, setCustomerRepresentative] = useState('');
  const [customerContact, setCustomerContact] = useState('');
  const [customerComment, setCustomerComment] = useState('');
  const initialRegistryRoles = getKnownRoles();
  const initialPrimaryRole = initialRegistryRoles[0] ?? DEFAULT_ROLE;

  const [works, setWorks] = useState<WorkDraft[]>([createWorkDraft(initialPrimaryRole)]);
  const [collapsedWorkIds, setCollapsedWorkIds] = useState<string[]>([]);
  const [approvalStages, setApprovalStages] = useState<ApprovalStageDraft[]>([
    createApprovalStageDraft()
  ]);
  const [activeStep, setActiveStep] = useState<CreationStep>('details');
  const skillRegistryVersion = useSkillRegistryVersion();
  const roleOptions = useMemo<SelectOption<TeamRole>[]>(() => {
    void skillRegistryVersion;
    const registryRoles = getKnownRoles();
    const resolvedRoles = registryRoles.length > 0 ? registryRoles : defaultTeamRoles;
    return buildRoleOptions(resolvedRoles);
  }, [skillRegistryVersion]);
  const primaryRole = useMemo<TeamRole>(
    () => roleOptions[0]?.value ?? DEFAULT_ROLE,
    [roleOptions]
  );
  const baseRoleSkillOptions = useMemo<Record<TeamRole, OptionItem[]>>(
    () =>
      roleOptions.reduce((acc, option) => {
        void skillRegistryVersion;
        const skillOptions = getSkillsByRole(option.value)
          .filter((skill) => skill.category === 'hard')
          .map((skill) => ({
            id: skill.id,
            label: skill.name,
            value: skill.id
          }))
          .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
        acc[option.value] = skillOptions;
        return acc;
      }, {} as Record<TeamRole, OptionItem[]>),
    [roleOptions, skillRegistryVersion]
  );
  const createRoleSkillState = useCallback(
    () =>
      roleOptions.reduce((acc, option) => {
        acc[option.value] = [...(baseRoleSkillOptions[option.value] ?? [])];
        return acc;
      }, {} as Record<TeamRole, OptionItem[]>),
    [baseRoleSkillOptions, roleOptions]
  );
  const [roleSkillOptions, setRoleSkillOptions] = useState<Record<TeamRole, OptionItem[]>>(
    () => createRoleSkillState()
  );

  useEffect(() => {
    setRoleSkillOptions((prev) => {
      const next = createRoleSkillState();
      const allowedRoles = new Set(roleOptions.map((option) => option.value));

      Object.entries(prev).forEach(([role, options]) => {
        const roleKey = role as TeamRole;
        if (!allowedRoles.has(roleKey)) {
          return;
        }
        const existing = next[roleKey] ?? [];
        const merged = [...existing];

        options.forEach((option) => {
          if (!merged.some((item) => item.value === option.value)) {
            merged.push(option);
          }
        });

        next[roleKey] = merged.sort((a, b) => a.label.localeCompare(b.label, 'ru'));
      });

      return next;
    });
  }, [createRoleSkillState]);

  useEffect(() => {
    const allowedRoles = new Set(roleOptions.map((option) => option.value));
    setWorks((prev) =>
      prev.map((work) => ({
        ...work,
        assignments: work.assignments.map((assignment) => {
          const normalizedRole = allowedRoles.has(assignment.role) ? assignment.role : primaryRole;
          const roleChanged = normalizedRole !== assignment.role;

          return {
            ...assignment,
            role: normalizedRole,
            task: roleChanged ? '' : assignment.task,
            isCustom: roleChanged ? undefined : assignment.isCustom
          };
        })
      }))
    );
  }, [primaryRole, roleOptions]);

  const hydrateFromDraft = useCallback(
    (draft: InitiativeCreationRequest | null) => {
      if (!draft) {
        setName('');
        setDescription('');
        setOwner('');
        setExpectedImpact('');
      setTargetModule('');
      setStatus('initiated');
      setInitiativeStartDate(new Date().toISOString().slice(0, 10));
      setDomainItems([...domainBaseItems]);
        setSelectedDomains([]);
        setIsCreatingDomain(false);
        setNewDomainLabel('');
        setModuleItems([...moduleBaseItems]);
        setSelectedModules([]);
        setIsCreatingModule(false);
        setNewModuleLabel('');
        setCompanyItems([...companyBaseItems]);
        setSelectedCompanies([]);
        setIsCreatingCompany(false);
        setNewCompanyLabel('');
        setUnitItems([...unitBaseItems]);
        setSelectedUnits([]);
        setCustomerRepresentative('');
        setCustomerContact('');
        setCustomerComment('');
        setWorks([createWorkDraft(primaryRole)]);
        setApprovalStages([createApprovalStageDraft()]);
        setRoleSkillOptions(createRoleSkillState());
        setActiveStep('details');
        return;
      }

      setName(draft.name);
      setDescription(draft.description);
      setOwner(draft.owner);
      setExpectedImpact(draft.expectedImpact);
      setTargetModule(draft.targetModuleName);
      setStatus(draft.status);
      setInitiativeStartDate(draft.startDate ?? new Date().toISOString().slice(0, 10));

      const nextDomainItems = [...domainBaseItems];
      const domainSelections = draft.domains
        .map((domain) => domain.trim())
        .filter(Boolean)
        .map((domain) => {
          const existing = nextDomainItems.find((item) => item.value === domain);
          if (existing) {
            return existing;
          }
          const option: OptionItem = {
            id: `prefill-domain-${domain}`,
            label: domain,
            value: domain,
            isCustom: true
          };
          nextDomainItems.push(option);
          return option;
        });
      setDomainItems(nextDomainItems);
      setSelectedDomains(domainSelections);
      setIsCreatingDomain(false);
      setNewDomainLabel('');

      const nextModuleItems = [...moduleBaseItems];
      const moduleSelections = Array.from(
        new Set(
          draft.potentialModules
            .map((module) => module.trim())
            .filter((module) => module.length > 0)
        )
      ).map((module) => {
        const existing = nextModuleItems.find((item) => item.value === module);
        if (existing) {
          return existing;
        }
        const option: OptionItem = {
          id: `prefill-module-${module}`,
          label: module,
          value: module,
          isCustom: true
        };
        nextModuleItems.push(option);
        return option;
      });
      setModuleItems(nextModuleItems);
      setSelectedModules(moduleSelections);
      setIsCreatingModule(false);
      setNewModuleLabel('');

      const nextCompanyItems = [...companyBaseItems];
      const companySelections = (draft.customer?.companies ?? [])
        .map((company) => company.trim())
        .filter((company) => company.length > 0)
        .map((company) => {
          const existing = nextCompanyItems.find((item) => item.value === company);
          if (existing) {
            return existing;
          }
          const option: OptionItem = {
            id: `prefill-company-${company}`,
            label: company,
            value: company,
            isCustom: true
          };
          nextCompanyItems.push(option);
          return option;
        });
      setCompanyItems(nextCompanyItems);
      setSelectedCompanies(companySelections);
      setIsCreatingCompany(false);
      setNewCompanyLabel('');

      const nextUnitItems = [...unitBaseItems];
      const unitSelections = (draft.customer?.units ?? [])
        .map((unit) => unit.trim())
        .filter((unit) => unit.length > 0)
        .map((unit) => {
          const existing = nextUnitItems.find((item) => item.value === unit);
          if (existing) {
            return existing;
          }
          const option: OptionItem = {
            id: `prefill-unit-${unit}`,
            label: unit,
            value: unit,
            isCustom: true
          };
          nextUnitItems.push(option);
          return option;
        });
      setUnitItems(nextUnitItems);
      setSelectedUnits(unitSelections);
      setIsCreatingUnit(false);
      setNewUnitLabel('');

      setCustomerRepresentative(draft.customer?.representative ?? '');
      setCustomerContact(draft.customer?.contact ?? '');
      setCustomerComment(draft.customer?.comment ?? '');

      const worksFromDraft = buildWorksFromCreationDraft(draft, primaryRole);
      setWorks(worksFromDraft);

      const nextRoleSkills = createRoleSkillState();
      worksFromDraft.forEach((work) => {
        work.assignments.forEach((assignment) => {
          const normalizedTask = assignment.task.trim();
          if (!normalizedTask) {
            return;
          }
          const existingOptions = nextRoleSkills[assignment.role] ?? [];
          if (!existingOptions.some((option) => option.value === normalizedTask)) {
            const option: OptionItem = {
              id: `prefill-skill-${assignment.role}-${normalizedTask}`,
              label: resolveTaskLabel(normalizedTask, normalizedTask),
              value: normalizedTask,
              isCustom: true
            };
            const merged = [...existingOptions, option].sort((a, b) =>
              a.label.localeCompare(b.label, 'ru')
            );
            nextRoleSkills[assignment.role] = merged;
          }
        });
      });
      setRoleSkillOptions(nextRoleSkills);
      const stageDrafts =
        draft.approvalStages.length > 0
          ? draft.approvalStages.map((stage) => ({
              id: stage.id || createId(),
              title: stage.title,
              approver: stage.approver,
              status: stage.status,
              comment: stage.comment ?? ''
            }))
          : [createApprovalStageDraft()];
      setApprovalStages(stageDrafts);
      setActiveStep('details');
    },
    [
      companyBaseItems,
      createRoleSkillState,
      domainBaseItems,
      primaryRole,
      moduleBaseItems,
      unitBaseItems
    ]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    hydrateFromDraft(initialDraft);
  }, [hydrateFromDraft, initialDraft, isOpen]);

  const handleDomainSelectionChange = (items: OptionItem[] | null) => {
    const nextItems = (items ?? []).filter((item) => item.id !== NEW_DOMAIN_OPTION_ID);
    const uniqueItems = nextItems.filter(
      (item, index, array) => array.findIndex((candidate) => candidate.value === item.value) === index
    );
    if (items?.some((item) => item.id === NEW_DOMAIN_OPTION_ID)) {
      setIsCreatingDomain(true);
    }
    setSelectedDomains(uniqueItems);
  };

  const handleModuleSelectionChange = (items: OptionItem[] | null) => {
    const nextItems = (items ?? []).filter((item) => item.id !== NEW_MODULE_OPTION_ID);
    const uniqueItems = nextItems.filter(
      (item, index, array) => array.findIndex((candidate) => candidate.value === item.value) === index
    );
    if (items?.some((item) => item.id === NEW_MODULE_OPTION_ID)) {
      setIsCreatingModule(true);
    }
    setSelectedModules(uniqueItems);
  };

  const handleCompanySelectionChange = (items: OptionItem[] | null) => {
    const nextItems = (items ?? []).filter((item) => item.id !== NEW_COMPANY_OPTION_ID);
    const uniqueItems = nextItems.filter(
      (item, index, array) => array.findIndex((candidate) => candidate.value === item.value) === index
    );
    if (items?.some((item) => item.id === NEW_COMPANY_OPTION_ID)) {
      setIsCreatingCompany(true);
    }
    setSelectedCompanies(uniqueItems);
  };

  const handleUnitSelectionChange = (items: OptionItem[] | null) => {
    const nextItems = (items ?? []).filter((item) => item.id !== NEW_UNIT_OPTION_ID);
    const uniqueItems = nextItems.filter(
      (item, index, array) => array.findIndex((candidate) => candidate.value === item.value) === index
    );
    if (items?.some((item) => item.id === NEW_UNIT_OPTION_ID)) {
      setIsCreatingUnit(true);
    }
    setSelectedUnits(uniqueItems);
  };

  const handleAddCustomDomain = () => {
    const trimmed = newDomainLabel.trim();
    if (!trimmed) {
      return;
    }
    const existing = domainItems.find(
      (item) => item.label.toLowerCase() === trimmed.toLowerCase() || item.value.toLowerCase() === trimmed.toLowerCase()
    );
    const nextItem =
      existing ?? {
        id: `custom-domain-${createId()}`,
        label: trimmed,
        value: trimmed,
        isCustom: true
      };
    setDomainItems((prev) => (existing ? prev : [...prev, nextItem]));
    setSelectedDomains((prev) => {
      const combined = existing ? prev : [...prev, nextItem];
      return combined.filter(
        (item, index, array) => array.findIndex((candidate) => candidate.value === item.value) === index
      );
    });
    setNewDomainLabel('');
    setIsCreatingDomain(false);
  };

  const handleAddCustomModule = () => {
    const trimmed = newModuleLabel.trim();
    if (!trimmed) {
      return;
    }
    const existing = moduleItems.find(
      (item) => item.label.toLowerCase() === trimmed.toLowerCase() || item.value.toLowerCase() === trimmed.toLowerCase()
    );
    const nextItem =
      existing ?? {
        id: `custom-module-${createId()}`,
        label: trimmed,
        value: trimmed,
        isCustom: true
      };
    setModuleItems((prev) => (existing ? prev : [...prev, nextItem]));
    setSelectedModules((prev) => {
      const combined = existing ? prev : [...prev, nextItem];
      return combined.filter(
        (item, index, array) => array.findIndex((candidate) => candidate.value === item.value) === index
      );
    });
    setNewModuleLabel('');
    setIsCreatingModule(false);
  };

  const handleAddCustomCompany = () => {
    const trimmed = newCompanyLabel.trim();
    if (!trimmed) {
      return;
    }
    const existing = companyItems.find(
      (item) => item.label.toLowerCase() === trimmed.toLowerCase() || item.value.toLowerCase() === trimmed.toLowerCase()
    );
    const nextItem =
      existing ?? {
        id: `custom-company-${createId()}`,
        label: trimmed,
        value: trimmed,
        isCustom: true
      };
    setCompanyItems((prev) => (existing ? prev : [...prev, nextItem]));
    setSelectedCompanies((prev) => {
      const combined = existing ? prev : [...prev, nextItem];
      return combined.filter(
        (item, index, array) => array.findIndex((candidate) => candidate.value === item.value) === index
      );
    });
    setNewCompanyLabel('');
    setIsCreatingCompany(false);
  };

  const handleAddCustomUnit = () => {
    const trimmed = newUnitLabel.trim();
    if (!trimmed) {
      return;
    }
    const existing = unitItems.find(
      (item) =>
        item.label.toLowerCase() === trimmed.toLowerCase() || item.value.toLowerCase() === trimmed.toLowerCase()
    );
    const nextItem =
      existing ?? {
        id: `custom-unit-${createId()}`,
        label: trimmed,
        value: trimmed,
        isCustom: true
      };
    setUnitItems((prev) => (existing ? prev : [...prev, nextItem]));
    setSelectedUnits((prev) => {
      const combined = existing ? prev : [...prev, nextItem];
      return combined.filter(
        (item, index, array) => array.findIndex((candidate) => candidate.value === item.value) === index
      );
    });
    setNewUnitLabel('');
    setIsCreatingUnit(false);
  };

  const handleAssignmentStartModeChange = (
    workId: string,
    assignmentId: string,
    mode: AssignmentStartMode
  ) => {
    if (mode === 'after-assignment') {
      const fallback = assignmentReferenceOptions.find((option) => option.value !== assignmentId);
      if (!fallback) {
        handleAssignmentChange(workId, assignmentId, {
          startMode: 'project-start',
          startAfterId: null,
          startDate: null
        });
        return;
      }
      handleAssignmentChange(workId, assignmentId, {
        startMode: mode,
        startAfterId: fallback?.value ?? null
      });
      return;
    }

    if (mode === 'fixed-date') {
      const currentAssignment = works
        .find((work) => work.id === workId)
        ?.assignments.find((assignment) => assignment.id === assignmentId);
      const fallbackDate =
        initiativeStartDate?.trim() && initiativeStartDate.length > 0
          ? initiativeStartDate
          : new Date().toISOString().slice(0, 10);
      const defaultDate = currentAssignment?.startDate ?? fallbackDate;
      handleAssignmentChange(workId, assignmentId, {
        startMode: mode,
        startAfterId: null,
        startDate: defaultDate
      });
      return;
    }

    handleAssignmentChange(workId, assignmentId, {
      startMode: mode,
      startAfterId: null,
      startDate: null
    });
  };

  const handleAssignmentStartAfterChange = (
    workId: string,
    assignmentId: string,
    referenceId: string | null
  ) => {
    handleAssignmentChange(workId, assignmentId, {
      startMode: 'after-assignment',
      startAfterId: referenceId ?? null
    });
  };

  const handleAssignmentStartDateChange = (
    workId: string,
    assignmentId: string,
    date: string | null
  ) => {
    handleAssignmentChange(workId, assignmentId, {
      startMode: 'fixed-date',
      startDate: date ?? null
    });
  };

  const assignmentSchedule = useMemo(
    () => buildAssignmentSchedule(works, initiativeStartDate?.trim() ? initiativeStartDate : null),
    [works, initiativeStartDate]
  );

  useEffect(() => {
    setCollapsedWorkIds((prev) => prev.filter((id) => works.some((work) => work.id === id)));
  }, [works]);

  const ganttTasks = useMemo<InitiativeGanttTask[]>(
    () =>
      works.flatMap((work) => {
        const normalizedTitle = work.title.trim() || 'Задача';
        return work.assignments.flatMap((assignment, index) => {
          const normalizedTaskName = resolveTaskLabel(assignment.task, normalizedTitle);
          const schedule = assignmentSchedule.get(assignment.id);
          const normalizedStart = schedule?.startDay ?? Math.max(0, Math.round(assignment.startDay));
          const normalizedDuration = schedule?.durationDays ?? Math.max(1, Math.round(assignment.durationDays));
          const normalizedEffort = Math.max(1, Math.round(assignment.effortDays));
          const resources: InitiativeGanttResource[] = assignment.assignedExpertId
            ? [
                {
                  id: assignment.assignedExpertId,
                  name: assignment.assignedExpertId,
                  role: assignment.role,
                  units: 1
                }
              ]
            : [];
          const blockers: InitiativeGanttBlocker[] = assignment.assignedExpertId
            ? []
            : [
                {
                  id: `${work.id}-${assignment.id}-blocker`,
                  scope: 'task',
                  reason: 'Не выбран исполнитель',
                  active: true
                }
              ];
          const dependencies: InitiativeGanttDependency[] = [];
          if (index > 0) {
            const previous = work.assignments[index - 1];
            dependencies.push({ id: `${work.id}-${previous.id}`, type: 'FS' });
          }
          if (assignment.startMode === 'after-assignment' && assignment.startAfterId) {
            dependencies.push({ id: assignment.startAfterId, type: 'FS' });
          }

          const baseTask: InitiativeGanttTask = {
            id: `${work.id}-${assignment.id}`,
            name: normalizedTaskName,
            role: assignment.role,
            workId: work.id,
            workName: normalizedTitle,
            startDay: normalizedStart,
            durationDays: normalizedDuration,
            effortDays: normalizedEffort,
            effortHours: normalizedEffort * 8,
            minUnits: Math.max(1, Math.round(assignment.minUnits ?? 1)),
            maxUnits: Math.max(1, Math.round(assignment.maxUnits ?? assignment.roleUnits ?? 1)),
            canSplit: Boolean(assignment.canSplit ?? true),
            parallelAllowed: Boolean(assignment.parallel ?? true),
            durationMode: assignment.durationMode ?? 'fixed-effort',
            constraints:
              normalizedStart > 0
                ? [`SNET D${normalizedStart + 1}`]
                : assignment.constraints?.map((constraint) => constraint.label),
            priority: assignment.priority ?? index + 1,
            wipLimitTag: assignment.wipLimitTag,
            assignedExpert: assignment.assignedExpertId,
            resources,
            dependencies,
            blockers,
            scenarioBranch: assignment.branchLabel ?? 'Черновик',
            calendarId: assignment.calendarId ?? 'project-calendar'
          };

          return [baseTask];
        });
      }),
    [assignmentSchedule, works]
  );

  const totalEffortDays = works.reduce((acc, work) => {
    const workEffort = work.assignments.reduce(
      (assignmentAcc, assignment) => assignmentAcc + Math.max(1, Math.round(assignment.effortDays)),
      0
    );
    return acc + workEffort;
  }, 0);

  const isWorkPlanningReady = useMemo(
    () =>
      works.length > 0 &&
      works.every(
        (work) =>
          work.title.trim().length > 0 &&
          work.assignments.length > 0 &&
          work.assignments.every((assignment) => assignment.task.trim().length > 0)
      ),
    [works]
  );

  const isSubmitDisabled = !name.trim() || selectedDomains.length === 0 || !isWorkPlanningReady;

  useEffect(() => {
    if (activeStep === 'team' && !isWorkPlanningReady) {
      setActiveStep('work');
    }
  }, [activeStep, isWorkPlanningReady]);

  useEffect(() => {
    if (selectedDomains.length === 0 && activeStep !== 'details') {
      setActiveStep('details');
    }
  }, [activeStep, selectedDomains]);

  const totalSteps = creationStepOrder.length;
  const currentStepIndex = creationStepOrder.indexOf(activeStep) + 1;
  const currentStepTitle = creationStepTitles[activeStep];
  const currentStepDescription = creationStepDescriptions[activeStep];
  const modalTitle = mode === 'edit' ? 'Редактирование инициативы' : 'Новая инициатива';
  const submitButtonLabel = mode === 'edit' ? 'Сохранить изменения' : 'Создать инициативу';
  const teamStepForwardLabel = mode === 'edit' ? 'Обновить команду' : 'Сформировать команду';

  const assignmentReferenceOptions = useMemo<SelectOption<string>[]>(() => {
    const options: SelectOption<string>[] = [];
    works.forEach((work) => {
      const workTitle = work.title.trim() || 'Работа';
      work.assignments.forEach((assignment) => {
        const label = `${workTitle} · ${resolveTaskLabel(assignment.task, workTitle)}`;
        options.push({ label, value: assignment.id });
      });
    });
    return options;
  }, [works]);

  const { planningRoles, roleAssignmentRefs } = useMemo(() => {
    const accumulator = new Map<
      TeamRole,
      {
        assignments: {
          workId: string;
          assignmentId: string;
          workDraft: RolePlanningDraft['workItems'][number];
        }[];
        skills: Set<string>;
      }
    >();

    works.forEach((work) => {
      const normalizedTitle = work.title.trim() || 'Задача';
      const normalizedDescription = work.description.trim();
      work.assignments.forEach((assignment) => {
        const schedule = assignmentSchedule.get(assignment.id);
        const assignmentStart = schedule?.startDay ?? Math.max(0, Math.round(assignment.startDay));
        const assignmentDuration = schedule?.durationDays ?? Math.max(1, Math.round(assignment.durationDays));
        const entry =
          accumulator.get(assignment.role) ??
          {
            assignments: [],
            skills: new Set<string>()
          };
        const trimmedTask = assignment.task.trim();
        if (trimmedTask) {
          entry.skills.add(trimmedTask);
        }

        const assignmentDescription = assignment.description.trim();
        const assignmentEffort = Math.max(1, Math.round(assignment.effortDays));

        entry.assignments.push({
          workId: work.id,
          assignmentId: assignment.id,
          workDraft: {
            id: `${work.id}-${assignment.id}`,
            title: normalizedTitle,
            description:
              assignmentDescription ||
              normalizedDescription ||
              'Описание не заполнено',
            startDay: assignmentStart,
            durationDays: assignmentDuration,
            effortDays: assignmentEffort,
            tasks: trimmedTask ? [trimmedTask] : []
          }
        });

        accumulator.set(assignment.role, entry);
      });
    });

    const assignmentRefs = new Map<
      string,
      { workId: string; assignmentId: string; workDraftId: string }[]
    >();
    const planning: RolePlanningDraft[] = Array.from(accumulator.entries()).map(
      ([role, data]) => {
        const id = role;
        assignmentRefs.set(
          id,
          data.assignments.map((item) => ({
            workId: item.workId,
            assignmentId: item.assignmentId,
            workDraftId: item.workDraft.id
          }))
        );
        return {
          id,
          role,
          required: data.assignments.length,
          skills: Array.from(data.skills),
          workItems: data.assignments.map((item) => item.workDraft)
        };
      }
    );

    return { planningRoles: planning, roleAssignmentRefs: assignmentRefs };
  }, [assignmentSchedule, works]);

  const draftPayload = useMemo<InitiativeCreationRequest>(
    () => {
      const workLookup = new Map(works.map((work) => [work.id, work]));
      const workItemsPayload = works.map((work) => ({
        id: work.id,
        title: work.title.trim(),
        description: work.description.trim(),
        owner: work.owner.trim(),
        timeframe: work.timeframe.trim(),
        status: work.status
      }));
      const approvalStagePayload = approvalStages
        .map((stage) => {
          const title = stage.title.trim();
          const approver = stage.approver.trim();
          const comment = stage.comment.trim();
          if (!title && !approver && !comment) {
            return null;
          }
          return {
            id: stage.id,
            title,
            approver,
            status: stage.status,
            comment: comment || undefined
          };
        })
        .filter((stage): stage is NonNullable<typeof stage> => stage !== null);
      return {
        name: name.trim(),
        description: description.trim(),
        owner: owner.trim(),
        expectedImpact: expectedImpact.trim(),
        targetModuleName: targetModule.trim(),
        status,
        domains: selectedDomains.map((item) => item.value.trim()).filter(Boolean),
        potentialModules: selectedModules.map((item) => item.value.trim()).filter(Boolean),
        startDate: initiativeStartDate?.trim() || undefined,
        customer: {
          companies: selectedCompanies
            .map((item) => item.value.trim())
            .filter((value) => value.length > 0),
          units: selectedUnits
            .map((item) => item.value.trim())
            .filter((value) => value.length > 0),
          representative: customerRepresentative.trim(),
          contact: customerContact.trim(),
          comment: customerComment.trim() || undefined
        },
        roles: planningRoles.map((role) => {
          const assignmentRefs = roleAssignmentRefs.get(role.id) ?? [];
          const workItems = role.workItems.map((work) => {
            const ref = assignmentRefs.find((item) => item.workDraftId === work.id);
            const sourceWork = ref ? workLookup.get(ref.workId) : undefined;
            const assignment = ref
              ? sourceWork?.assignments.find((candidate) => candidate.id === ref.assignmentId)
              : undefined;
            const trimmedTask = assignment?.task.trim() ?? '';
            const tasks = trimmedTask
              ? [
                  assignment?.isCustom
                    ? { id: assignment.id, skill: trimmedTask, isCustom: true as const }
                    : { id: assignment?.id ?? work.id, skill: trimmedTask }
                ]
              : [];

            return {
              ...work,
              assumptions: sourceWork?.assumptions.trim() ? sourceWork.assumptions.trim() : undefined,
              tasks
            };
          });

          return {
            id: role.id,
            role: role.role,
            required: role.required,
            skills: role.skills,
            workItems
          };
        }),
        workItems: workItemsPayload,
        approvalStages: approvalStagePayload
      };
    },
    [
      approvalStages,
      customerComment,
      customerContact,
      customerRepresentative,
      description,
      expectedImpact,
      name,
      owner,
      planningRoles,
      roleAssignmentRefs,
      selectedCompanies,
      selectedUnits,
      selectedDomains,
      selectedModules,
      status,
      targetModule,
      works,
      initiativeStartDate
    ]
  );

  const matchReports = useMemo(
    () => buildRoleMatchReports(planningRoles, experts),
    [experts, planningRoles]
  );

  const candidatePreviewMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildCandidatesFromReport>>();
    matchReports.forEach((report) => {
      map.set(report.requirement.roleId, buildCandidatesFromReport(report));
    });
    return map;
  }, [matchReports]);

  const expertLookup = useMemo(() => {
    const lookup = new Map(
      experts.map((expert) => [expert.id, { name: expert.fullName, title: expert.title }])
    );
    return lookup;
  }, [experts]);

  const handleWorkChange = (workId: string, patch: Partial<WorkDraft>) => {
    setWorks((prev) =>
      prev.map((work) => {
        if (work.id !== workId) {
          return work;
        }

        return { ...work, ...patch };
      })
    );
  };

  const handleAssignmentChange = (
    workId: string,
    assignmentId: string,
    patch: Partial<WorkAssignmentDraft>
  ) => {
    setWorks((prev) => {
      const assignmentLookup = new Map<string, WorkAssignmentDraft>();
      prev.forEach((candidate) => {
        candidate.assignments.forEach((item) => {
          assignmentLookup.set(item.id, item);
        });
      });

      return prev.map((work) => {
        if (work.id !== workId) {
          return work;
        }

        return {
          ...work,
          assignments: work.assignments.map((assignment) => {
            if (assignment.id !== assignmentId) {
              return assignment;
            }

            let nextEffort =
              patch.effortDays !== undefined
                ? Math.max(1, Math.round(patch.effortDays))
                : Math.max(1, Math.round(assignment.effortDays));
            const nextStart =
              patch.startDay !== undefined
                ? Math.max(0, Math.round(patch.startDay))
                : Math.max(0, Math.round(assignment.startDay));
            let nextDuration =
              patch.durationDays !== undefined
                ? Math.max(1, Math.round(patch.durationDays))
                : Math.max(1, Math.round(assignment.durationDays));

            if (patch.effortDays !== undefined && nextDuration < nextEffort) {
              nextDuration = nextEffort;
            }

            if (patch.durationDays !== undefined) {
              const wasDecreased = Math.max(1, Math.round(assignment.durationDays)) > nextDuration;
              if (wasDecreased && nextEffort < nextDuration) {
                nextEffort = nextDuration;
              }
            }

            const nextStartMode: AssignmentStartMode = patch.startMode ?? assignment.startMode ?? 'project-start';
            let nextStartAfterId: string | null =
              patch.startAfterId !== undefined
                ? patch.startAfterId ?? null
                : assignment.startAfterId ?? null;
            let nextStartDate: string | null =
              patch.startDate !== undefined
                ? patch.startDate?.trim() || null
                : assignment.startDate ?? null;
            let computedStart = nextStart;

            if (nextStartMode === 'project-start') {
              nextStartAfterId = null;
              nextStartDate = null;
              computedStart = 0;
            } else if (nextStartMode === 'after-assignment') {
              nextStartDate = null;
              const referenceId = nextStartAfterId && nextStartAfterId !== assignment.id ? nextStartAfterId : null;
              if (referenceId) {
                const reference = assignmentLookup.get(referenceId);
                if (reference) {
                  const referenceStart = Math.max(0, Math.round(reference.startDay));
                  const referenceDuration = Math.max(1, Math.round(reference.durationDays));
                  computedStart = referenceStart + referenceDuration;
                }
              }
            } else if (nextStartMode === 'fixed-date') {
              nextStartAfterId = null;
              if (nextStartDate) {
                const base = initiativeStartDate ? startOfDay(new Date(initiativeStartDate)) : null;
                const target = new Date(nextStartDate);
                if (base && !Number.isNaN(target.getTime())) {
                  computedStart = Math.max(0, differenceInDays(base, target));
                }
              }
            }

            const nextAssignment: WorkAssignmentDraft = {
              ...assignment,
              ...patch,
              effortDays: nextEffort,
              startDay: computedStart,
              durationDays: nextDuration,
              startMode: nextStartMode,
              startAfterId: nextStartAfterId,
              startDate: nextStartDate
            };

            return nextAssignment;
          })
        };
      });
    });
  };

  const handleAssignmentRoleChange = (workId: string, assignmentId: string, role: TeamRole) => {
    handleAssignmentChange(workId, assignmentId, { role, task: '', isCustom: undefined });
  };

  const handleAssignmentTaskChange = (
    workId: string,
    assignmentId: string,
    nextSkill: string,
    isCustom = false
  ) => {
    const normalizedSkill = nextSkill.trim();
    setWorks((prev) =>
      prev.map((work) => {
        if (work.id !== workId) {
          return work;
        }

        return {
          ...work,
          assignments: work.assignments.map((assignment) =>
            assignment.id === assignmentId
              ? {
                  ...assignment,
                  task: normalizedSkill,
                  isCustom: isCustom ? true : undefined
                }
              : assignment
          )
        };
      })
    );
  };

  const handleAssignmentTaskCreate = (
    teamRole: TeamRole,
    workId: string,
    assignmentId: string,
    label: string
  ) => {
    const trimmed = label.trim();
    if (!trimmed) {
      return;
    }

    setRoleSkillOptions((prev) => {
      const next = { ...prev };
      const currentOptions = [...(prev[teamRole] ?? [])];
      const existing = currentOptions.find(
        (option) => option.label.toLowerCase() === trimmed.toLowerCase()
      );

      if (!existing) {
        const option: OptionItem = {
          id: `custom-skill-${createId()}`,
          label: trimmed,
          value: trimmed,
          isCustom: true
        };
        currentOptions.push(option);
        currentOptions.sort((a, b) => a.label.localeCompare(b.label, 'ru'));
      }

      next[teamRole] = currentOptions;
      return next;
    });

    handleAssignmentTaskChange(workId, assignmentId, trimmed, true);
  };

  const toggleWorkCollapse = (workId: string) => {
    setCollapsedWorkIds((prev) =>
      prev.includes(workId) ? prev.filter((id) => id !== workId) : [...prev, workId]
    );
  };

  const handleAddWork = () => {
    setWorks((prev) => {
      setCollapsedWorkIds(prev.map((work) => work.id));
      return [...prev, createWorkDraft(primaryRole, prev.length * 5)];
    });
  };

  const handleApprovalStageChange = (
    stageId: string,
    patch: Partial<ApprovalStageDraft>
  ) => {
    setApprovalStages((prev) =>
      prev.map((stage) => (stage.id === stageId ? { ...stage, ...patch } : stage))
    );
  };

  const handleAddApprovalStage = () => {
    setApprovalStages((prev) => [...prev, createApprovalStageDraft()]);
  };

  const handleRemoveApprovalStage = (stageId: string) => {
    setApprovalStages((prev) =>
      prev.length <= 1 ? prev : prev.filter((stage) => stage.id !== stageId)
    );
  };

  const handleRemoveWork = (workId: string) => {
    setWorks((prev) => (prev.length <= 1 ? prev : prev.filter((work) => work.id !== workId)));
  };

  const handleAddAssignment = (workId: string) => {
    setWorks((prev) =>
      prev.map((work) =>
        work.id === workId
          ? (() => {
              const existing = work.assignments;
              const lastAssignment = existing[existing.length - 1];
              const nextStart = existing.reduce((maxEnd, assignment) => {
                const normalizedStart = Math.max(0, Math.round(assignment.startDay));
                const normalizedDuration = Math.max(1, Math.round(assignment.durationDays));
                return Math.max(maxEnd, normalizedStart + normalizedDuration);
              }, 0);
              const defaultDuration = Math.max(
                1,
                Math.round(lastAssignment?.durationDays ?? 5)
              );
              const nextAssignment = createWorkAssignmentDraft(
                lastAssignment?.role ?? primaryRole,
                nextStart,
                defaultDuration
              );

              return {
                ...work,
                assignments: [...existing, nextAssignment]
              };
            })()
          : work
      )
    );
  };

  const handleRemoveAssignment = (workId: string, assignmentId: string) => {
    setWorks((prev) =>
      prev.map((work) => {
        if (work.id !== workId) {
          return work;
        }

        if (work.assignments.length <= 1) {
          return work;
        }

        return {
          ...work,
          assignments: work.assignments.filter((assignment) => assignment.id !== assignmentId)
        };
      })
    );
  };

  const handleSubmit = () => {
    if (selectedDomains.length === 0) {
      return;
    }
    onSubmit(draftPayload);
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        hasOverlay
        onEsc={onClose}
        className={styles.modal}
        position="top"
      >
        <div className={styles.container}>
          <header className={styles.header}>
            <div className={styles.headerMain}>
              <div className={styles.stepInfo}>
                <Text size="l" weight="bold">
                  {modalTitle}
                </Text>
                <Text size="xs" view="secondary">
                  Шаг {currentStepIndex} из {totalSteps} · {currentStepTitle}
                </Text>
                <Text size="s" view="secondary">
                  {currentStepDescription}
                </Text>
              </div>
              <Select<SelectOption<InitiativeStatus>>
                size="s"
                items={statusOptions}
                value={statusOptions.find((option) => option.value === status) ?? statusOptions[0]}
                getItemLabel={(item) => item.label}
                getItemKey={(item) => item.value}
                onChange={(option) => option && setStatus(option.value)}
              />
            </div>
            <Button
              size="s"
              view="clear"
              iconLeft={IconClose}
              onlyIcon
              label="Закрыть"
              onClick={onClose}
              className={styles.closeButton}
            />
          </header>
          {errorMessage && (
            <Text size="s" view="alert">
              {errorMessage}
            </Text>
          )}
          {activeStep === 'details' && (
            <>
              <section className={styles.section}>
                <Text size="s" weight="semibold">
                  Основная информация
                </Text>
                <div className={styles.gridTwoCols}>
                  <TextField
                    size="s"
                    label="Название инициативы"
                    placeholder="Например, Пилот дистанционного мониторинга"
                    value={name}
                    onChange={(value) => setName(value ?? '')}
                  />
                  <TextField
                    size="s"
                    label="Ответственный"
                    placeholder="ФИО или роль владельца"
                    value={owner}
                    onChange={(value) => setOwner(value ?? '')}
                  />
                </div>
                <TextField
                  size="s"
                  label="Дата старта инициативы"
                  type="date"
                  value={initiativeStartDate}
                  onChange={(value) => setInitiativeStartDate(value ?? '')}
                />
                <TextField
                  size="s"
                  label="Краткое описание"
                  placeholder="Опишите цель инициативы"
                  value={description}
                  onChange={(value) => setDescription(value ?? '')}
                  type="textarea"
                  minRows={3}
                />
                <div className={styles.gridTwoCols}>
                  <TextField
                    size="s"
                    label="Ожидаемый эффект"
                    placeholder="Например, рост точности прогноза на 15%"
                    value={expectedImpact}
                    onChange={(value) => setExpectedImpact(value ?? '')}
                  />
                  <TextField
                    size="s"
                    label="Целевой модуль"
                    placeholder="Укажите рабочее название модуля"
                    value={targetModule}
                    onChange={(value) => setTargetModule(value ?? '')}
                  />
                </div>
                <div className={styles.gridTwoCols}>
                  <Combobox<OptionItem>
                    size="s"
                    label="Домены"
                    placeholder="Выберите домены"
                    items={[...domainItems, DOMAIN_CREATE_OPTION]}
                    value={selectedDomains}
                    multiple
                    getItemLabel={(item) => item.label}
                    getItemKey={(item) => item.id}
                    onChange={handleDomainSelectionChange}
                  />
                  <Combobox<OptionItem>
                    size="s"
                    label="Потенциальные модули"
                    placeholder="Выберите модули"
                    items={[...moduleItems, MODULE_CREATE_OPTION]}
                    value={selectedModules}
                    multiple
                    getItemLabel={(item) => item.label}
                    getItemKey={(item) => item.id}
                    onChange={handleModuleSelectionChange}
                  />
                </div>
                {isCreatingDomain && (
                  <div className={styles.inlineCreateRow}>
                    <TextField
                      size="s"
                      label="Новый домен"
                      placeholder="Введите название домена"
                      value={newDomainLabel}
                      onChange={(value) => setNewDomainLabel(value ?? '')}
                      className={styles.inlineCreateField}
                    />
                    <Button
                      size="s"
                      view="primary"
                      label="Добавить"
                      onClick={handleAddCustomDomain}
                      disabled={!newDomainLabel.trim()}
                    />
                    <Button
                      size="s"
                      view="ghost"
                      label="Отмена"
                      onClick={() => {
                        setIsCreatingDomain(false);
                        setNewDomainLabel('');
                      }}
                    />
                  </div>
                )}
                {isCreatingModule && (
                  <div className={styles.inlineCreateRow}>
                    <TextField
                      size="s"
                      label="Новый модуль"
                      placeholder="Введите название модуля"
                      value={newModuleLabel}
                      onChange={(value) => setNewModuleLabel(value ?? '')}
                      className={styles.inlineCreateField}
                    />
                    <Button
                      size="s"
                      view="primary"
                      label="Добавить"
                      onClick={handleAddCustomModule}
                      disabled={!newModuleLabel.trim()}
                    />
                    <Button
                      size="s"
                      view="ghost"
                      label="Отмена"
                      onClick={() => {
                        setIsCreatingModule(false);
                        setNewModuleLabel('');
                      }}
                    />
                  </div>
                )}
              </section>
              <section className={styles.section}>
                <Text size="s" weight="semibold">
                  Параметры заказчика
                </Text>
                <div className={styles.gridTwoCols}>
                  <Combobox<OptionItem>
                    size="s"
                    label="Компания"
                    placeholder="Выберите компании заказчика"
                    items={[...companyItems, COMPANY_CREATE_OPTION]}
                    value={selectedCompanies}
                    multiple
                    getItemLabel={(item) => item.label}
                    getItemKey={(item) => item.id}
                    onChange={handleCompanySelectionChange}
                  />
                  <Combobox<OptionItem>
                    size="s"
                    label="Подразделения"
                    placeholder="Укажите бизнес-единицы"
                    items={[...unitItems, UNIT_CREATE_OPTION]}
                    value={selectedUnits}
                    multiple
                    getItemLabel={(item) => item.label}
                    getItemKey={(item) => item.id}
                    onChange={handleUnitSelectionChange}
                  />
                </div>
                {isCreatingCompany && (
                  <div className={styles.inlineCreateRow}>
                    <TextField
                      size="s"
                      label="Новая компания"
                      placeholder="Введите название компании"
                      value={newCompanyLabel}
                      onChange={(value) => setNewCompanyLabel(value ?? '')}
                      className={styles.inlineCreateField}
                    />
                    <Button
                      size="s"
                      view="primary"
                      label="Добавить"
                      onClick={handleAddCustomCompany}
                      disabled={!newCompanyLabel.trim()}
                    />
                    <Button
                      size="s"
                      view="ghost"
                      label="Отмена"
                      onClick={() => {
                        setIsCreatingCompany(false);
                        setNewCompanyLabel('');
                      }}
                    />
                  </div>
                )}
                {isCreatingUnit && (
                  <div className={styles.inlineCreateRow}>
                    <TextField
                      size="s"
                      label="Новое подразделение"
                      placeholder="Введите название подразделения"
                      value={newUnitLabel}
                      onChange={(value) => setNewUnitLabel(value ?? '')}
                      className={styles.inlineCreateField}
                    />
                    <Button
                      size="s"
                      view="primary"
                      label="Добавить"
                      onClick={handleAddCustomUnit}
                      disabled={!newUnitLabel.trim()}
                    />
                    <Button
                      size="s"
                      view="ghost"
                      label="Отмена"
                      onClick={() => {
                        setIsCreatingUnit(false);
                        setNewUnitLabel('');
                      }}
                    />
                  </div>
                )}
                <div className={styles.gridTwoCols}>
                  <TextField
                    size="s"
                    label="Контакт заказчика"
                    placeholder="ФИО ответственного"
                    value={customerRepresentative}
                    onChange={(value) => setCustomerRepresentative(value ?? '')}
                  />
                  <TextField
                    size="s"
                    label="Контакты"
                    placeholder="Email или телефон"
                    value={customerContact}
                    onChange={(value) => setCustomerContact(value ?? '')}
                  />
                </div>
                <TextField
                  size="s"
                  label="Комментарий"
                  placeholder="Дополнительная информация"
                  value={customerComment}
                  onChange={(value) => setCustomerComment(value ?? '')}
                  type="textarea"
                  minRows={2}
                />
              </section>
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Text size="s" weight="semibold">
                    Этапы согласования
                  </Text>
                  <Button
                    size="s"
                    view="ghost"
                    label="Добавить этап"
                    onClick={handleAddApprovalStage}
                  />
                </div>
                <div className={styles.workList}>
                  {approvalStages.map((stage) => {
                    const statusOption =
                      approvalStatusOptions.find((option) => option.value === stage.status) ??
                      approvalStatusOptions[0];
                    return (
                      <Card
                        key={stage.id}
                        className={styles.workCard}
                        verticalSpace="l"
                        horizontalSpace="l"
                      >
                        <div className={styles.workHeader}>
                          <TextField
                            size="s"
                            label="Название этапа"
                            placeholder="Например, Архитектурный комитет"
                            value={stage.title}
                            onChange={(value) =>
                              handleApprovalStageChange(stage.id, { title: value ?? '' })
                            }
                          />
                          <Button
                            size="s"
                            view="ghost"
                            label="Удалить"
                            onClick={() => handleRemoveApprovalStage(stage.id)}
                            disabled={approvalStages.length <= 1}
                          />
                        </div>
                        <div className={styles.gridTwoCols}>
                          <TextField
                            size="s"
                            label="Согласующий"
                            placeholder="ФИО или роль"
                            value={stage.approver}
                            onChange={(value) =>
                              handleApprovalStageChange(stage.id, { approver: value ?? '' })
                            }
                          />
                          <Select<SelectOption<InitiativeApprovalStatus>>
                            size="s"
                            label="Статус"
                            items={approvalStatusOptions}
                            value={statusOption}
                            getItemLabel={(item) => item.label}
                            getItemKey={(item) => item.value}
                            onChange={(option) =>
                              option &&
                              handleApprovalStageChange(stage.id, { status: option.value })
                            }
                          />
                        </div>
                        <TextField
                          size="s"
                          label="Комментарий"
                          placeholder="Дополнительные детали или требования"
                          value={stage.comment}
                          onChange={(value) =>
                            handleApprovalStageChange(stage.id, { comment: value ?? '' })
                          }
                          type="textarea"
                          minRows={2}
                        />
                      </Card>
                    );
                  })}
                </div>
              </section>
            </>
          )}
          {activeStep === 'work' && (
            <section className={`${styles.section} ${styles.workPlanningSection}`}>
              <div className={styles.workPlanningGrid}>
                <div className={styles.workColumn}>
                  <div className={styles.sectionHeader}>
                    <Text size="s" weight="semibold">
                      План работ и задачи сотрудников
                    </Text>
                    <Button
                      size="s"
                      view="ghost"
                      label="Добавить работу"
                      onClick={handleAddWork}
                    />
                  </div>
                  <div className={styles.workList}>
                    {works.map((work) => {
                      const scheduleBounds = work.assignments.map((assignment) => {
                        const schedule = assignmentSchedule.get(assignment.id);
                        const normalizedStart = schedule?.startDay ?? Math.max(0, Math.round(assignment.startDay));
                        const normalizedDuration = schedule?.durationDays ?? Math.max(1, Math.round(assignment.durationDays));
                        return {
                          start: normalizedStart,
                          end: normalizedStart + normalizedDuration
                        };
                      });
                      const hasAssignments = scheduleBounds.length > 0;
                      const workStart = hasAssignments
                        ? scheduleBounds.reduce((min, current) => Math.min(min, current.start), Infinity)
                        : 0;
                      const workEnd = hasAssignments
                        ? scheduleBounds.reduce((max, current) => Math.max(max, current.end), 0)
                        : 0;
                      const displayStart = Number.isFinite(workStart) ? workStart : 0;
                      const displayEnd = hasAssignments
                        ? Math.max(displayStart + 1, workEnd)
                        : displayStart + 1;
                      const workDuration = hasAssignments ? Math.max(1, displayEnd - displayStart) : 0;
                      const isCollapsed = collapsedWorkIds.includes(work.id);
                      const workTitle = work.title.trim() || 'Новая работа';
                      const periodLabel = hasAssignments
                        ? `Д${displayStart + 1} – Д${displayEnd} · ${workDuration} дн.`
                        : 'Период не определён';

                      return (
                        <Card
                          key={work.id}
                          className={styles.workCard}
                          verticalSpace="l"
                          horizontalSpace="l"
                        >
                          <div className={styles.workSummary}>
                            <div
                              className={styles.workSummaryInfo}
                              role="button"
                              tabIndex={0}
                              onClick={() => toggleWorkCollapse(work.id)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  toggleWorkCollapse(work.id);
                                }
                              }}
                            >
                              <Text size="s" weight="semibold" className={styles.workSummaryTitle}>
                                {workTitle}
                              </Text>
                              <Text size="xs" view="secondary" className={styles.workSummaryPeriod}>
                                {periodLabel}
                              </Text>
                            </div>
                            <div className={styles.workHeaderActions}>
                              <Button
                                size="s"
                                view="ghost"
                                label={isCollapsed ? 'Развернуть' : 'Свернуть'}
                                onClick={() => toggleWorkCollapse(work.id)}
                              />
                              <Button
                                size="s"
                                view="ghost"
                                label="Удалить"
                                onClick={() => handleRemoveWork(work.id)}
                                disabled={works.length <= 1}
                              />
                            </div>
                          </div>
                          {!isCollapsed && (
                            <>
                              <TextField
                                size="s"
                                label="Название работы"
                                placeholder="Например, Подготовка данных"
                                value={work.title}
                                onChange={(value) => handleWorkChange(work.id, { title: value ?? '' })}
                              />
                              <TextField
                                size="s"
                                label="Описание"
                                value={work.description}
                                onChange={(value) => handleWorkChange(work.id, { description: value ?? '' })}
                                type="textarea"
                                minRows={2}
                              />
                              <TextField
                                size="s"
                                label="Допущения / ограничения"
                                value={work.assumptions}
                                onChange={(value) => handleWorkChange(work.id, { assumptions: value ?? '' })}
                                type="textarea"
                                minRows={2}
                              />
                              <div className={styles.gridTwoCols}>
                                <TextField
                                  size="s"
                                  label="Ответственный за этап"
                                  placeholder="ФИО или роль"
                                  value={work.owner}
                                  onChange={(value) => handleWorkChange(work.id, { owner: value ?? '' })}
                                />
                                <TextField
                                  size="s"
                                  label="Период / таймфрейм"
                                  placeholder="Например, Q1 2025"
                                  value={work.timeframe}
                                  onChange={(value) =>
                                    handleWorkChange(work.id, { timeframe: value ?? '' })
                                  }
                                />
                              </div>
                              <Select<SelectOption<InitiativeWorkItemStatus>>
                                size="s"
                                label="Статус этапа"
                                items={workItemStatusOptions}
                                value={
                                  workItemStatusOptions.find((option) => option.value === work.status) ??
                                  workItemStatusOptions[0]
                                }
                                getItemLabel={(item) => item.label}
                                getItemKey={(item) => item.value}
                                onChange={(option) =>
                                  option && handleWorkChange(work.id, { status: option.value })
                                }
                              />
                              <Text size="xs" view="secondary" className={styles.workTiming}>
                                {hasAssignments
                                  ? `Период: Д${displayStart + 1} – Д${displayEnd} · Длительность: ${workDuration} дн.`
                                  : 'Назначьте сотрудников, чтобы определить период работы.'}
                              </Text>
                              <div className={styles.assignmentList}>
                                <div className={styles.assignmentHeader}>
                                  <Text size="xs" view="secondary">
                                    Назначьте роли и выберите задачи для сотрудников.
                                  </Text>
                                  <Button
                                    size="xs"
                                    view="ghost"
                                    label="Добавить сотрудника"
                                    onClick={() => handleAddAssignment(work.id)}
                                  />
                                </div>
                                <div className={styles.assignmentGrid}>
                                  {work.assignments.map((assignment, index) => {
                                    const roleOption =
                                      roleOptions.find((option) => option.value === assignment.role) ?? {
                                        label: primaryRole,
                                        value: primaryRole
                                      };
                                    const skillOptionsForRole = roleSkillOptions[assignment.role] ?? [];
                                    const selectedTask =
                                      skillOptionsForRole.find((option) => option.value === assignment.task) ?? null;

                                    return (
                                      <div key={assignment.id} className={styles.assignmentCard}>
                                        <div className={styles.assignmentRow}>
                                          <Select<SelectOption<TeamRole>>
                                            size="s"
                                            label={`Роль сотрудника ${index + 1}`}
                                            items={roleOptions}
                                            value={roleOption}
                                            getItemLabel={(item) => item.label}
                                            getItemKey={(item) => item.value}
                                            onChange={(option) =>
                                              option && handleAssignmentRoleChange(work.id, assignment.id, option.value)
                                            }
                                          />
                                          <Button
                                            size="xs"
                                            view="ghost"
                                            label="Удалить"
                                            onClick={() => handleRemoveAssignment(work.id, assignment.id)}
                                            disabled={work.assignments.length <= 1}
                                          />
                                        </div>
                                        <Combobox<OptionItem>
                                          size="s"
                                          items={skillOptionsForRole}
                                          value={selectedTask}
                                          getItemLabel={(item) => item.label}
                                          getItemKey={(item) => item.value}
                                          placeholder="Выберите задачу из списка навыков"
                                          label={`Задача для сотрудника ${index + 1}`}
                                          onChange={(option) =>
                                            handleAssignmentTaskChange(
                                              work.id,
                                              assignment.id,
                                              option?.value ?? ''
                                            )
                                          }
                                          onCreate={(label) =>
                                            handleAssignmentTaskCreate(
                                              assignment.role,
                                              work.id,
                                              assignment.id,
                                              label
                                            )
                                          }
                                          labelForCreate="Добавить новую задачу"
                                        />
                                        <TextField
                                          size="s"
                                          label="Описание задачи"
                                          value={assignment.description}
                                          onChange={(value) =>
                                            handleAssignmentChange(work.id, assignment.id, {
                                              description: value ?? ''
                                            })
                                          }
                                          type="textarea"
                                          minRows={2}
                                        />
                                        {(() => {
                                          const schedule = assignmentSchedule.get(assignment.id);
                                          const computedStart =
                                            schedule?.startDay ?? Math.max(0, Math.round(assignment.startDay));
                                          const computedDuration =
                                            schedule?.durationDays ??
                                            Math.max(1, Math.round(assignment.durationDays));
                                          const computedFinish = computedStart + computedDuration;
                                          const rawStartDate = assignment.startDate
                                            ? new Date(assignment.startDate)
                                            : null;
                                          const startDateDisplay = schedule?.startDate
                                            ? startDateFormatter.format(schedule.startDate)
                                            : rawStartDate && !Number.isNaN(rawStartDate.getTime())
                                              ? startDateFormatter.format(rawStartDate)
                                              : null;
                                          const startModeOption =
                                            startModeOptions.find(
                                              (option) => option.value === assignment.startMode
                                            ) ?? startModeOptions[0];
                                          const referenceItems = assignmentReferenceOptions.filter(
                                            (option) => option.value !== assignment.id
                                          );
                                          const referenceValue =
                                            referenceItems.find(
                                              (option) => option.value === assignment.startAfterId
                                            ) ?? null;
                                          const dateValue = assignment.startDate ?? '';
                                          const finishDate =
                                            schedule?.startDate && computedDuration > 0
                                              ? addDays(schedule.startDate, computedDuration - 1)
                                              : rawStartDate && !Number.isNaN(rawStartDate.getTime()) &&
                                                computedDuration > 0
                                                ? addDays(rawStartDate, computedDuration - 1)
                                                : null;

                                          return (
                                            <>
                                              <div className={styles.assignmentTimingGrid}>
                                                <Select<SelectOption<AssignmentStartMode>>
                                                  size="s"
                                                  label="Начало работы"
                                                  items={startModeOptions}
                                                  value={startModeOption}
                                                  getItemLabel={(item) => item.label}
                                                  getItemKey={(item) => item.value}
                                                  onChange={(option) =>
                                                    option &&
                                                    handleAssignmentStartModeChange(
                                                      work.id,
                                                      assignment.id,
                                                      option.value
                                                    )
                                                  }
                                                />
                                                {assignment.startMode === 'after-assignment' ? (
                                                  <Select<SelectOption<string>>
                                                    size="s"
                                                    label="После задачи"
                                                    items={referenceItems}
                                                    value={referenceValue ?? null}
                                                    getItemLabel={(item) => item.label}
                                                    getItemKey={(item) => item.value}
                                                    disabled={referenceItems.length === 0}
                                                    onChange={(option) =>
                                                      handleAssignmentStartAfterChange(
                                                        work.id,
                                                        assignment.id,
                                                        option?.value ?? null
                                                      )
                                                    }
                                                  />
                                                ) : assignment.startMode === 'fixed-date' ? (
                                                  <TextField
                                                    size="s"
                                                    label="Дата начала"
                                                    type="date"
                                                    value={dateValue}
                                                    onChange={(value) =>
                                                      handleAssignmentStartDateChange(
                                                        work.id,
                                                        assignment.id,
                                                        value ?? null
                                                      )
                                                    }
                                                  />
                                                ) : (
                                                  <div className={styles.assignmentTimingPlaceholder} />
                                                )}
                                                <TextField
                                                  size="s"
                                                  label="Длительность (дней)"
                                                  type="number"
                                                  value={String(assignment.durationDays)}
                                                  onChange={(value) =>
                                                    handleAssignmentChange(work.id, assignment.id, {
                                                      durationDays: Number(value ?? assignment.durationDays) || 1
                                                    })
                                                  }
                                                />
                                                <TextField
                                                  size="s"
                                                  label="Трудозатраты (дней)"
                                                  type="number"
                                                  value={String(assignment.effortDays)}
                                                  onChange={(value) =>
                                                    handleAssignmentChange(work.id, assignment.id, {
                                                      effortDays: Number(value ?? assignment.effortDays) || 1
                                                    })
                                                  }
                                                />
                                              </div>
                                              <Text
                                                size="2xs"
                                                view="secondary"
                                                className={styles.assignmentTimingHint}
                                              >
                                                Старт: Д{computedStart + 1}
                                                {startDateDisplay ? ` · ${startDateDisplay}` : ''}
                                                {` · Завершение: Д${computedFinish}`}
                                                {finishDate ? ` (${startDateFormatter.format(finishDate)})` : ''}
                                              </Text>
                                            </>
                                          );
                                        })()}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </div>
                  <div className={styles.ganttColumn}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <Text size="s" weight="semibold">
                        Диаграмма Ганта
                      </Text>
                      <Text size="xs" view="secondary">
                        Всего {totalEffortDays} человеко-дней по текущему плану.
                      </Text>
                    </div>
                  </div>
                  <div className={styles.ganttPreview}>
                    <InitiativeGanttChart
                      tasks={ganttTasks}
                      startDate={initiativeStartDate?.trim() ? initiativeStartDate : undefined}
                    />
                  </div>
                </div>
              </div>
            </section>
          )}
          {activeStep === 'team' && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <Text size="s" weight="semibold">
                    Рекомендованные эксперты
                  </Text>
                  <Text size="xs" view="secondary">
                    Система сравнила навыки роли и доступность специалистов.
                  </Text>
                </div>
              </div>
              <div className={styles.recommendationList}>
                {planningRoles.length === 0 ? (
                  <Text size="s" view="secondary">
                    Добавьте роли и работы, чтобы увидеть подходящих экспертов.
                  </Text>
                ) : (
                  planningRoles.map((role) => {
                    const candidates = candidatePreviewMap.get(role.id) ?? [];
                    const topCandidates = candidates.slice(0, 3);
                    const bestScore = topCandidates[0]?.score;
                    return (
                      <Card
                        key={role.id}
                        className={styles.recommendationCard}
                        verticalSpace="l"
                        horizontalSpace="l"
                      >
                        <div className={styles.recommendationHeader}>
                          <div className={styles.recommendationHeaderInfo}>
                            <Text className={styles.recommendationRoleTitle} size="s" weight="semibold">
                              {role.role}
                            </Text>
                            <Text size="xs" view="secondary">
                              Требуется: {role.required} · Работ: {role.workItems.length}
                            </Text>
                          </div>
                          {bestScore !== undefined && (
                            <Badge
                              size="s"
                              view="filled"
                              status="system"
                              label={`${bestScore} баллов`}
                              className={styles.recommendationScoreBadge}
                            />
                          )}
                        </div>
                        {topCandidates.length === 0 ? (
                          <Text size="xs" view="secondary">
                            Уточните навыки роли, чтобы получить рекомендации.
                          </Text>
                        ) : (
                          <div className={styles.recommendationCandidates}>
                            {topCandidates.map((candidate) => {
                              const expert = expertLookup.get(candidate.expertId);
                              return (
                                <div
                                  key={`${role.id}-${candidate.expertId}`}
                                  className={styles.recommendationCandidate}
                                >
                                  <div className={styles.recommendationCandidateHeader}>
                                    <div className={styles.recommendationCandidateInfo}>
                                      <Text
                                        size="s"
                                        weight="semibold"
                                        className={styles.recommendationCandidateName}
                                      >
                                        {expert?.name ?? candidate.expertId}
                                      </Text>
                                      <Text size="xs" view="secondary">
                                        {expert?.title ?? 'Эксперт каталога'}
                                      </Text>
                                    </div>
                                    <Badge
                                      size="s"
                                      view="stroked"
                                      status="system"
                                      label={`${candidate.score} баллов`}
                                    />
                                  </div>
                                  <Text
                                    size="xs"
                                    className={styles.recommendationCandidateComment}
                                  >
                                    {candidate.fitComment}
                                  </Text>
                                  {candidate.riskTags.length > 0 && (
                                    <div className={styles.recommendationRisks}>
                                      {candidate.riskTags.slice(0, 3).map((risk) => (
                                        <Badge
                                          key={`${candidate.expertId}-${risk}`}
                                          size="2xs"
                                          view="ghost"
                                          className={styles.recommendationRiskTag}
                                          label={risk}
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </Card>
                    );
                  })
                )}
              </div>
            </section>
          )}
          <footer className={styles.footer}>
            <Button size="s" view="ghost" label="Отмена" onClick={onClose} disabled={isSubmitting} />
            {activeStep === 'details' && (
              <Button
                size="s"
                view="primary"
                label="Оценка работ"
                onClick={() => setActiveStep('work')}
                disabled={isSubmitting || selectedDomains.length === 0}
              />
            )}
            {activeStep === 'work' && (
              <>
                <Button
                  size="s"
                  view="ghost"
                  label="Назад"
                  onClick={() => setActiveStep('details')}
                  disabled={isSubmitting}
                />
                <Button
                  size="s"
                  view="primary"
                  label={teamStepForwardLabel}
                  onClick={() => setActiveStep('team')}
                  disabled={!isWorkPlanningReady || isSubmitting || selectedDomains.length === 0}
                />
              </>
            )}
            {activeStep === 'team' && (
              <>
                <Button
                  size="s"
                  view="ghost"
                  label="Назад"
                  onClick={() => setActiveStep('work')}
                  disabled={isSubmitting}
                />
                <Button
                  size="s"
                  view="primary"
                  label={submitButtonLabel}
                  onClick={handleSubmit}
                  disabled={isSubmitDisabled || isSubmitting}
                />
              </>
            )}
          </footer>
        </div>
      </Modal>
    </>
  );
};

export default InitiativeCreationModal;
