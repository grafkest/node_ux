/* eslint-disable react/prop-types */
import { Badge } from '@consta/uikit/Badge';
import { Button } from '@consta/uikit/Button';
import { Card } from '@consta/uikit/Card';
import { Modal } from '@consta/uikit/Modal';
import { Select } from '@consta/uikit/Select';
import type { SelectProps } from '@consta/uikit/Select';
import { Tabs } from '@consta/uikit/Tabs';
import { Text } from '@consta/uikit/Text';
import { TextField } from '@consta/uikit/TextField';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ExpertProfile, Initiative } from '../data';
import {
  type TaskDraft,
  type TaskListItem,
  type TaskPriority,
  type TaskRelation,
  type TaskRelationType,
  type TaskScheduleType,
  type TaskStatus
} from '../types/tasks';
import {
  addDays,
  formatIsoDate,
  parseDateValue,
  resolveTaskScheduleWindow,
  startOfDay,
  type TaskScheduleWindow
} from '../utils/employeeTasks';
import GanttTimeline, {
  type GanttTimelineTask,
  type GanttTimelineTaskKind,
  timelineScaleTabs,
  type TimelineScaleTab
} from './GanttTimeline';
import styles from './EmployeeWorkloadTrack.module.css';

type WorkloadKind = GanttTimelineTaskKind;

type WorkloadTask = {
  id: string;
  name: string;
  start: string;
  end: string;
  initiativeId?: string;
  kind: WorkloadKind;
  badge: string;
  description?: string;
};

const workloadBadgeStatuses: Record<WorkloadKind, 'system' | 'warning' | 'success'> = {
  project: 'system',
  'out-of-project': 'warning',
  training: 'success'
};

type EmployeeWorkload = {
  id: string;
  fullName: string;
  position: string;
  rank: number;
  workload: number;
  availability: string;
  focus: string;
  tasks: WorkloadTask[];
};

type SelectOption<Value extends string> = {
  label: string;
  value: Value;
};


const priorityOptions: SelectOption<TaskPriority>[] = [
  { label: 'Низкий', value: 'low' },
  { label: 'Средний', value: 'medium' },
  { label: 'Высокий', value: 'high' }
];

const statusOptions: SelectOption<TaskStatus>[] = [
  { label: 'Новая', value: 'new' },
  { label: 'В работе', value: 'in-progress' },
  { label: 'На паузе', value: 'paused' },
  { label: 'Отклонено', value: 'rejected' },
  { label: 'Выполнено', value: 'completed' }
];

const statusBadges: Record<TaskStatus, { label: string; badgeStatus: 'normal' | 'system' | 'success' | 'warning' | 'alert' | 'error' }> = {
  'new': { label: 'Новая', badgeStatus: 'system' },
  'in-progress': { label: 'В работе', badgeStatus: 'warning' },
  'paused': { label: 'На паузе', badgeStatus: 'alert' },
  'rejected': { label: 'Отклонено', badgeStatus: 'error' },
  'completed': { label: 'Выполнено', badgeStatus: 'success' }
};

const priorityBadges: Record<TaskPriority, { label: string; badgeStatus: 'normal' | 'system' | 'success' | 'warning' | 'alert' | 'error' }> = {
  'low': { label: 'Низкий', badgeStatus: 'normal' },
  'medium': { label: 'Средний', badgeStatus: 'warning' },
  'high': { label: 'Высокий', badgeStatus: 'alert' }
};

const scheduleTypeOptions: SelectOption<TaskScheduleType>[] = [
  { label: 'Сделать до даты', value: 'due-date' },
  { label: 'Дата начала + срок', value: 'start-duration' },
  { label: 'Период выполнения', value: 'date-range' },
  { label: 'После другой задачи', value: 'after-task' }
];

const systemOptions: SelectOption<string>[] = [
  { label: 'Платформа мониторинга промыслов', value: 'system-monitoring' },
  { label: 'Цифровой двойник месторождения', value: 'system-digital-twin' },
  { label: 'Система управления добычей', value: 'system-production-control' },
  { label: 'Лаборатория продвинутой аналитики', value: 'system-analytics-lab' }
];

const defaultInitiativeOptions: SelectOption<string>[] = [
  { label: 'Цифровая кустовая площадка', value: 'initiative-digital-pad' },
  { label: 'Единый контур дистанционного управления', value: 'initiative-remote-operations' },
  { label: 'Цифровой двойник удалённого промысла', value: 'initiative-dtwin-remote' },
  { label: 'INFRAPLAN Economics M&A', value: 'initiative-infraplan-economics' }
];

const relationTypeOptions: SelectOption<TaskRelationType>[] = [
  { label: 'К системе', value: 'system' },
  { label: 'К инициативе', value: 'initiative' },
  { label: 'Внешний запрос', value: 'external' },
  { label: 'Методологическая активность', value: 'methodology' }
];

const relationLabels: Record<TaskRelationType, string> = {
  system: 'К системе',
  initiative: 'К инициативе',
  external: 'Внешний запрос',
  methodology: 'Методологическая активность'
};

const mapRelationToKind = (relation: TaskRelation): WorkloadKind => {
  switch (relation.type) {
    case 'external':
      return 'out-of-project';
    case 'methodology':
      return 'training';
    default:
      return 'project';
  }
};

const defaultTaskDraft: TaskDraft = {
  name: '',
  priority: 'medium',
  status: 'new',
  assigneeId: null,
  description: '',
  scheduleType: 'due-date',
  dueDate: '',
  startDate: '',
  endDate: '',
  durationDays: '',
  predecessorId: null,
  relationType: 'system',
  relatedSystemId: systemOptions[0]?.value ?? null,
  relatedInitiativeId: defaultInitiativeOptions[0]?.value ?? null
};

const addMonths = (date: Date, months: number): Date => {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months, 1);
  result.setHours(0, 0, 0, 0);
  return result;
};

const addYears = (date: Date, years: number): Date => {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years, 0, 1);
  result.setHours(0, 0, 0, 0);
  return result;
};

const startOfWeek = (date: Date): Date => {
  const result = startOfDay(date);
  const day = result.getDay();
  const diff = (day + 6) % 7;
  result.setDate(result.getDate() - diff);
  return result;
};

const startOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1);

const startOfYear = (date: Date): Date => new Date(date.getFullYear(), 0, 1);

const TIMELINE_PERIOD_START = startOfDay(new Date(2025, 9, 1));

const detailDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'long',
  year: 'numeric'
});

const formatTimelineTaskPeriod = (start: string, end: string): string => {
  const startDate = parseDateValue(start);
  const endDate = parseDateValue(end);
  if (!startDate || !endDate) {
    return 'Период не задан';
  }
  if (startDate.getTime() === endDate.getTime()) {
    return detailDateFormatter.format(startDate);
  }
  return `${detailDateFormatter.format(startDate)} — ${detailDateFormatter.format(endDate)}`;
};

const toDate = (value: Date | string): Date => {
  if (value instanceof Date) {
    return value;
  }
  return new Date(value);
};

const capitalize = (value: string): string => {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const weekFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short'
});

const monthLabelFormatter = new Intl.DateTimeFormat('ru-RU', {
  month: 'long',
  year: 'numeric'
});

const yearLabelFormatter = new Intl.DateTimeFormat('ru-RU', {
  year: 'numeric'
});

const formatWeekLabel = (start: Date, endInclusive: Date): string => {
  const startLabel = capitalize(weekFormatter.format(start));
  const endLabel = capitalize(weekFormatter.format(endInclusive));
  const startYear = start.getFullYear();
  const endYear = endInclusive.getFullYear();
  const yearLabel = startYear === endYear ? `${startYear}` : `${startYear}/${endYear}`;

  if (startLabel === endLabel) {
    return `${startLabel} (${yearLabel})`;
  }
  return `${startLabel} – ${endLabel} (${yearLabel})`;
};

