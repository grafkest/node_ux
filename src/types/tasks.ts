export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'new' | 'in-progress' | 'paused' | 'rejected' | 'completed';

export type TaskScheduleType = 'due-date' | 'start-duration' | 'date-range' | 'after-task';

export type TaskSchedule =
  | { type: 'due-date'; dueDate: string }
  | { type: 'start-duration'; startDate: string; durationDays: number }
  | { type: 'date-range'; startDate: string; endDate: string }
  | { type: 'after-task'; predecessorId: string; durationDays: number };

export type TaskRelationType = 'system' | 'initiative' | 'external' | 'methodology';

export type TaskRelation =
  | { type: 'system'; targetId: string | null }
  | { type: 'initiative'; targetId: string | null }
  | { type: 'external' }
  | { type: 'methodology' };

export type TaskListItem = {
  id: string;
  name: string;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeId: string | null;
  description: string;
  schedule: TaskSchedule;
  relation: TaskRelation;
};

export type TaskDraft = {
  name: string;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeId: string | null;
  description: string;
  scheduleType: TaskScheduleType;
  dueDate: string;
  startDate: string;
  endDate: string;
  durationDays: string;
  predecessorId: string | null;
  relationType: TaskRelationType;
  relatedSystemId: string | null;
  relatedInitiativeId: string | null;
};
