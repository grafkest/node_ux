import type { TaskListItem } from '../types/tasks';

export const initialEmployeeTasks: TaskListItem[] = [
  {
    id: 'employee-task-digital-pad-data',
    name: 'Подготовка исходных данных для цифровой площадки',
    priority: 'medium',
    status: 'in-progress',
    assigneeId: 'expert-viktoria-berezhnaya',
    description:
      'Согласовать перечень источников, очистить справочники и выстроить поток данных в INFRAPLAN.',
    schedule: { type: 'start-duration', startDate: '2024-12-02', durationDays: 14 },
    relation: { type: 'initiative', targetId: 'initiative-digital-pad' }
  },
  {
    id: 'employee-task-remote-ops-alerting',
    name: 'Настройка алертов для дистанционного управления',
    priority: 'medium',
    status: 'new',
    assigneeId: 'expert-anton-vlasov',
    description:
      'Определить критичные события, согласовать пороги с диспетчерами и подготовить план тестирования.',
    schedule: { type: 'due-date', dueDate: '2025-01-15' },
    relation: { type: 'initiative', targetId: 'initiative-remote-operations' }
  },
  {
    id: 'employee-task-dtwin-pipeline',
    name: 'Проектирование пайплайна телеметрии',
    priority: 'high',
    status: 'in-progress',
    assigneeId: 'expert-raisa-chistyakova',
    description:
      'Подготовить отказоустойчивый маршрут доставки телеметрии, включить ретрай и контроль качества.',
    schedule: { type: 'date-range', startDate: '2024-11-18', endDate: '2024-12-20' },
    relation: { type: 'initiative', targetId: 'initiative-dtwin-remote' }
  },
  {
    id: 'employee-task-economics-method',
    name: 'Методология расчёта экономики',
    priority: 'low',
    status: 'paused',
    assigneeId: 'expert-pavel-kolosov',
    description:
      'Согласовать допущения для оценки сделок M&A и подготовить шаблон отчёта.',
    schedule: { type: 'start-duration', startDate: '2024-12-09', durationDays: 10 },
    relation: { type: 'initiative', targetId: 'initiative-infraplan-economics' }
  },
  {
    id: 'employee-task-dtwin-guides',
    name: 'Документация сценариев реагирования',
    priority: 'medium',
    status: 'new',
    assigneeId: null,
    description:
      'Описать порядок действий операторов при срабатывании моделей отклонений и согласовать с охраной труда.',
    schedule: { type: 'due-date', dueDate: '2024-12-27' },
    relation: { type: 'initiative', targetId: 'initiative-dtwin-remote' }
  }
];