type PeriodOption = {
  label: string;
  value: string;
  start: Date;
  end: Date;
};

const buildWeekOptions = (baseStart: Date, minDate: Date, maxDate: Date): PeriodOption[] => {
  const startBoundary = minDate < TIMELINE_PERIOD_START ? TIMELINE_PERIOD_START : minDate;
  const earliestCandidate = startOfWeek(addDays(startBoundary, -7));
  const earliest = earliestCandidate < TIMELINE_PERIOD_START ? TIMELINE_PERIOD_START : earliestCandidate;
  const latest = startOfWeek(addDays(maxDate, 7));
  const options: PeriodOption[] = [];
  let cursor = earliest;
  let guard = 0;
  while (cursor <= latest && guard < 104) {
    const start = cursor;
    const end = addDays(start, 7);
    options.push({
      label: formatWeekLabel(start, addDays(end, -1)),
      value: start.toISOString(),
      start,
      end
    });
    cursor = addDays(cursor, 7);
    guard += 1;
  }
  if (options.length === 0) {
    const start = startOfWeek(baseStart);
    const end = addDays(start, 7);
    options.push({
      label: formatWeekLabel(start, addDays(end, -1)),
      value: start.toISOString(),
      start,
      end
    });
  }
  return options;
};

const buildMonthOptions = (baseStart: Date, minDate: Date, maxDate: Date): PeriodOption[] => {
  const startBoundary = minDate < TIMELINE_PERIOD_START ? TIMELINE_PERIOD_START : minDate;
  const earliestCandidate = startOfMonth(addMonths(startBoundary, -1));
  const earliest = earliestCandidate < TIMELINE_PERIOD_START
    ? startOfMonth(TIMELINE_PERIOD_START)
    : earliestCandidate;
  const latest = startOfMonth(addMonths(maxDate, 1));
  const options: PeriodOption[] = [];
  let cursor = earliest;
  let guard = 0;
  while (cursor <= latest && guard < 48) {
    const start = cursor;
    const end = addMonths(start, 1);
    options.push({
      label: capitalize(monthLabelFormatter.format(start)),
      value: start.toISOString(),
      start,
      end
    });
    cursor = addMonths(cursor, 1);
    guard += 1;
  }
  if (options.length === 0) {
    const start = startOfMonth(baseStart);
    const end = addMonths(start, 1);
    options.push({
      label: capitalize(monthLabelFormatter.format(start)),
      value: start.toISOString(),
      start,
      end
    });
  }
  return options;
};

const buildYearOptions = (baseStart: Date, minDate: Date, maxDate: Date): PeriodOption[] => {
  const startBoundary = minDate < TIMELINE_PERIOD_START ? TIMELINE_PERIOD_START : minDate;
  const earliestCandidate = startOfYear(addYears(startBoundary, -1));
  const earliest = earliestCandidate < TIMELINE_PERIOD_START ? startOfYear(TIMELINE_PERIOD_START) : earliestCandidate;
  const latest = startOfYear(addYears(maxDate, 1));
  const options: PeriodOption[] = [];
  let cursor = earliest;
  let guard = 0;
  while (cursor <= latest && guard < 12) {
    const start = cursor;
    const end = addYears(start, 1);
    options.push({
      label: yearLabelFormatter.format(start),
      value: start.toISOString(),
      start,
      end
    });
    cursor = addYears(cursor, 1);
    guard += 1;
  }
  if (options.length === 0) {
    const start = startOfYear(baseStart);
    const end = addYears(start, 1);
    options.push({
      label: yearLabelFormatter.format(start),
      value: start.toISOString(),
      start,
      end
    });
  }
  return options;
};

const findPeriodContainingDate = (options: PeriodOption[], target: Date): PeriodOption | null => {
  return options.find((option) => target >= option.start && target < option.end) ?? null;
};

const getScheduleDueDate = (schedule: TaskSchedule): Date | null => {
  switch (schedule.type) {
    case 'due-date':
      return parseDateValue(schedule.dueDate);
    case 'start-duration': {
      const start = parseDateValue(schedule.startDate);
      if (!start) {
        return null;
      }
      return addDays(start, schedule.durationDays);
    }
    case 'date-range':
      return parseDateValue(schedule.endDate);
    case 'after-task':
      return null;
    default:
      return null;
  }
};

const formatDateDisplay = (value: string): string => {
  const date = parseDateValue(value);
  if (!date) {
    return 'Не указана';
  }
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
};

const formatScheduleSummary = (
  task: TaskListItem,
  taskNameLookup: Map<string, string>
): string => {
  const { schedule } = task;
  switch (schedule.type) {
    case 'due-date':
      return `До ${formatDateDisplay(schedule.dueDate)}`;
    case 'start-duration':
      return `${formatDateDisplay(schedule.startDate)} · ${schedule.durationDays} дн.`;
    case 'date-range':
      return `${formatDateDisplay(schedule.startDate)} — ${formatDateDisplay(schedule.endDate)}`;
    case 'after-task': {
      const predecessorName = taskNameLookup.get(schedule.predecessorId) ?? 'другой задачи';
      return `После «${predecessorName}» · ${schedule.durationDays} дн.`;
    }
    default:
      return 'План не задан';
  }
};

const formatScheduleDetails = (
  task: TaskListItem,
  taskNameLookup: Map<string, string>
): string => {
  const { schedule } = task;
  switch (schedule.type) {
    case 'due-date':
      return `Выполнить до ${formatDateDisplay(schedule.dueDate)}`;
    case 'start-duration':
      return `Старт ${formatDateDisplay(schedule.startDate)}, длительность ${schedule.durationDays} дн.`;
    case 'date-range':
      return `Выполняется с ${formatDateDisplay(schedule.startDate)} по ${formatDateDisplay(schedule.endDate)}`;
    case 'after-task': {
      const predecessorName = taskNameLookup.get(schedule.predecessorId) ?? 'связанной задачи';
      return `После завершения «${predecessorName}», длительность ${schedule.durationDays} дн.`;
    }
    default:
      return 'Планирование не задано';
  }
};

const getRelationSummary = (
  relation: TaskRelation,
  maps: { systems: Record<string, string>; initiatives: Record<string, string> }
): string => {
  switch (relation.type) {
    case 'system':
      return relation.targetId
        ? `${relationLabels.system}: ${maps.systems[relation.targetId] ?? 'Не выбрана'}`
        : `${relationLabels.system}: Не выбрана`;
    case 'initiative':
      return relation.targetId
        ? `${relationLabels.initiative}: ${maps.initiatives[relation.targetId] ?? 'Не выбрана'}`
        : `${relationLabels.initiative}: Не выбрана`;
    case 'external':
      return relationLabels.external;
    case 'methodology':
      return relationLabels.methodology;
    default:
      return 'Контекст не задан';
  }
};

