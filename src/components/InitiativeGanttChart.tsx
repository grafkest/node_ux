import { Badge } from '@consta/uikit/Badge';
import { Select } from '@consta/uikit/Select';
import { Tabs } from '@consta/uikit/Tabs';
import { Text } from '@consta/uikit/Text';
import React, { useEffect, useMemo, useState } from 'react';
import type { TeamRole } from '../data';
import GanttTimeline, {
  type GanttTimelineRow,
  type GanttTimelineTask,
  timelineScaleTabs,
  type TimelineScaleTab
} from './GanttTimeline';
import cardStyles from './EmployeeWorkloadTrack.module.css';
import styles from './InitiativeGanttChart.module.css';

export type InitiativeGanttDependencyType = 'FS' | 'SS' | 'FF' | 'SF';

export type InitiativeGanttDependency = {
  id: string;
  type: InitiativeGanttDependencyType;
  lag?: number;
  lagUnit?: 'hours' | 'days';
};

export type InitiativeGanttBlockerScope = 'task' | 'work' | 'project';

export type InitiativeGanttBlocker = {
  id: string;
  scope: InitiativeGanttBlockerScope;
  reason: string;
  createdBy?: string;
  active: boolean;
};

export type InitiativeGanttResource = {
  id: string;
  name: string;
  role: TeamRole;
  units?: number;
  capacityHoursPerWeek?: number;
  calendarId?: string;
  skills?: string[];
};

export type InitiativeGanttTask = {
  id: string;
  name: string;
  role: TeamRole;
  effortDays: number;
  startDay: number;
  durationDays: number;
  projectId?: string;
  projectName?: string;
  workId?: string;
  workName?: string;
  parentTaskId?: string;
  effortHours?: number;
  minUnits?: number;
  maxUnits?: number;
  canSplit?: boolean;
  parallelAllowed?: boolean;
  durationMode?: 'fixed-effort' | 'fixed-duration';
  constraints?: string[];
  calendarId?: string;
  priority?: number;
  wipLimitTag?: string;
  scenarioBranch?: string;
  type?: 'task' | 'buffer';
  assignedExpert?: string;
  resources?: InitiativeGanttResource[];
  dependencies?: InitiativeGanttDependency[];
  blockers?: InitiativeGanttBlocker[];
};

type InitiativeGanttChartProps = {
  tasks: InitiativeGanttTask[];
  startDate?: string | Date;
};

type InitiativeTimelineGroup = {
  id: string;
  displayName: string;
  isUnassigned: boolean;
  roles: Set<string>;
  workNames: Set<string>;
  projectNames: Set<string>;
  tasks: GanttTimelineTask[];
  totalEffort: number;
  blockers: string[];
};

const addDays = (date: Date, amount: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
};

