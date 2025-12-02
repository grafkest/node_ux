import { Text } from '@consta/uikit/Text';
import React, { useMemo } from 'react';
import timelineStyles from './GanttTimeline.module.css';

export type GanttTimelineTaskKind = 'project' | 'out-of-project' | 'training';

export type GanttTimelineTask = {
  id: string;
  name: string;
  start: Date | string;
  end: Date | string;
  kind: GanttTimelineTaskKind;
  badge: string;
  description?: string;
};

export type GanttTimelineRow = {
  id: string;
  sidebar: React.ReactNode;
  tasks: GanttTimelineTask[];
};

export const timelineScaleTabs = [
  { label: 'Неделя', value: 'week' },
  { label: 'Месяц', value: 'month' },
  { label: 'Год', value: 'year' }
] as const;

export type TimelineScale = (typeof timelineScaleTabs)[number]['value'];
export type TimelineScaleTab = (typeof timelineScaleTabs)[number];

const MS_IN_DAY = 24 * 60 * 60 * 1000;

const dayFormatter = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'short',
  day: '2-digit',
  month: 'short'
});

const periodFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short'
});

const monthFormatter = new Intl.DateTimeFormat('ru-RU', {
  month: 'short',
  year: 'numeric'
});

const kindPriority: GanttTimelineTaskKind[] = ['project', 'out-of-project', 'training'];

const TIMELINE_INSET = 12;
const LANE_HEIGHT = 72;

const capitalize = (value: string): string => {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const startOfDay = (input: Date): Date => {
  const result = new Date(input);
  result.setHours(0, 0, 0, 0);
  return result;
};

const startOfWeek = (input: Date): Date => {
  const date = startOfDay(input);
  const day = date.getDay();
  const diff = (day + 6) % 7; // Monday as first day
  date.setDate(date.getDate() - diff);
  return date;
};

const startOfMonth = (input: Date): Date => new Date(input.getFullYear(), input.getMonth(), 1);

const addDays = (input: Date, amount: number): Date => {
  const result = new Date(input);
  result.setDate(result.getDate() + amount);
  return result;
};

const addMonths = (input: Date, amount: number): Date => {
  const result = new Date(input);
  result.setMonth(result.getMonth() + amount);
  return result;
};

type TimelineSegment = {
  start: Date;
  end: Date;
  label: string;
};

type NormalizedTask = {
  id: string;
  kind: GanttTimelineTaskKind;
  startTime: number;
  endTime: number;
};

type NormalizedRow = {
  id: string;
  sidebar: React.ReactNode;
  tasks: (NormalizedTask & { original: GanttTimelineTask })[];
};

type LaneGroupLayout = {
  offset: number;
  slotCount: number;
};

type TaskLanePlacement = {
  laneOffset: number;
  slotIndex: number;
};

type LaneLayout = {
  assignments: Map<string, TaskLanePlacement>;
  laneCount: number;
  groups: Record<GanttTimelineTaskKind, LaneGroupLayout>;
};

const formatPeriod = (start: Date, end: Date): string => {
  const startLabel = periodFormatter.format(start);
  const endLabel = periodFormatter.format(end);
  if (startLabel === endLabel) {
    return capitalize(startLabel);
  }
  return `${capitalize(startLabel)} – ${capitalize(endLabel)}`;
};

const toDate = (value: Date | string): Date => {
  if (value instanceof Date) {
    return value;
  }
  return new Date(value);
};

const ensurePositiveDuration = (start: number, end: number): number => {
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return MS_IN_DAY;
  }
  const diff = end - start;
  return diff > 0 ? diff : MS_IN_DAY;
};