const parsePositiveInt = (value: string): number | null => {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const buildScheduleFromDraft = (draft: TaskDraft): TaskSchedule | null => {
  switch (draft.scheduleType) {
    case 'due-date':
      return draft.dueDate ? { type: 'due-date', dueDate: draft.dueDate } : null;
    case 'start-duration': {
      const duration = parsePositiveInt(draft.durationDays);
      if (!draft.startDate || duration === null) {
        return null;
      }
      return { type: 'start-duration', startDate: draft.startDate, durationDays: duration };
    }
    case 'date-range': {
      if (!draft.startDate || !draft.endDate) {
        return null;
      }
      const startDateValue = parseDateValue(draft.startDate);
      const endDateValue = parseDateValue(draft.endDate);
      if (!startDateValue || !endDateValue) {
        return null;
      }
      if (endDateValue.getTime() < startDateValue.getTime()) {
        return null;
      }
      return { type: 'date-range', startDate: draft.startDate, endDate: draft.endDate };
    }
    case 'after-task': {
      const duration = parsePositiveInt(draft.durationDays);
      if (!draft.predecessorId || duration === null) {
        return null;
      }
      return { type: 'after-task', predecessorId: draft.predecessorId, durationDays: duration };
    }
    default:
      return null;
  }
};

const buildRelationFromDraft = (draft: TaskDraft): TaskRelation => {
  switch (draft.relationType) {
    case 'system':
      return { type: 'system', targetId: draft.relatedSystemId ?? null };
    case 'initiative':
      return { type: 'initiative', targetId: draft.relatedInitiativeId ?? null };
    case 'external':
      return { type: 'external' };
    case 'methodology':
      return { type: 'methodology' };
    default:
      return { type: 'external' };
  }
};

const createPreviewTaskFromDraft = (draft: TaskDraft, id = 'draft'): TaskListItem | null => {
  const schedule = buildScheduleFromDraft(draft);
  if (!schedule) {
    return null;
  }
  return {
    id,
    name: draft.name || 'Новая задача',
    priority: draft.priority,
    status: draft.status,
    assigneeId: draft.assigneeId,
    description: draft.description,
    schedule,
    relation: buildRelationFromDraft(draft)
  };
};

const mapTaskToDraft = (
  task: TaskListItem,
  initiativeOptions: SelectOption<string>[]
): TaskDraft => {
  const draft: TaskDraft = {
    name: task.name,
    priority: task.priority,
    status: task.status,
    assigneeId: task.assigneeId,
    description: task.description,
    scheduleType: task.schedule.type,
    dueDate: '',
    startDate: '',
    endDate: '',
    durationDays: '',
    predecessorId: null,
    relationType: task.relation.type,
    relatedSystemId:
      task.relation.type === 'system'
        ? task.relation.targetId ?? systemOptions[0]?.value ?? null
        : systemOptions[0]?.value ?? null,
    relatedInitiativeId:
      task.relation.type === 'initiative'
        ? task.relation.targetId ?? initiativeOptions[0]?.value ?? null
        : initiativeOptions[0]?.value ?? null
  };

  switch (task.schedule.type) {
    case 'due-date':
      draft.dueDate = task.schedule.dueDate;
      break;
    case 'start-duration':
      draft.startDate = task.schedule.startDate;
      draft.durationDays = String(task.schedule.durationDays);
      break;
    case 'date-range':
      draft.startDate = task.schedule.startDate;
      draft.endDate = task.schedule.endDate;
      break;
    case 'after-task':
      draft.predecessorId = task.schedule.predecessorId;
      draft.durationDays = String(task.schedule.durationDays);
      break;
    default:
      break;
  }

  return draft;
};

const viewTabs = [
  { label: 'Дорожка загрузки', value: 'timeline' },
  { label: 'Постановка задач', value: 'planner' }
] as const;

type ViewTab = (typeof viewTabs)[number];

type TimelineScale = TimelineScaleTab['value'];

const timelineModeTabs = [
  { label: 'Задачи сотрудников', value: 'tasks' },
  { label: 'Инициативы', value: 'initiatives' }
] as const;

type TimelineMode = (typeof timelineModeTabs)[number];

type EmployeeWorkloadTrackProps = {
  experts: ExpertProfile[];
  initiatives: Initiative[];
  tasks: TaskListItem[];
  onTasksChange: (tasks: TaskListItem[]) => void;
};

const EmployeeWorkloadTrack: React.FC<EmployeeWorkloadTrackProps> = ({
  experts,
  initiatives,
  tasks,
  onTasksChange
}) => {
  const initiativeOptions = useMemo<SelectOption<string>[]>(() => {
    const base = initiatives.map<SelectOption<string>>((initiative) => ({
      label: initiative.name,
      value: initiative.id
    }));
    if (base.length > 0) {
      return base;
    }
    return defaultInitiativeOptions;
  }, [initiatives]);

  const dynamicEmployees = useMemo<EmployeeWorkload[]>(() => {
    const toWorkloadValue = (availability: ExpertProfile['availability']): number => {
      switch (availability) {
        case 'busy':
          return 0.95;
        case 'partial':
          return 0.65;
        default:
          return 0.35;
      }
    };

    return experts.map<EmployeeWorkload>((expert, index) => ({
      id: expert.id,
      fullName: expert.fullName,
      position: expert.title,
      rank: index + 1,
      workload: toWorkloadValue(expert.availability),
      availability: expert.availabilityComment || 'Доступен под запрос',
      focus: expert.focusAreas[0] ?? expert.summary ?? 'Задачи уточняются',
      tasks: []
    }));
  }, [experts]);

  const employees = useMemo(() => {
    return dynamicEmployees;
  }, [dynamicEmployees]);
  const [scale, setScale] = useState<TimelineScaleTab>(timelineScaleTabs[1]);
  const [timelineMode, setTimelineMode] = useState<TimelineMode>(timelineModeTabs[0]);
  const applyTasksChange = useCallback(
    (updater: TaskListItem[] | ((prev: TaskListItem[]) => TaskListItem[])) => {
      const next = typeof updater === 'function' ? updater(tasks) : updater;
      onTasksChange(next);
    },
    [onTasksChange, tasks]
  );

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(tasks[0]?.id ?? null);
  const [activeView, setActiveView] = useState<ViewTab>(viewTabs[0]);
  const [taskDraft, setTaskDraft] = useState<TaskDraft>((): TaskDraft => ({
    ...defaultTaskDraft,
    relatedInitiativeId: initiativeOptions[0]?.value ?? null
  }));
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<TaskListItem | null>(null);

  const resetTaskDraft = useCallback(() => {
    setTaskDraft(() => ({
      ...defaultTaskDraft,
      relatedInitiativeId: initiativeOptions[0]?.value ?? null
    }));
    setEditingTaskId(null);
    setFormError(null);
  }, [initiativeOptions]);

  useEffect(() => {
    applyTasksChange((prev) => {
      const availableEmployeeIds = new Set(employees.map((employee) => employee.id));
      let changed = false;

      const normalized = prev.map((task) => {
        if (task.assigneeId && !availableEmployeeIds.has(task.assigneeId)) {
          changed = true;
          return { ...task, assigneeId: null };
        }
        return task;
      });

      return changed ? normalized : prev;
    });
  }, [applyTasksChange, employees]);

  const taskMap = useMemo(() => {
    const map = new Map<string, TaskListItem>();
    tasks.forEach((task) => {
      map.set(task.id, task);
    });
    return map;
  }, [tasks]);

  const teamTaskWindows = useMemo(() => {
    const windows = new Map<string, TaskScheduleWindow>();
    tasks.forEach((task) => {
      const window = resolveTaskScheduleWindow(task, taskMap);
      if (window) {
        windows.set(task.id, window);
      }
    });
    return windows;
  }, [taskMap, tasks]);

  useEffect(() => {
    if (tasks.length === 0) {
      if (selectedTaskId !== null) {
        setSelectedTaskId(null);
      }
      return;
    }

    if (!tasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(tasks[0]?.id ?? null);
    }
  }, [selectedTaskId, tasks]);

  const teamTimelineTasksByEmployee = useMemo(() => {
    const map = new Map<string, WorkloadTask[]>();
    tasks.forEach((task) => {
      if (!task.assigneeId) {
        return;
      }
      const window = teamTaskWindows.get(task.id);
      if (!window) {
        return;
      }
      const relationInitiativeId =
        task.relation.type === 'initiative' ? task.relation.targetId ?? undefined : undefined;
      const kind = mapRelationToKind(task.relation);
      const entry = map.get(task.assigneeId) ?? [];
      entry.push({
        id: task.id,
        name: task.name,
        start: formatIsoDate(window.start),
        end: formatIsoDate(window.end),
        initiativeId: relationInitiativeId,
        kind,
        badge: 'Команда',
        description: task.description
      });
      map.set(task.assigneeId, entry);
    });

    map.forEach((list) => {
      list.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    });

    return map;
  }, [tasks, teamTaskWindows]);

  const initiativeTimelineTasksByEmployee = useMemo(() => {
    const map = new Map<string, WorkloadTask[]>();

    initiatives.forEach((initiative) => {
      const baseStart = initiative.startDate ? startOfDay(new Date(initiative.startDate)) : TIMELINE_PERIOD_START;
      initiative.roles.forEach((role) => {
        (role.workItems ?? []).forEach((item) => {
          if (!item.assignedExpertId) {
            return;
          }
          const startDate = addDays(baseStart, item.startDay);
          const endDate = addDays(startDate, Math.max(item.durationDays - 1, 0));
          const entry = map.get(item.assignedExpertId) ?? [];
          entry.push({
            id: `${initiative.id}-${item.id}`,
            name: item.title,
            start: formatIsoDate(startDate),
            end: formatIsoDate(endDate),
            initiativeId: initiative.id,
            kind: 'project',
            badge: initiative.name,
            description: item.description
          });
          map.set(item.assignedExpertId, entry);
        });
      });
    });

    map.forEach((list) => {
      list.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    });

    return map;
  }, [initiatives]);

  const baseStart = TIMELINE_PERIOD_START;

  const timelineDateTasks = useMemo(() => {
    const projectTasks = employees.flatMap((employee) =>
      employee.tasks.map((task) => ({
        start: startOfDay(toDate(task.start)),
        end: startOfDay(toDate(task.end))
      }))
    );

    const teamTasks = Array.from(teamTaskWindows.values()).map((window) => ({
      start: startOfDay(window.start),
      end: startOfDay(window.end)
    }));

    return [...projectTasks, ...teamTasks];
  }, [employees, teamTaskWindows]);

  const minTaskStart = useMemo(() => {
    if (timelineDateTasks.length === 0) {
      return baseStart;
    }
    const minDate = timelineDateTasks.reduce(
      (min, task) => (task.start < min ? task.start : min),
      timelineDateTasks[0].start
    );
    return minDate < TIMELINE_PERIOD_START ? TIMELINE_PERIOD_START : minDate;
  }, [baseStart, timelineDateTasks]);

  const maxTaskEnd = useMemo(() => {
    const now = startOfDay(new Date());
    if (timelineDateTasks.length === 0) {
      return now > baseStart ? now : baseStart;
    }
    const maxDate = timelineDateTasks.reduce(
      (max, task) => (task.end > max ? task.end : max),
      timelineDateTasks[0].end
    );
    const clampedMax = maxDate < TIMELINE_PERIOD_START ? TIMELINE_PERIOD_START : maxDate;
    if (clampedMax < now) {
      return now;
    }
    return clampedMax;
  }, [baseStart, timelineDateTasks]);

  const periodOptions = useMemo(
    () => ({
      week: buildWeekOptions(baseStart, minTaskStart, maxTaskEnd),
      month: buildMonthOptions(baseStart, minTaskStart, maxTaskEnd),
      year: buildYearOptions(baseStart, minTaskStart, maxTaskEnd)
    }),
    [baseStart, maxTaskEnd, minTaskStart]
  );

  const [selectedPeriods, setSelectedPeriods] = useState<Record<TimelineScale, string | null>>(() => {
    const now = new Date();
    return {
      week: findPeriodContainingDate(periodOptions.week, now)?.value ?? periodOptions.week[0]?.value ?? null,
      month:
        findPeriodContainingDate(periodOptions.month, now)?.value ?? periodOptions.month[0]?.value ?? null,
      year: findPeriodContainingDate(periodOptions.year, now)?.value ?? periodOptions.year[0]?.value ?? null
    };
  });
  const [activeTimelineTaskId, setActiveTimelineTaskId] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    setSelectedPeriods((prev) => ({
      week:
        prev.week && periodOptions.week.some((option) => option.value === prev.week)
          ? prev.week
          : findPeriodContainingDate(periodOptions.week, now)?.value ?? periodOptions.week[0]?.value ?? null,
      month:
        prev.month && periodOptions.month.some((option) => option.value === prev.month)
          ? prev.month
          : findPeriodContainingDate(periodOptions.month, now)?.value ?? periodOptions.month[0]?.value ?? null,
      year:
        prev.year && periodOptions.year.some((option) => option.value === prev.year)
          ? prev.year
          : findPeriodContainingDate(periodOptions.year, now)?.value ?? periodOptions.year[0]?.value ?? null
    }));
  }, [periodOptions]);

  useEffect(() => {
    setTaskDraft((prev) => {
      const nextInitiativeId = prev.relatedInitiativeId && initiativeOptions.some((option) => option.value === prev.relatedInitiativeId)
        ? prev.relatedInitiativeId
        : initiativeOptions[0]?.value ?? null;

      if (nextInitiativeId === prev.relatedInitiativeId) {
        return prev;
      }

      return { ...prev, relatedInitiativeId: nextInitiativeId };
    });
  }, [initiativeOptions]);

  const currentPeriodOptions = periodOptions[scale.value];
  const selectedPeriodValue = selectedPeriods[scale.value];
  const activePeriod = currentPeriodOptions.find((option) => option.value === selectedPeriodValue) ?? null;
  const displayedPeriod = activePeriod ?? currentPeriodOptions[0] ?? null;
  const resolvedViewRange = displayedPeriod
    ? { start: displayedPeriod.start, end: displayedPeriod.end }
    : undefined;

  const assigneeOptions = useMemo<SelectOption<string>[]>(() => {
    return employees.map((employee) => ({
      label: employee.fullName,
      value: employee.id
    }));
  }, [employees]);

  const employeeNameMap = useMemo<Record<string, string>>(() => {
    return employees.reduce<Record<string, string>>((acc, employee) => {
      acc[employee.id] = employee.fullName;
      return acc;
    }, {});
  }, [employees]);

  const systemNameMap = useMemo<Record<string, string>>(() => {
    return systemOptions.reduce<Record<string, string>>((acc, option) => {
      acc[option.value] = option.label;
      return acc;
    }, {});
  }, []);

  const initiativeNameMap = useMemo<Record<string, string>>(() => {
    return initiativeOptions.reduce<Record<string, string>>((acc, option) => {
      acc[option.value] = option.label;
      return acc;
    }, {});
  }, [initiativeOptions]);

  const mergeInitiativeTasks = useCallback(
    (tasks: WorkloadTask[]): WorkloadTask[] => {
      const tasksWithInitiative = tasks.filter((task) => task.initiativeId);
      const tasksWithoutInitiative = tasks.filter((task) => !task.initiativeId);
      const groupedTasks = new Map<string, WorkloadTask[]>();

      tasksWithInitiative.forEach((task) => {
        const list = groupedTasks.get(task.initiativeId ?? '') ?? [];
        list.push(task);
        groupedTasks.set(task.initiativeId ?? '', list);
      });

      const mergedSegments: WorkloadTask[] = [];

      groupedTasks.forEach((list, initiativeId) => {
        const sorted = list
          .slice()
          .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
        let currentStart = startOfDay(toDate(sorted[0].start));
        let currentEnd = startOfDay(toDate(sorted[0].end));
        let segmentIndex = 0;
        let segmentNames = [sorted[0].name];

        const pushSegment = () => {
          const initiativeLabel = initiativeNameMap[initiativeId] ?? 'Инициатива';
          mergedSegments.push({
            id: `${initiativeId}-segment-${segmentIndex}`,
            name: initiativeLabel,
            start: formatIsoDate(currentStart),
            end: formatIsoDate(currentEnd),
            initiativeId,
            kind: 'project',
            badge: initiativeLabel,
            description: `Задачи: ${segmentNames.join(', ')}`
          });
        };

        for (let index = 1; index < sorted.length; index += 1) {
          const task = sorted[index];
          const taskStart = startOfDay(toDate(task.start));
          const taskEnd = startOfDay(toDate(task.end));
          const isContinuous = taskStart.getTime() <= addDays(currentEnd, 1).getTime();

          if (isContinuous) {
            if (taskEnd.getTime() > currentEnd.getTime()) {
              currentEnd = taskEnd;
            }
            segmentNames.push(task.name);
          } else {
            pushSegment();
            segmentIndex += 1;
            currentStart = taskStart;
            currentEnd = taskEnd;
            segmentNames = [task.name];
          }
        }

        pushSegment();
      });

      return [...mergedSegments, ...tasksWithoutInitiative].sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
      );
    },
    [initiativeNameMap]
  );

  const timelineData = useMemo(() => {
    const taskLookup = new Map<string, { task: WorkloadTask; employee: EmployeeWorkload }>();

    const rows = employees.map((employee) => {
      const sortedTasks = employee.tasks
        .slice()
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

      const baseTasks = sortedTasks.map((task) => ({
        id: task.id,
        name: task.name,
        start: task.start,
        end: task.end,
        initiativeId: task.initiativeId,
        kind: task.kind,
        badge: task.badge,
        description: task.description
      }));

      const teamTasks = teamTimelineTasksByEmployee.get(employee.id) ?? [];
      const initiativeTasks = initiativeTimelineTasksByEmployee.get(employee.id) ?? [];

      const mergedTasks =
        timelineMode.value === 'initiatives'
          ? mergeInitiativeTasks([...baseTasks, ...teamTasks, ...initiativeTasks])
          : [...baseTasks, ...teamTasks, ...initiativeTasks].sort(
              (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
            );

      if (mergedTasks.length === 0) {
         // Return early or with empty state placeholder if needed, 
         // but standard Gantt might handle empty rows gracefully.
      }

      mergedTasks.forEach((task) => {
        taskLookup.set(task.id, { task, employee });
      });

      const sidebar = (
        <div className={styles.employeeCell}>
          <div className={styles.employeeMeta}>
            <Text size="s" weight="semibold">
              {employee.fullName}
            </Text>
          </div>
          <Text size="xs" view="secondary">
            {employee.position}
          </Text>
          <div className={styles.employeeStats}>
            <div className={styles.employeeStatItem}>
              <Text size="2xs" view="secondary">
                Загруженность
              </Text>
              <Text size="xs" weight="semibold">
                {Math.round(employee.workload * 100)}%
              </Text>
            </div>
            <div className={styles.employeeStatItem}>
              <Text size="2xs" view="secondary">
                Доступность
              </Text>
              <Text size="xs" weight="semibold">
                {employee.availability}
              </Text>
            </div>
          </div>
          <Text size="2xs" view="secondary">
            {employee.focus}
          </Text>
        </div>
      );

      return { id: employee.id, sidebar, tasks: mergedTasks };
    });

    return { timelineRows: rows, timelineTaskLookup: taskLookup };
  }, [
    employees,
    initiativeTimelineTasksByEmployee,
    mergeInitiativeTasks,
    teamTimelineTasksByEmployee,
    timelineMode.value
  ]);

  const timelineTaskLookup = timelineData.timelineTaskLookup;
  const timelineRows = timelineData.timelineRows;

  useEffect(() => {
    if (activeTimelineTaskId && !timelineTaskLookup.has(activeTimelineTaskId)) {
      setActiveTimelineTaskId(null);
    }
  }, [activeTimelineTaskId, timelineTaskLookup]);

  const activeTimelineTask = activeTimelineTaskId
    ? timelineTaskLookup.get(activeTimelineTaskId) ?? null
    : null;

  const handleTimelineTaskClick = useCallback(
    ({ task }: { rowId: string; task: GanttTimelineTask }) => {
      setActiveTimelineTaskId(task.id);
    },
    []
  );

  const handleClearTimelineTask = useCallback(() => {
    setActiveTimelineTaskId(null);
  }, []);

  const selectedTask = useMemo(() => {
    return tasks.find((task) => task.id === selectedTaskId) ?? null;
  }, [selectedTaskId, tasks]);

  const taskNameLookup = useMemo(() => {
    const map = new Map<string, string>();
    tasks.forEach((task) => {
      map.set(task.id, task.name);
    });
    return map;
  }, [tasks]);

  const draftPreviewTask = useMemo(() => {
    return createPreviewTaskFromDraft(taskDraft, editingTaskId ?? 'draft-task');
  }, [editingTaskId, taskDraft]);

  const predecessorOptions = useMemo<SelectOption<string>[]>(() => {
    return tasks
      .filter((task) => task.id !== editingTaskId)
      .map((task) => ({ label: task.name, value: task.id }));
  }, [editingTaskId, tasks]);

  const calculateParallelTasks = useCallback(
    (assigneeId: string, referenceTask: TaskListItem) => {
      const dueDate =
        teamTaskWindows.get(referenceTask.id)?.end ?? getScheduleDueDate(referenceTask.schedule);
      const employee = employees.find((item) => item.id === assigneeId);

      const overlappingProjectTasks = (() => {
        if (!employee || !dueDate) {
          return 0;
        }

        return employee.tasks.filter((projectTask) => {
          const startDate = new Date(projectTask.start);
          const endDate = new Date(projectTask.end);
          if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
            return false;
          }
          return startDate.getTime() <= dueDate.getTime() && dueDate.getTime() <= endDate.getTime();
        }).length;
      })();

      const overlappingTeamTasks = tasks.filter((task) => {
        if (task.id === referenceTask.id) {
          return false;
        }
        if (task.assigneeId !== assigneeId) {
          return false;
        }
        const compareDate = teamTaskWindows.get(task.id)?.end ?? getScheduleDueDate(task.schedule);
        if (!dueDate || !compareDate) {
          return true;
        }
        return compareDate.getTime() === dueDate.getTime();
      }).length;

      return overlappingProjectTasks + overlappingTeamTasks;
    },
    [employees, tasks, teamTaskWindows]
  );

  const getAssigneeLoadLevel = useCallback(
    (assigneeId: string, task: TaskListItem) => {
      const parallelTasks = calculateParallelTasks(assigneeId, task);
      if (parallelTasks === 0) {
        return 'free';
      }
      if (parallelTasks === 1) {
        return 'focus';
      }
      return 'busy';
    },
    [calculateParallelTasks]
  );

  const getAssigneeRenderItem = useCallback(
    (
      contextTask: TaskListItem | null,
      previewTask: TaskListItem | null
    ): SelectProps<SelectOption<string>>['renderItem'] => {
      // eslint-disable-next-line react/display-name
      return ({ item, active, hovered, onMouseEnter, onClick, ref }) => {
        const referenceTask = contextTask ?? previewTask;
        const loadLevel = referenceTask
          ? getAssigneeLoadLevel(item.value, referenceTask)
          : 'free';

        return (
          <div
            ref={ref}
            className={styles.assigneeOption}
            data-active={active ? 'true' : 'false'}
            data-hovered={hovered ? 'true' : 'false'}
            onMouseEnter={onMouseEnter}
            onClick={(event) => {
              onClick(event);
            }}
          >
            <div className={styles.assigneeOptionContent}>
              <span className={styles.assigneeIndicator} data-level={loadLevel ?? 'free'} />
              <Text size="xs" weight="semibold">{item.label}</Text>
            </div>
          </div>
        );
      };
    },
    [getAssigneeLoadLevel]
  );

  const handleAssignTask = useCallback((taskId: string, assigneeId: string | null) => {
    applyTasksChange((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? {
              ...task,
              assigneeId
            }
          : task
      )
    );
  }, [applyTasksChange]);

  const handleSubmitTask = useCallback(() => {
    const trimmedName = taskDraft.name.trim();
    if (!trimmedName) {
      setFormError('Укажите наименование задачи.');
      return;
    }

    const schedule = buildScheduleFromDraft(taskDraft);
    if (!schedule) {
      switch (taskDraft.scheduleType) {
        case 'due-date':
          setFormError('Укажите дату, к которой нужно выполнить задачу.');
          break;
        case 'start-duration':
          setFormError('Укажите дату начала и корректный срок реализации.');
          break;
        case 'date-range':
          setFormError('Укажите корректный период выполнения задачи.');
          break;
        case 'after-task':
          setFormError('Выберите связанную задачу и срок реализации после неё.');
          break;
        default:
          setFormError('Заполните параметры планирования задачи.');
      }
      return;
    }

    if (schedule.type === 'after-task' && editingTaskId && schedule.predecessorId === editingTaskId) {
      setFormError('Связанная задача не может совпадать с редактируемой.');
      return;
    }

    if (taskDraft.relationType === 'system' && !taskDraft.relatedSystemId) {
      setFormError('Выберите систему, к которой относится задача.');
      return;
    }

    if (taskDraft.relationType === 'initiative' && !taskDraft.relatedInitiativeId) {
      setFormError('Выберите инициативу, к которой относится задача.');
      return;
    }

    const relation = buildRelationFromDraft(taskDraft);
    const taskId = editingTaskId ?? `team-task-${Date.now()}`;
    const normalizedDescription =
      taskDraft.description.trim() || 'Описание будет добавлено позже.';

    const nextTask: TaskListItem = {
      id: taskId,
      name: trimmedName,
      priority: taskDraft.priority,
      status: taskDraft.status,
      assigneeId: taskDraft.assigneeId,
      description: normalizedDescription,
      schedule,
      relation
    };

    applyTasksChange((prev) =>
      editingTaskId
        ? prev.map((task) => (task.id === editingTaskId ? nextTask : task))
        : [nextTask, ...prev]
    );
    resetTaskDraft();
    setSelectedTaskId(taskId);
  }, [applyTasksChange, editingTaskId, resetTaskDraft, taskDraft]);

  const handleEditTask = useCallback(
    (task: TaskListItem) => {
      setTaskDraft(mapTaskToDraft(task, initiativeOptions));
      setEditingTaskId(task.id);
      setFormError(null);
      if (activeView.value !== 'planner') {
        setActiveView(viewTabs[1]);
      }
    },
    [activeView.value, initiativeOptions, setActiveView]
  );

  const handleCancelEdit = useCallback(() => {
    resetTaskDraft();
  }, [resetTaskDraft]);

  const handleRequestDeleteTask = useCallback(() => {
    if (!editingTaskId) {
      return;
    }
    const task = tasks.find((item) => item.id === editingTaskId);
    if (task) {
      setTaskToDelete(task);
    }
  }, [editingTaskId, tasks]);

  const handleConfirmDeleteTask = useCallback(() => {
    if (!taskToDelete) {
      return;
    }
    applyTasksChange((prev) => prev.filter((task) => task.id !== taskToDelete.id));
    if (editingTaskId === taskToDelete.id) {
      resetTaskDraft();
    }
    setTaskToDelete(null);
  }, [applyTasksChange, editingTaskId, resetTaskDraft, taskToDelete]);

  const handleCloseDeleteModal = useCallback(() => {
    setTaskToDelete(null);
  }, []);

  return (
    <div className={styles.wrapper}>
      <div className={styles.viewTabs}>
        <Tabs<ViewTab>
          size="s"
          items={viewTabs}
          value={activeView}
          getItemLabel={(item) => item.label}
          getItemKey={(item) => item.value}
          onChange={setActiveView}
        />
      </div>
      {activeView.value === 'planner' ? (
        <Card
          className={`${styles.card} ${styles.taskCard}`}
          verticalSpace="xl"
          horizontalSpace="xl"
        >
        <header className={styles.taskHeader}>
          <div className={styles.taskHeaderInfo}>
            <Text size="s" weight="semibold">
              Постановка задач
            </Text>
            <Text size="xs" view="secondary">
              Создавайте и назначайте задачи для своей команды
            </Text>
          </div>
          <Badge
            size="xs"
            view="stroked"
            status="system"
            label={`Активных задач: ${tasks.length}`}
          />
        </header>
        <form
          className={styles.taskForm}
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmitTask();
          }}
        >
          <div className={styles.taskFormFields}>
            <TextField
              size="s"
              label="Наименование"
              placeholder="Например, подготовить паспорт проекта"
              className={styles.fullWidthField}
              value={taskDraft.name}
              onChange={(value) => {
                setTaskDraft((prev) => ({
                  ...prev,
                  name: value ?? ''
                }));
              }}
            />
            <Select<SelectOption<TaskScheduleType>>
              size="s"
              className={styles.fullWidthField}
              label="Планирование"
              items={scheduleTypeOptions}
              value={
                scheduleTypeOptions.find((item) => item.value === taskDraft.scheduleType) ?? null
              }
              getItemLabel={(item) => item.label}
              getItemKey={(item) => item.value}
              onChange={(option) => {
                setTaskDraft((prev) => {
                  const nextType = option?.value ?? prev.scheduleType;
                  if (nextType === prev.scheduleType) {
                    return prev;
                  }
                  return {
                    ...prev,
                    scheduleType: nextType,
                    dueDate: '',
                    startDate: '',
                    endDate: '',
                    durationDays: '',
                    predecessorId: null
                  };
                });
              }}
            />
            {taskDraft.scheduleType === 'due-date' && (
              <TextField
                size="s"
                type="date"
                label="Срок до"
                value={taskDraft.dueDate}
                onChange={(value) => {
                  setTaskDraft((prev) => ({
                    ...prev,
                    dueDate: value ?? ''
                  }));
                }}
              />
            )}
            {taskDraft.scheduleType === 'start-duration' && (
              <>
                <TextField
                  size="s"
                  type="date"
                  label="Дата начала"
                  value={taskDraft.startDate}
                  onChange={(value) => {
                    setTaskDraft((prev) => ({
                      ...prev,
                      startDate: value ?? ''
                    }));
                  }}
                />
                <TextField
                  size="s"
                  type="number"
                  label="Срок, дни"
                  value={taskDraft.durationDays}
                  min={1}
                  onChange={(value) => {
                    setTaskDraft((prev) => ({
                      ...prev,
                      durationDays: value ?? ''
                    }));
                  }}
                />
              </>
            )}
            {taskDraft.scheduleType === 'date-range' && (
              <>
                <TextField
                  size="s"
                  type="date"
                  label="Дата начала"
                  value={taskDraft.startDate}
                  onChange={(value) => {
                    setTaskDraft((prev) => ({
                      ...prev,
                      startDate: value ?? ''
                    }));
                  }}
                />
                <TextField
                  size="s"
                  type="date"
                  label="Дата окончания"
                  value={taskDraft.endDate}
                  onChange={(value) => {
                    setTaskDraft((prev) => ({
                      ...prev,
                      endDate: value ?? ''
                    }));
                  }}
                />
              </>
            )}
            {taskDraft.scheduleType === 'after-task' && (
              <>
                <Select<SelectOption<string>>
                  size="s"
                  label="Связанная задача"
                  placeholder="Выберите задачу"
                  items={predecessorOptions}
                  value={
                    taskDraft.predecessorId
                      ? predecessorOptions.find((option) => option.value === taskDraft.predecessorId) ?? null
                      : null
                  }
                  getItemLabel={(item) => item.label}
                  getItemKey={(item) => item.value}
                  onChange={(option) => {
                    setTaskDraft((prev) => ({
                      ...prev,
                      predecessorId: option?.value ?? null
                    }));
                  }}
                />
                <TextField
                  size="s"
                  type="number"
                  label="Срок после, дни"
                  value={taskDraft.durationDays}
                  min={1}
                  onChange={(value) => {
                    setTaskDraft((prev) => ({
                      ...prev,
                      durationDays: value ?? ''
                    }));
                  }}
                />
              </>
            )}
            <Select<SelectOption<TaskPriority>>
              size="s"
              label="Приоритет"
              items={priorityOptions}
              value={priorityOptions.find((item) => item.value === taskDraft.priority) ?? null}
              getItemLabel={(item) => item.label}
              getItemKey={(item) => item.value}
              onChange={(option) => {
                setTaskDraft((prev) => ({
                  ...prev,
                  priority: option?.value ?? prev.priority
                }));
              }}
            />
            <Select<SelectOption<TaskStatus>>
              size="s"
              label="Статус"
              items={statusOptions}
              value={statusOptions.find((item) => item.value === taskDraft.status) ?? null}
              getItemLabel={(item) => item.label}
              getItemKey={(item) => item.value}
              onChange={(option) => {
                setTaskDraft((prev) => ({
                  ...prev,
                  status: option?.value ?? prev.status
                }));
              }}
            />
            <Select<SelectOption<string>>
              size="s"
              label="Исполнитель"
              placeholder="Назначьте исполнителя"
              className={styles.fullWidthField}
              items={assigneeOptions}
              value={
                taskDraft.assigneeId
                  ? assigneeOptions.find((option) => option.value === taskDraft.assigneeId) ?? null
                  : null
              }
              getItemLabel={(item) => item.label}
              getItemKey={(item) => item.value}
              renderItem={getAssigneeRenderItem(draftPreviewTask, draftPreviewTask)}
              onChange={(option) => {
                setTaskDraft((prev) => ({
                  ...prev,
                  assigneeId: option?.value ?? null
                }));
              }}
            />
            <Select<SelectOption<TaskRelationType>>
              size="s"
              label="Контекст задачи"
              className={styles.fullWidthField}
              items={relationTypeOptions}
              value={
                relationTypeOptions.find((item) => item.value === taskDraft.relationType) ?? null
              }
              getItemLabel={(item) => item.label}
              getItemKey={(item) => item.value}
              onChange={(option) => {
                setTaskDraft((prev) => {
                  const nextType = option?.value ?? prev.relationType;
                  return {
                    ...prev,
                    relationType: nextType,
                    relatedSystemId:
                      nextType === 'system'
                        ? prev.relatedSystemId ?? systemOptions[0]?.value ?? null
                        : prev.relatedSystemId,
                    relatedInitiativeId:
                      nextType === 'initiative'
                        ? prev.relatedInitiativeId ?? initiativeOptions[0]?.value ?? null
                        : prev.relatedInitiativeId
                  };
                });
              }}
            />
            {taskDraft.relationType === 'system' && (
              <Select<SelectOption<string>>
                size="s"
                label="Система"
                items={systemOptions}
                value={
                  taskDraft.relatedSystemId
                    ? systemOptions.find((option) => option.value === taskDraft.relatedSystemId) ?? null
                    : null
                }
                getItemLabel={(item) => item.label}
                getItemKey={(item) => item.value}
                onChange={(option) => {
                  setTaskDraft((prev) => ({
                    ...prev,
                    relatedSystemId: option?.value ?? null
                  }));
                }}
              />
            )}
            {taskDraft.relationType === 'initiative' && (
              <Select<SelectOption<string>>
                size="s"
                label="Инициатива"
                items={initiativeOptions}
                value={
                  taskDraft.relatedInitiativeId
                    ? initiativeOptions.find((option) => option.value === taskDraft.relatedInitiativeId) ?? null
                    : null
                }
                getItemLabel={(item) => item.label}
                getItemKey={(item) => item.value}
                onChange={(option) => {
                  setTaskDraft((prev) => ({
                    ...prev,
                    relatedInitiativeId: option?.value ?? null
                  }));
                }}
              />
            )}
          </div>
          <TextField
            size="s"
            label="Описание"
            type="textarea"
            rows={3}
            placeholder="Кратко опишите ожидаемый результат"
            value={taskDraft.description}
            onChange={(value) => {
              setTaskDraft((prev) => ({
                ...prev,
                description: value ?? ''
              }));
            }}
          />
          {formError && (
            <Text size="xs" view="alert">
              {formError}
            </Text>
          )}
          <div className={styles.taskFormActions}>
            {editingTaskId && (
              <Button
                type="button"
                size="s"
                view="secondary"
                status="alert"
                label="Удалить задачу"
                onClick={handleRequestDeleteTask}
              />
            )}
            {editingTaskId && (
              <Button
                type="button"
                size="s"
                view="secondary"
                label="Отменить"
                onClick={handleCancelEdit}
              />
            )}
            <Button
              type="submit"
              size="s"
              view="primary"
              label={editingTaskId ? 'Сохранить изменения' : 'Добавить задачу'}
            />
          </div>
        </form>
        <div className={styles.taskTable}>
          <div className={`${styles.taskRow} ${styles.taskRowHeader}`} aria-hidden={true}>
            <Text size="2xs" view="secondary">
              Наименование
            </Text>
            <Text size="2xs" view="secondary">
              Приоритет
            </Text>
            <Text size="2xs" view="secondary">
              Планирование
            </Text>
            <Text size="2xs" view="secondary">
              Статус
            </Text>
            <Text size="2xs" view="secondary">
              Исполнители
            </Text>
            <Text size="2xs" view="secondary">
              Контекст
            </Text>
          </div>
          {tasks.map((task) => {
            const priorityBadge = priorityBadges[task.priority];
            const statusBadge = statusBadges[task.status];
            const assigneeName = task.assigneeId ? employeeNameMap[task.assigneeId] : null;
            const loadLevel = task.assigneeId ? getAssigneeLoadLevel(task.assigneeId, task) : null;
            const scheduleSummary = formatScheduleSummary(task, taskNameLookup);
            const relationSummary = getRelationSummary(task.relation, {
              systems: systemNameMap,
              initiatives: initiativeNameMap
            });

            return (
              <div
                key={task.id}
                className={`${styles.taskRow} ${
                  task.id === selectedTaskId ? styles.taskRowActive : ''
                }`}
              >
                <button
                  type="button"
                  className={styles.taskNameButton}
                  onClick={() => {
                    setSelectedTaskId(task.id);
                  }}
                >
                  <Text size="xs" weight="semibold">
                    {task.name}
                  </Text>
                </button>
                <Badge
                  size="xs"
                  view="filled"
                  status={priorityBadge.badgeStatus}
                  label={priorityBadge.label}
                />
                <Text size="xs" view="secondary">
                  {scheduleSummary}
                </Text>
                <Badge
                  size="xs"
                  view="filled"
                  status={statusBadge.badgeStatus}
                  label={statusBadge.label}
                />
                {assigneeName ? (
                  <div className={styles.assigneeInfo}>
                    <span className={styles.assigneeIndicator} data-level={loadLevel ?? 'free'} />
                    <Text size="xs" weight="semibold">
                      {assigneeName}
                    </Text>
                  </div>
                ) : (
                  <Select<SelectOption<string>>
                    size="xs"
                    placeholder="Назначить"
                    items={assigneeOptions}
                    value={null}
                    getItemLabel={(item) => item.label}
                    getItemKey={(item) => item.value}
                    renderItem={getAssigneeRenderItem(task, null)}
                    onChange={(option) => {
                      handleAssignTask(task.id, option?.value ?? null);
                    }}
                  />
                )}
                <Text size="xs" view="secondary" className={styles.taskContextCell}>
                  {relationSummary}
                </Text>
              </div>
            );
          })}
        </div>
        {selectedTask && (
          <div className={styles.taskDetails}>
            <Text size="s" weight="semibold">
              {selectedTask.name}
            </Text>
            <div className={styles.taskDetailsMeta}>
              <Badge
                size="xs"
                view="filled"
                status={priorityBadges[selectedTask.priority].badgeStatus}
                label={priorityBadges[selectedTask.priority].label}
              />
              <Badge
                size="xs"
                view="filled"
                status={statusBadges[selectedTask.status].badgeStatus}
                label={statusBadges[selectedTask.status].label}
              />
              <Text size="xs" view="secondary">
                {formatScheduleDetails(selectedTask, taskNameLookup)}
              </Text>
              {selectedTask.assigneeId && (
                <div className={styles.taskDetailsAssignee}>
                  <span
                    className={styles.assigneeIndicator}
                    data-level={getAssigneeLoadLevel(selectedTask.assigneeId, selectedTask)}
                  />
                  <Text size="xs" weight="semibold">
                    {employeeNameMap[selectedTask.assigneeId]}
                  </Text>
                </div>
              )}
            </div>
            <Text size="xs" view="secondary">
              {getRelationSummary(selectedTask.relation, {
                systems: systemNameMap,
                initiatives: initiativeNameMap
              })}
            </Text>
            <Text size="xs" view="secondary">
              {selectedTask.description}
            </Text>
            <div className={styles.taskDetailsActions}>
              <Button
                size="xs"
                view="secondary"
                label={editingTaskId === selectedTask.id ? 'Редактирование открыто' : 'Редактировать'}
                disabled={editingTaskId === selectedTask.id}
                onClick={() => {
                  handleEditTask(selectedTask);
                }}
              />
            </div>
          </div>
        )}
        </Card>
      ) : (
        <Card
          className={`${styles.card} ${styles.workloadCard}`}
          verticalSpace="xl"
          horizontalSpace="xl"
        >
      <header className={styles.header}>
        <div className={styles.headerInfo}>
          <Text size="s" weight="semibold">
            Загруженность сотрудников
          </Text>
          <div className={styles.summary}>
            <Text size="xs" view="secondary">
              Сотрудники: {employees.length}
            </Text>
            <Text size="xs" view="secondary">
              Показаны кандидаты с учетом загрузки по задачам
            </Text>
          </div>
        </div>
        <div className={styles.headerControls}>
          <Tabs<TimelineMode>
            size="s"
            items={timelineModeTabs}
            value={timelineMode}
            getItemLabel={(item) => item.label}
            getItemKey={(item) => item.value}
            onChange={setTimelineMode}
          />
          <Tabs<TimelineScaleTab>
            size="s"
            items={timelineScaleTabs}
            value={scale}
            getItemLabel={(item) => item.label}
            getItemKey={(item) => item.value}
            onChange={setScale}
          />
          <Select<PeriodOption>
            size="s"
            className={styles.periodSelect}
            label="Период"
            placeholder="Выберите период"
            items={currentPeriodOptions}
            value={displayedPeriod ?? null}
            getItemLabel={(item) => item.label}
            getItemKey={(item) => item.value}
          onChange={(option) =>
            setSelectedPeriods((prev) => ({
              ...prev,
              [scale.value]: option?.value ?? null
            }))
          }
          disabled={currentPeriodOptions.length === 0}
        />
      </div>
    </header>
      <Text size="xs" view="secondary">
        {timelineMode.value === 'initiatives'
          ? 'Задачи объединены по инициативам и показываются едиными полосами, если периоды идут без разрывов.'
          : 'Показаны все задачи сотрудников в разрезе проектов и активности команды.'}
      </Text>
      <div className={styles.legend} aria-hidden={true}>
        <div className={styles.legendItem}>
          <span className={styles.legendMarker} data-kind="project" />
          <Text size="2xs" view="secondary">
            Проектные задачи
          </Text>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendMarker} data-kind="out-of-project" />
          <Text size="2xs" view="secondary">
            Вне проекта
          </Text>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendMarker} data-kind="training" />
          <Text size="2xs" view="secondary">
            Развитие и обучение
          </Text>
        </div>
      </div>
      <div className={styles.timelineLayout}>
        <div className={styles.timelineChart}>
          <GanttTimeline
            axisLabel="Сотрудник"
            scale={scale.value}
            rows={timelineRows}
            viewRange={resolvedViewRange}
            onTaskClick={handleTimelineTaskClick}
            selectedTaskId={activeTimelineTaskId}
          />
        </div>
        <aside className={styles.timelineDetails}>
          {activeTimelineTask ? (
            <>
              <div className={styles.timelineDetailsHeader}>
                <Text size="s" weight="semibold">
                  {activeTimelineTask.task.name}
                </Text>
                <Button
                  size="xs"
                  view="ghost"
                  label="Очистить"
                  onClick={handleClearTimelineTask}
                />
              </div>
              <div className={styles.timelineDetailsMeta}>
                <Badge
                  size="xs"
                  status={workloadBadgeStatuses[activeTimelineTask.task.kind]}
                  label={activeTimelineTask.task.badge}
                />
                <Text size="xs" view="secondary">
                  {formatTimelineTaskPeriod(activeTimelineTask.task.start, activeTimelineTask.task.end)}
                </Text>
              </div>
            <div className={styles.timelineDetailsEmployee}>
              <Text size="2xs" view="secondary">
                Сотрудник
              </Text>
              <Text size="s" weight="semibold">
                {activeTimelineTask.employee.fullName}
              </Text>
              <Text size="xs" view="secondary">
                {activeTimelineTask.employee.position}
              </Text>
            </div>
            <div className={styles.timelineDetailsStats}>
              <div className={styles.statBadge}>
                <Text size="2xs" view="secondary">Загруженность</Text>
                <Text size="xs" weight="bold">{Math.round(activeTimelineTask.employee.workload * 100)}%</Text>
              </div>
              <div className={styles.statBadge}>
                 <Text size="2xs" view="secondary">Доступность</Text>
                 <Text size="xs">{activeTimelineTask.employee.availability}</Text>
              </div>
            </div>
              <Text size="xs" view="secondary">
                {activeTimelineTask.employee.focus}
              </Text>
              <Text size="xs">
                {activeTimelineTask.task.description ?? 'Описание не добавлено'}
              </Text>
            </>
          ) : (
            <div className={styles.timelineDetailsEmpty}>
              <Text size="s" view="secondary">
                Выберите задачу на дорожной карте, чтобы увидеть подробности
              </Text>
            </div>
          )}
        </aside>
      </div>
        </Card>
      )}
      <Modal
        isOpen={Boolean(taskToDelete)}
        hasOverlay
        onClickOutside={handleCloseDeleteModal}
        onEsc={handleCloseDeleteModal}
      >
        <div className={styles.confirmModal}>
          <Text size="m" weight="semibold">
            Удалить задачу?
          </Text>
          <Text size="s" view="secondary">
            Вы уверены, что хотите удалить задачу «{taskToDelete?.name}»?
          </Text>
          <div className={styles.confirmModalActions}>
            <Button size="s" view="ghost" label="Отмена" onClick={handleCloseDeleteModal} />
            <Button
              size="s"
              view="primary"
              status="alert"
              label="Удалить"
              onClick={handleConfirmDeleteTask}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default EmployeeWorkloadTrack;
