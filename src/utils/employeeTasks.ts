import type { TaskListItem, TaskRelation, TaskSchedule } from '../types/tasks';

export const EMPLOYEE_TASKS_STORAGE_KEY = 'employee-workload-track:team-tasks';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object';
};

const isStoredTaskSchedule = (value: unknown): value is TaskSchedule => {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  switch (value.type) {
    case 'due-date':
      return typeof value.dueDate === 'string';
    case 'start-duration':
      return typeof value.startDate === 'string' && typeof value.durationDays === 'number';
    case 'date-range':
      return typeof value.startDate === 'string' && typeof value.endDate === 'string';
    case 'after-task':
      return typeof value.predecessorId === 'string' && typeof value.durationDays === 'number';
    default:
      return false;
  }
};

const isStoredTaskRelation = (value: unknown): value is TaskRelation => {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  switch (value.type) {
    case 'system':
    case 'initiative':
      return value.targetId === null || typeof value.targetId === 'string';
    case 'external':
    case 'methodology':
      return true;
    default:
      return false;
  }
};

const isStoredTask = (value: unknown): value is TaskListItem => {
  if (!isRecord(value)) {
    return false;
  }

  const { id, name, priority, status, assigneeId, description, schedule, relation } = value;

  if (typeof id !== 'string' || typeof name !== 'string' || typeof description !== 'string') {
    return false;
  }

  if (assigneeId !== null && typeof assigneeId !== 'string') {
    return false;
  }

  if (!['low', 'medium', 'high'].includes(priority as string)) {
    return false;
  }

  if (!['new', 'in-progress', 'paused', 'rejected', 'completed'].includes(status as string)) {
    return false;
  }

  if (!isStoredTaskSchedule(schedule)) {
    return false;
  }

  if (!isStoredTaskRelation(relation)) {
    return false;
  }

  return true;
};

export const loadStoredTasks = (
  storageKey: string = EMPLOYEE_TASKS_STORAGE_KEY
): TaskListItem[] | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.localStorage.getItem(storageKey);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }

    const normalized = parsed.filter(isStoredTask).map((task) => ({
      ...task,
      assigneeId: task.assigneeId ?? null,
      schedule: { ...task.schedule },
      relation: { ...task.relation }
    }));

    return normalized;
  } catch {
    return null;
  }
};

export const persistStoredTasks = (
  tasks: TaskListItem[],
  storageKey: string = EMPLOYEE_TASKS_STORAGE_KEY
): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(tasks));
  } catch {
    // ignore storage errors
  }
};

export const formatIsoDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseDateValue = (value: string): Date | null => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export const startOfDay = (date: Date): Date => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

export type TaskScheduleWindow = { start: Date; end: Date };

export const resolveTaskScheduleWindow = (
  task: TaskListItem,
  taskMap: Map<string, TaskListItem>,
  stack: Set<string> = new Set()
): TaskScheduleWindow | null => {
  if (stack.has(task.id)) {
    return null;
  }

  const nextStack = new Set(stack);
  nextStack.add(task.id);

  const { schedule } = task;

  switch (schedule.type) {
    case 'due-date': {
      const dueDate = parseDateValue(schedule.dueDate);
      if (!dueDate) {
        return null;
      }
      const day = startOfDay(dueDate);
      return { start: day, end: day };
    }
    case 'start-duration': {
      const startDate = parseDateValue(schedule.startDate);
      if (!startDate) {
        return null;
      }
      const dueDate = addDays(startDate, schedule.durationDays);
      return { start: startOfDay(startDate), end: startOfDay(dueDate) };
    }
    case 'date-range': {
      const startDate = parseDateValue(schedule.startDate);
      const endDate = parseDateValue(schedule.endDate);
      if (!startDate || !endDate || endDate.getTime() < startDate.getTime()) {
        return null;
      }
      return { start: startOfDay(startDate), end: startOfDay(endDate) };
    }
    case 'after-task': {
      const predecessor = schedule.predecessorId ? taskMap.get(schedule.predecessorId) : undefined;
      if (!predecessor) {
        return null;
      }
      const predecessorWindow = resolveTaskScheduleWindow(predecessor, taskMap, nextStack);
      if (!predecessorWindow) {
        return null;
      }
      const startDate = addDays(predecessorWindow.end, 1);
      const dueDate = addDays(predecessorWindow.end, schedule.durationDays);
      return { start: startOfDay(startDate), end: startOfDay(dueDate) };
    }
    default:
      return null;
  }
};