const buildLaneLayout = (tasks: NormalizedTask[]): LaneLayout => {
  const assignments = new Map<string, TaskLanePlacement>();
  const groups = Object.fromEntries(
    kindPriority.map((kind) => [kind, { offset: 0, slotCount: 1 } satisfies LaneGroupLayout])
  ) as Record<GanttTimelineTaskKind, LaneGroupLayout>;
  let laneOffset = 0;

  kindPriority.forEach((kind) => {
    const kindTasks = tasks.filter((task) => task.kind === kind);
    const slotAssignments = new Map<string, number>();
    const active: { id: string; endTime: number; slotIndex: number }[] = [];
    const availableSlots: number[] = [];

    const sorted = kindTasks.slice().sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);
    let slotCount = 1;

    sorted.forEach((task) => {
      // release slots that have ended
      for (let index = active.length - 1; index >= 0; index -= 1) {
        if (active[index].endTime <= task.startTime) {
          availableSlots.push(active[index].slotIndex);
          active.splice(index, 1);
        }
      }

      let slotIndex: number;
      if (availableSlots.length > 0) {
        availableSlots.sort((a, b) => a - b);
        slotIndex = availableSlots.shift() as number;
      } else {
        slotIndex = active.length;
      }

      slotAssignments.set(task.id, slotIndex);
      active.push({ id: task.id, endTime: task.endTime, slotIndex });
      slotCount = Math.max(slotCount, active.length);
    });

    const groupSlotCount = Math.max(slotCount, 1);
    groups[kind] = { offset: laneOffset, slotCount: groupSlotCount };

    kindTasks.forEach((task) => {
      const slotIndex = slotAssignments.get(task.id) ?? 0;
      assignments.set(task.id, { laneOffset, slotIndex });
    });

    laneOffset += groupSlotCount;
  });

  const laneCount = Math.max(laneOffset, kindPriority.length);

  return { assignments, laneCount, groups };
};

const computeViewRange = (allTasks: NormalizedTask[], scale: TimelineScale): { viewStart: Date; viewEnd: Date } => {
  if (allTasks.length === 0) {
    const today = startOfWeek(startOfDay(new Date()));
    switch (scale) {
      case 'year': {
        const viewStart = startOfMonth(addMonths(today, -11));
        const viewEnd = addMonths(startOfMonth(today), 1);
        return { viewStart, viewEnd };
      }
      case 'month': {
        const viewStart = startOfWeek(addMonths(today, -1));
        const viewEnd = addDays(viewStart, 14 * 4);
        return { viewStart, viewEnd };
      }
      default: {
        const viewStart = startOfWeek(addDays(today, -7));
        const viewEnd = addDays(viewStart, 14);
        return { viewStart, viewEnd };
      }
    }
  }

  const maxEnd = allTasks.reduce((max, task) => Math.max(max, task.endTime), -Infinity);
  const maxEndDate = startOfDay(new Date(maxEnd));

  switch (scale) {
    case 'year': {
      const lastMonthStart = startOfMonth(maxEndDate);
      const viewStart = startOfMonth(addMonths(lastMonthStart, -11));
      const viewEnd = addMonths(lastMonthStart, 1);
      return { viewStart, viewEnd };
    }
    case 'month': {
      const lastMonthStart = startOfMonth(maxEndDate);
      const viewStart = startOfWeek(addMonths(lastMonthStart, -1));
      const viewEnd = addDays(viewStart, 7 * 8);
      return { viewStart, viewEnd };
    }
    default: {
      const lastWeekStart = startOfWeek(maxEndDate);
      const viewStart = addDays(lastWeekStart, -7);
      const viewEnd = addDays(viewStart, 14);
      return { viewStart, viewEnd };
    }
  }
};

const buildSegments = (viewStart: Date, viewEnd: Date, scale: TimelineScale): TimelineSegment[] => {
  const segments: TimelineSegment[] = [];
  switch (scale) {
    case 'year': {
      let cursor = startOfMonth(viewStart);
      while (cursor < viewEnd) {
        const next = startOfMonth(addMonths(cursor, 1));
        segments.push({
          start: cursor,
          end: next,
          label: capitalize(monthFormatter.format(cursor))
        });
        cursor = next;
      }
      break;
    }
    case 'month': {
      let cursor = startOfWeek(viewStart);
      while (cursor < viewEnd) {
        const next = addDays(cursor, 7);
        const segmentEnd = next < viewEnd ? addDays(next, -1) : addDays(viewEnd, -1);
        segments.push({
          start: cursor,
          end: next,
          label: formatPeriod(cursor, segmentEnd)
        });
        cursor = next;
      }
      break;
    }
    default: {
      let cursor = startOfDay(viewStart);
      while (cursor < viewEnd) {
        const next = addDays(cursor, 1);
        segments.push({
          start: cursor,
          end: next,
          label: capitalize(dayFormatter.format(cursor))
        });
        cursor = next;
      }
      break;
    }
  }
  return segments;
};