const startOfDay = (date: Date): Date => {
  const result = new Date(date);
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

const addMonths = (date: Date, amount: number): Date => {
  const result = new Date(date);
  result.setMonth(result.getMonth() + amount, 1);
  result.setHours(0, 0, 0, 0);
  return result;
};

const addYears = (date: Date, amount: number): Date => {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + amount, 1);
  result.setMonth(0, 1);
  result.setHours(0, 0, 0, 0);
  return result;
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

const capitalize = (value: string): string => {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
};

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

const toDate = (value: Date | string): Date => {
  if (value instanceof Date) {
    return value;
  }
  return new Date(value);
};

type PeriodOption = {
  label: string;
  value: string;
  start: Date;
  end: Date;
};

type TimelineScale = TimelineScaleTab['value'];

type PanelTab = { label: string; value: 'assignments' | 'tasks' };

const panelTabs: PanelTab[] = [
  { label: 'Назначения', value: 'assignments' },
  { label: 'Описание задач', value: 'tasks' }
];

const buildWeekOptions = (baseStart: Date, minDate: Date, maxDate: Date): PeriodOption[] => {
  const earliest = startOfWeek(addDays(minDate, -7));
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
  const earliest = startOfMonth(addMonths(minDate, -1));
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
  const earliest = startOfYear(addYears(minDate, -1));
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

const InitiativeGanttChart: React.FC<InitiativeGanttChartProps> = ({ tasks, startDate }) => {
  const baseStart = useMemo(() => {
    if (!startDate) {
      return startOfDay(new Date(Date.UTC(2024, 0, 1)));
    }
    const parsed = new Date(startDate);
    if (Number.isNaN(parsed.getTime())) {
      return startOfDay(new Date(Date.UTC(2024, 0, 1)));
    }
    return startOfDay(parsed);
  }, [startDate]);

  const [scale, setScale] = useState<TimelineScaleTab>(timelineScaleTabs[1]);
  const [panelView, setPanelView] = useState<PanelTab>(panelTabs[0]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const groups = useMemo(() => {
    if (tasks.length === 0) {
      return [] as InitiativeTimelineGroup[];
    }

    const map = new Map<string, InitiativeTimelineGroup>();

    tasks.forEach((task) => {
      const roleKey = task.role ?? 'other';
      const key = task.assignedExpert ? `expert:${task.assignedExpert}` : `role:${roleKey}`;
      const displayName = task.assignedExpert ?? (task.role ? `Роль ${task.role}` : 'Исполнитель не назначен');
      const existing = map.get(key);
      const group: InitiativeTimelineGroup =
        existing ?? {
          id: key,
          displayName,
          isUnassigned: !task.assignedExpert,
          roles: new Set(),
          workNames: new Set(),
          projectNames: new Set(),
          tasks: [],
          totalEffort: 0,
          blockers: []
        };

      group.roles.add(task.role);
      if (task.workName) {
        group.workNames.add(task.workName);
      }
      if (task.projectName) {
        group.projectNames.add(task.projectName);
      }
      if (task.blockers) {
        task.blockers
          .filter((blocker) => blocker.active)
          .forEach((blocker) => {
            group.blockers.push(`Блокер: ${blocker.reason}`);
          });
      }

      const normalizedDuration = Math.max(1, Math.round(task.durationDays));
      const startDateValue = addDays(baseStart, Math.max(0, Math.round(task.startDay)));
      const endDate = addDays(startDateValue, normalizedDuration - 1);
      const details: string[] = [];
      if (task.role) {
        details.push(`Роль: ${task.role}`);
      }
      if (task.workName) {
        details.push(`Работа: ${task.workName}`);
      }
      if (typeof task.effortDays === 'number') {
        details.push(`Трудозатраты: ${task.effortDays} дн.`);
      }
      if (!task.assignedExpert) {
        details.push('Нужен исполнитель');
      }

      const timelineTask: GanttTimelineTask = {
        id: task.id,
        name: task.name,
        start: startDateValue,
        end: endDate,
        kind: 'project',
        badge: task.projectName ?? 'Проект',
        description: details.join(' · ') || undefined
      };

      group.tasks.push(timelineTask);
      group.totalEffort += task.effortDays ?? 0;

      if (!existing) {
        map.set(key, group);
      }
    });

    const result = Array.from(map.values());

    result.forEach((group) => {
      group.tasks.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    });

    return result.sort((a, b) => {
      if (a.isUnassigned !== b.isUnassigned) {
        return a.isUnassigned ? 1 : -1;
      }
      return a.displayName.localeCompare(b.displayName, 'ru');
    });
  }, [baseStart, tasks]);

  const timelineTasks = useMemo(() => groups.flatMap((group) => group.tasks), [groups]);

  const minTaskStart = useMemo(() => {
    if (timelineTasks.length === 0) {
      return baseStart;
    }
    return timelineTasks.reduce((min, task) => {
      const startDate = startOfDay(toDate(task.start));
      return startDate < min ? startDate : min;
    }, startOfDay(toDate(timelineTasks[0].start)));
  }, [baseStart, timelineTasks]);

  const maxTaskEnd = useMemo(() => {
    if (timelineTasks.length === 0) {
      return baseStart;
    }
    return timelineTasks.reduce((max, task) => {
      const endDate = startOfDay(toDate(task.end));
      return endDate > max ? endDate : max;
    }, startOfDay(toDate(timelineTasks[0].end)));
  }, [baseStart, timelineTasks]);

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
      month: findPeriodContainingDate(periodOptions.month, now)?.value ?? periodOptions.month[0]?.value ?? null,
      year: findPeriodContainingDate(periodOptions.year, now)?.value ?? periodOptions.year[0]?.value ?? null
    };
  });

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

  const currentPeriodOptions = periodOptions[scale.value];
  const selectedPeriodValue = selectedPeriods[scale.value];
  const activePeriod = currentPeriodOptions.find((option) => option.value === selectedPeriodValue) ?? null;
  const displayedPeriod = activePeriod ?? currentPeriodOptions[0] ?? null;
  const resolvedViewRange = displayedPeriod
    ? { start: displayedPeriod.start, end: displayedPeriod.end }
    : undefined;

  const timelineRows = useMemo<GanttTimelineRow[]>(() => {
    return groups.map((group) => {
      const roles = Array.from(group.roles)
        .filter(Boolean)
        .join(', ');
      const works = Array.from(group.workNames)
        .filter(Boolean)
        .join(', ');

      const sidebar = (
        <div className={cardStyles.employeeCell}>
          <div className={cardStyles.employeeMeta}>
            <Badge
              size="xs"
              status={group.isUnassigned ? 'warning' : 'system'}
              label={group.isUnassigned ? 'Не назначено' : 'Назначено'}
            />
            <Text size="s" weight="semibold">
              {group.displayName}
            </Text>
          </div>
          {roles && (
            <Text size="xs" view="secondary">
              {roles}
            </Text>
          )}
          <div className={cardStyles.employeeStats}>
            <div className={cardStyles.employeeStatItem}>
              <Text size="2xs" view="secondary">
                Задачи
              </Text>
              <Text size="xs" weight="semibold">
                {group.tasks.length}
              </Text>
            </div>
            {group.totalEffort > 0 && (
              <div className={cardStyles.employeeStatItem}>
                <Text size="2xs" view="secondary">
                  Трудозатраты
                </Text>
                <Text size="xs" weight="semibold">
                  {group.totalEffort} дн.
                </Text>
              </div>
            )}
          </div>
          {works && (
            <Text size="2xs" view="secondary">
              Работы: {works}
            </Text>
          )}
          {group.projectNames.size > 0 && (
            <Text size="2xs" view="secondary">
              Проекты: {Array.from(group.projectNames).join(', ')}
            </Text>
          )}
          {group.blockers.slice(0, 2).map((blocker) => (
            <Text key={blocker} size="2xs" view="alert">
              {blocker}
            </Text>
          ))}
        </div>
      );

      return { id: group.id, sidebar, tasks: group.tasks };
    });
  }, [groups]);

  const taskCards = useMemo(() => {
    const dateFormatter = new Intl.DateTimeFormat('ru-RU');

    return tasks
      .slice()
      .sort((a, b) => a.startDay - b.startDay)
      .map((task) => {
        const normalizedDuration = Math.max(1, Math.round(task.durationDays));
        const start = addDays(baseStart, Math.max(0, Math.round(task.startDay)));
        const end = addDays(start, normalizedDuration - 1);
        const activeBlockers = (task.blockers ?? []).filter((blocker) => blocker.active);

        return {
          ...task,
          start,
          end,
          activeBlockers,
          dateRangeLabel: `${dateFormatter.format(start)} – ${dateFormatter.format(end)}`
        };
      });
  }, [baseStart, tasks]);

  useEffect(() => {
    setSelectedTaskId((prev) => {
      if (prev && taskCards.some((task) => task.id === prev)) {
        return prev;
      }
      return taskCards[0]?.id ?? null;
    });
  }, [taskCards]);

  const selectedTask = useMemo(() => {
    if (taskCards.length === 0) {
      return null;
    }
    if (selectedTaskId) {
      return taskCards.find((task) => task.id === selectedTaskId) ?? taskCards[0];
    }
    return taskCards[0];
  }, [selectedTaskId, taskCards]);

  if (tasks.length === 0) {
    return (
      <div className={styles.emptyState}>
        <Text size="s" view="secondary">
          План работ пока не заполнен. Добавьте задачи, чтобы увидеть диаграмму Ганта.
        </Text>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerInfo}>
          <Text size="s" weight="semibold">
            План загрузки по инициативе
          </Text>
          <div className={styles.summary}>
            <Text size="xs" view="secondary">
              Исполнители: {groups.length}
            </Text>
            <Text size="xs" view="secondary">
              Задачи: {tasks.length}
            </Text>
          </div>
        </div>
        <div className={styles.headerControls}>
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
      <div className={styles.panel}>
        <Tabs<PanelTab>
          size="s"
          items={panelTabs}
          value={panelView}
          getItemLabel={(item) => item.label}
          getItemKey={(item) => item.value}
          onChange={(item) => item && setPanelView(item)}
        />
        <div className={styles.panelBody}>
          {panelView.value === 'assignments' ? (
            <div className={styles.cardGrid}>
              {groups.map((group) => {
                const roles = Array.from(group.roles)
                  .filter(Boolean)
                  .join(', ');
                const works = Array.from(group.workNames)
                  .filter(Boolean)
                  .join(', ');

                return (
                  <div key={group.id} className={`${cardStyles.card} ${styles.compactCard}`}>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardTitle}>
                        <Text size="s" weight="semibold">
                          {group.displayName}
                        </Text>
                        {roles && (
                          <Text size="2xs" view="secondary">
                            {roles}
                          </Text>
                        )}
                      </div>
                      <Badge
                        size="xs"
                        status={group.isUnassigned ? 'warning' : 'system'}
                        label={group.isUnassigned ? 'Не назначено' : 'Назначено'}
                      />
                    </div>
                    <div className={cardStyles.employeeStats}>
                      <div className={cardStyles.employeeStatItem}>
                        <Text size="2xs" view="secondary">
                          Задачи
                        </Text>
                        <Text size="xs" weight="semibold">
                          {group.tasks.length}
                        </Text>
                      </div>
                      <div className={cardStyles.employeeStatItem}>
                        <Text size="2xs" view="secondary">
                          Трудозатраты
                        </Text>
                        <Text size="xs" weight="semibold">
                          {group.totalEffort || '—'} дн.
                        </Text>
                      </div>
                    </div>
                    {works && (
                      <Text size="2xs" view="secondary">
                        Работы: {works}
                      </Text>
                    )}
                    {group.projectNames.size > 0 && (
                      <Text size="2xs" view="secondary">
                        Проекты: {Array.from(group.projectNames).join(', ')}
                      </Text>
                    )}
                    {group.blockers.length > 0 && (
                      <div className={styles.blockerList}>
                        {group.blockers.map((blocker) => (
                          <Badge key={blocker} size="xs" status="warning" view="filled" label={blocker} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : selectedTask ? (
            <div className={styles.cardGrid}>
              <div className={`${cardStyles.card} ${styles.compactCard}`}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardTitle}>
                    <Text size="s" weight="semibold">
                      {selectedTask.name}
                    </Text>
                    <Text size="2xs" view="secondary">
                      {selectedTask.projectName ?? 'Проект не указан'}
                    </Text>
                  </div>
                  <Badge
                    size="xs"
                    view="filled"
                    status="system"
                    label={selectedTask.role ? `Роль ${selectedTask.role}` : 'Роль не указана'}
                  />
                </div>
                <div className={styles.cardMeta}>
                  {selectedTask.workName && (
                    <Text size="2xs" view="secondary">
                      Работа: {selectedTask.workName}
                    </Text>
                  )}
                  <Text size="2xs" view="secondary">
                    Трудозатраты: {selectedTask.effortDays ?? '—'} дн. · Длительность: {selectedTask.durationDays} дн.
                  </Text>
                  <Text size="2xs" view="secondary">
                    Период: {selectedTask.dateRangeLabel}
                  </Text>
                  {selectedTask.assignedExpert ? (
                    <Text size="2xs" view="secondary">
                      Исполнитель: {selectedTask.assignedExpert}
                    </Text>
                  ) : (
                    <Text size="2xs" view="alert">
                      Исполнитель не назначен
                    </Text>
                  )}
                  {typeof selectedTask.minUnits === 'number' && typeof selectedTask.maxUnits === 'number' && (
                    <Text size="2xs" view="secondary">
                      Нагрузка: {selectedTask.minUnits}–{selectedTask.maxUnits} FTE
                    </Text>
                  )}
                  {selectedTask.constraints && selectedTask.constraints.length > 0 && (
                    <Text size="2xs" view="secondary">
                      Ограничения: {selectedTask.constraints.join(', ')}
                    </Text>
                  )}
                </div>
                {selectedTask.activeBlockers.length > 0 && (
                  <div className={styles.blockerList}>
                    {selectedTask.activeBlockers.map((blocker) => (
                      <Badge
                        key={blocker.id}
                        size="xs"
                        status="warning"
                        view="filled"
                        label={`Блокер: ${blocker.reason}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <Text size="s" view="secondary">
              Выберите задачу на диаграмме, чтобы увидеть описание.
            </Text>
          )}
        </div>
      </div>
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
      <GanttTimeline
        axisLabel="Исполнитель"
        scale={scale.value}
        rows={timelineRows}
        viewRange={resolvedViewRange}
        selectedTaskId={selectedTaskId}
        onTaskClick={({ task }) => {
          setSelectedTaskId(task.id);
          setPanelView(panelTabs[1]);
        }}
      />
    </div>
  );
};

export default InitiativeGanttChart;