type GanttTimelineProps = {
  axisLabel: string;
  rows: GanttTimelineRow[];
  scale: TimelineScale;
  viewRange?: { start: Date | string; end: Date | string };
  onTaskClick?: (payload: { rowId: string; task: GanttTimelineTask }) => void;
  selectedTaskId?: string | null;
};

const GanttTimeline: React.FC<GanttTimelineProps> = ({
  axisLabel,
  rows,
  scale,
  viewRange,
  onTaskClick,
  selectedTaskId
}) => {
  const normalizedRows = useMemo<NormalizedRow[]>(() => {
    return rows.map((row) => {
      const normalizedTasks = row.tasks.map((task) => {
        const startDate = startOfDay(toDate(task.start));
        const endDate = startOfDay(addDays(toDate(task.end), 1));
        const startTime = startDate.getTime();
        const duration = ensurePositiveDuration(startTime, endDate.getTime());
        return {
          original: task,
          id: task.id,
          kind: task.kind,
          startTime,
          endTime: startTime + duration
        } satisfies NormalizedTask & { original: GanttTimelineTask };
      });

      return {
        id: row.id,
        sidebar: row.sidebar,
        tasks: normalizedTasks
      };
    });
  }, [rows]);

  const allTasks = useMemo(
    () =>
      normalizedRows.flatMap((row) =>
        row.tasks.map((task) => ({ id: task.id, kind: task.kind, startTime: task.startTime, endTime: task.endTime }))
      ),
    [normalizedRows]
  );

  const explicitRange = useMemo(() => {
    if (!viewRange) {
      return null;
    }
    const start = startOfDay(toDate(viewRange.start));
    const end = startOfDay(toDate(viewRange.end));
    if (end <= start) {
      return { viewStart: start, viewEnd: addDays(start, 1) };
    }
    return { viewStart: start, viewEnd: end };
  }, [viewRange]);

  const { viewStart, viewEnd } = useMemo(() => {
    if (explicitRange) {
      return explicitRange;
    }
    return computeViewRange(allTasks, scale);
  }, [allTasks, explicitRange, scale]);
  const viewStartTime = viewStart.getTime();
  const viewEndTime = viewEnd.getTime();
  const totalDurationMs = Math.max(viewEndTime - viewStartTime, MS_IN_DAY);
  const totalDurationDays = totalDurationMs / MS_IN_DAY;
  const segments = useMemo(() => buildSegments(viewStart, viewEnd, scale), [viewEnd, viewStart, scale]);
  const targetTotalUnits = scale === 'year' ? segments.length : 12;
  const timelineUnitScale = totalDurationDays > 0 ? targetTotalUnits / totalDurationDays : 1;
  const scaledTimelineDuration = Math.max(totalDurationDays * timelineUnitScale, 1);
  const gridTemplateColumns = useMemo(() => {
    if (segments.length === 0) {
      return undefined;
    }
    return segments
      .map((segment) => {
        const durationInDays = Math.max(
          1 / 24,
          (segment.end.getTime() - segment.start.getTime()) / MS_IN_DAY
        );
        return `${durationInDays * timelineUnitScale}fr`;
      })
      .join(' ');
  }, [segments, timelineUnitScale]);

  const today = startOfDay(new Date());
  const todayOffset = today.getTime() >= viewStartTime && today.getTime() <= viewEndTime
    ? ((
        (Math.min(today.getTime(), viewEndTime) - viewStartTime) / MS_IN_DAY
      ) * timelineUnitScale)
        /
        scaledTimelineDuration *
        100
    : null;

  return (
    <div className={timelineStyles.timeline}>
      <div className={timelineStyles.axisRow}>
        <div className={timelineStyles.axisHeaderCell}>
          <Text size="xs" view="secondary">
            {axisLabel}
          </Text>
        </div>
        <div
          className={timelineStyles.axis}
          style={gridTemplateColumns ? { gridTemplateColumns } : undefined}
        >
          {todayOffset !== null && (
            <div
              className={timelineStyles.todayIndicator}
              style={{ left: `${todayOffset}%` }}
              aria-hidden={true}
            />
          )}
          {segments.map((segment) => (
            <div key={`${segment.label}-${segment.start.getTime()}`} className={timelineStyles.axisCell}>
              <Text size="2xs" view="secondary">
                {segment.label}
              </Text>
            </div>
          ))}
        </div>
      </div>
      <div className={timelineStyles.rows}>
        {normalizedRows.map((row) => {
          const laneLayout = buildLaneLayout(
            row.tasks.map((task) => ({ id: task.id, kind: task.kind, startTime: task.startTime, endTime: task.endTime }))
          );
          const minHeight = TIMELINE_INSET * 2 + laneLayout.laneCount * LANE_HEIGHT;

          return (
            <div key={row.id} className={timelineStyles.row}>
              {row.sidebar}
              <div
                className={timelineStyles.timelineCell}
                style={{
                  minHeight,
                  ['--lane-height' as string]: `${LANE_HEIGHT}px`
                }}
              >
                <div className={timelineStyles.timelineLane}>
                  {kindPriority.map((kind) => {
                    const group = laneLayout.groups[kind];
                    return (
                      <div
                        key={`${row.id}-${kind}`}
                        className={timelineStyles.laneSection}
                        data-kind={kind}
                        style={{ height: `${group.slotCount * LANE_HEIGHT}px` }}
                      />
                    );
                  })}
                </div>
                {todayOffset !== null && (
                  <div
                    className={timelineStyles.timelineTodayIndicator}
                    style={{ left: `${todayOffset}%` }}
                    aria-hidden={true}
                  />
                )}
                {row.tasks.map((task) => {
                  const placement = laneLayout.assignments.get(task.id);
                  const laneOffset = placement?.laneOffset ?? 0;
                  const slotIndex = placement?.slotIndex ?? 0;
                  const clampedStart = Math.max(task.startTime, viewStartTime);
                  const clampedEnd = Math.min(task.endTime, viewEndTime);
                  if (clampedEnd <= viewStartTime || clampedStart >= viewEndTime) {
                    return null;
                  }
                  const offsetUnits = ((clampedStart - viewStartTime) / MS_IN_DAY) * timelineUnitScale;
                  const endUnits = ((clampedEnd - viewStartTime) / MS_IN_DAY) * timelineUnitScale;
                  const segmentUnits = Math.max(endUnits - offsetUnits, 0);
                  const offset = (offsetUnits / scaledTimelineDuration) * 100;
                  const width = Math.max((segmentUnits / scaledTimelineDuration) * 100, 2);
                  const slotOffset = offset;
                  const slotWidth = width;
                  const top = TIMELINE_INSET + (laneOffset + slotIndex) * LANE_HEIGHT;
                  const startDate = new Date(task.startTime);
                  const endDate = new Date(task.endTime - MS_IN_DAY);
                  const periodLabel = formatPeriod(startDate, endDate);
                  const isSelected = selectedTaskId === task.id;
                  const isInteractive = typeof onTaskClick === 'function';

                  return (
                    <div
                      key={task.id}
                      className={timelineStyles.task}
                      data-kind={task.kind}
                      data-selected={isSelected ? 'true' : 'false'}
                      data-clickable={isInteractive ? 'true' : 'false'}
                      style={{ left: `${slotOffset}%`, width: `${slotWidth}%`, top }}
                      role={isInteractive ? 'button' : undefined}
                      tabIndex={isInteractive ? 0 : undefined}
                      onClick={
                        isInteractive
                          ? () => {
                              onTaskClick?.({ rowId: row.id, task: task.original });
                            }
                          : undefined
                      }
                      onKeyDown={
                        isInteractive
                          ? (event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                onTaskClick?.({ rowId: row.id, task: task.original });
                              }
                            }
                          : undefined
                      }
                    >
                      <div className={timelineStyles.taskHeader}>
                        <Text size="xs" weight="semibold" className={timelineStyles.taskName} truncate>
                          {task.original.name}
                        </Text>
                        <Text size="2xs" view="secondary" className={timelineStyles.taskPeriod}>
                          {periodLabel}
                        </Text>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GanttTimeline;
