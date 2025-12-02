import { Badge } from '@consta/uikit/Badge';
import { Button } from '@consta/uikit/Button';
import { Card } from '@consta/uikit/Card';
import { Select } from '@consta/uikit/Select';
import { Steps } from '@consta/uikit/Steps';
import { Tabs } from '@consta/uikit/Tabs';
import { Text } from '@consta/uikit/Text';
import clsx from 'clsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DomainNode,
  ExpertProfile,
  Initiative,
  InitiativeRisk,
  InitiativeStatus,
  ModuleNode
} from '../data';
import type { TaskListItem } from '../types/tasks';
import InitiativeCreationModal from './InitiativeCreationModal';
import InitiativeGanttChart, {
  type InitiativeGanttBlocker,
  type InitiativeGanttDependency,
  type InitiativeGanttResource,
  type InitiativeGanttTask
} from './InitiativeGanttChart';
import type { InitiativeCreationRequest } from '../types/initiativeCreation';
import { buildCreationRequestFromInitiative } from '../utils/initiativePlanner';
import styles from './InitiativePlanner.module.css';
import { getSkillNameById } from '../data/skills';
import { resolveTaskScheduleWindow, startOfDay } from '../utils/employeeTasks';

type SelectItem<Value extends string> = {
  label: string;
  value: Value;
};

type InitiativePlannerProps = {
  initiatives: Initiative[];
  experts: ExpertProfile[];
  domains: DomainNode[];
  modules: ModuleNode[];
  domainNameMap: Record<string, string>;
  employeeTasks: TaskListItem[];
  onTogglePin: (initiativeId: string, roleId: string, expertId: string) => void;
  onAddRisk: (
    initiativeId: string,
    risk: { description: string; severity: InitiativeRisk['severity'] }
  ) => void;
  onRemoveRisk: (initiativeId: string, riskId: string) => void;
  onStatusChange: (initiativeId: string, status: InitiativeStatus) => void;
  onExport: (initiativeId: string) => void;
  onCreateInitiative: (draft: InitiativeCreationRequest) => Initiative | Promise<Initiative>;
  onUpdateInitiative: (
    initiativeId: string,
    draft: InitiativeCreationRequest
  ) => Initiative | Promise<Initiative>;
};

type CandidateKey = `${string}:${string}`;

type SeverityOption = SelectItem<InitiativeRisk['severity']>;

type StatusStep = SelectItem<InitiativeStatus> & { description: string };

const statusSteps: StatusStep[] = [
  { label: 'Инициирована', value: 'initiated', description: 'Готовим состав и оценку' },
  { label: 'В работе', value: 'in-progress', description: 'Команда подтверждена, ведётся сбор рисков' },
  { label: 'Конвертирована', value: 'converted', description: 'Состав выгружен в модуль' }
];

const statusBadgeMeta: Record<InitiativeStatus, { label: string; view: 'system' | 'warning' | 'success' }>
 = {
  initiated: { label: 'Инициирована', view: 'warning' },
  'in-progress': { label: 'В работе', view: 'system' },
  converted: { label: 'Конвертирована', view: 'success' }
};

const resolveWorkItemTaskName = (taskIds: string[] | undefined, fallback: string): string => {
  if (!taskIds || taskIds.length === 0) {
    return fallback;
  }
  const candidate = taskIds.find((task) => task.trim().length > 0);
  if (!candidate) {
    return fallback;
  }
  const trimmed = candidate.trim();
  return getSkillNameById(trimmed) ?? trimmed;
};

const severityOptions: SeverityOption[] = [
  { label: 'Низкий', value: 'low' },
  { label: 'Средний', value: 'medium' },
  { label: 'Высокий', value: 'high' }
];

const severityBadgeMeta: Record<InitiativeRisk['severity'], { label: string; status: 'success' | 'warning' | 'error' }>
 = {
  low: { label: 'Низкий', status: 'success' },
  medium: { label: 'Средний', status: 'warning' },
  high: { label: 'Высокий', status: 'error' }
};

type TimelineSource = 'initiative' | 'employee';

const timelineSourceTabs: Array<{ label: string; value: TimelineSource }> = [
  { label: 'Инициативы', value: 'initiative' },
  { label: 'Задачи сотрудников', value: 'employee' }
];

const DAY_MS = 1000 * 60 * 60 * 24;

const InitiativePlanner: React.FC<InitiativePlannerProps> = ({
  initiatives,
  experts,
  domains,
  modules,
  domainNameMap,
  employeeTasks,
  onTogglePin,
  onAddRisk,
  onRemoveRisk,
  onStatusChange,
  onExport,
  onCreateInitiative,
  onUpdateInitiative
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(() => initiatives[0]?.id ?? null);
  const [riskDescription, setRiskDescription] = useState('');
  const [riskSeverity, setRiskSeverity] = useState<InitiativeRisk['severity']>('medium');
  const [openCandidates, setOpenCandidates] = useState<Set<CandidateKey>>(new Set());
  const [collapsedRoles, setCollapsedRoles] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [modalTargetId, setModalTargetId] = useState<string | null>(null);
  const [modalInitialDraft, setModalInitialDraft] = useState<InitiativeCreationRequest | null>(null);
  const [isModalSubmitting, setIsModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [timelineSource, setTimelineSource] = useState<TimelineSource>('initiative');
  const lastInitiativeIdRef = useRef<string | null>(null);
  const lastRoleIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedId && initiatives.length > 0) {
      setSelectedId(initiatives[0].id);
    }
  }, [initiatives, selectedId]);

  useEffect(() => {
    setRiskDescription('');
    setRiskSeverity('medium');
    setOpenCandidates(new Set());
  }, [selectedId]);

  const initiativeOptions = useMemo<SelectItem<string>[]>(
    () => initiatives.map((initiative) => ({ label: initiative.name, value: initiative.id })),
    [initiatives]
  );

  const selectValue = useMemo(
    () => initiativeOptions.find((option) => option.value === selectedId) ?? null,
    [initiativeOptions, selectedId]
  );

  const selectedInitiative = useMemo(
    () => initiatives.find((initiative) => initiative.id === selectedId) ?? null,
    [initiatives, selectedId]
  );

  useEffect(() => {
    if (!selectedInitiative) {
      setCollapsedRoles(new Set());
      lastInitiativeIdRef.current = null;
      lastRoleIdsRef.current = new Set();
      return;
    }

    const currentRoleIds = new Set(selectedInitiative.roles.map((role) => role.id));

    setCollapsedRoles((prev) => {
      if (lastInitiativeIdRef.current !== selectedInitiative.id) {
        return new Set(currentRoleIds);
      }

      const next = new Set(Array.from(prev).filter((roleId) => currentRoleIds.has(roleId)));

      selectedInitiative.roles.forEach((role) => {
        if (!lastRoleIdsRef.current.has(role.id)) {
          next.add(role.id);
        }
      });

      return next;
    });

    lastInitiativeIdRef.current = selectedInitiative.id;
    lastRoleIdsRef.current = currentRoleIds;
  }, [selectedInitiative]);

  const expertMap = useMemo(() => {
    const map = new Map<string, ExpertProfile>();
    experts.forEach((expert) => {
      map.set(expert.id, expert);
    });
    return map;
  }, [experts]);

  const timelineBaseStart = useMemo(() => {
    if (selectedInitiative?.startDate) {
      return startOfDay(new Date(selectedInitiative.startDate));
    }
    return startOfDay(new Date());
  }, [selectedInitiative]);

  const employeeTaskMap = useMemo(
    () => new Map(employeeTasks.map((task) => [task.id, task])),
    [employeeTasks]
  );

  const employeeTimelineTasks = useMemo<InitiativeGanttTask[]>(() => {
    if (!selectedInitiative) {
      return [];
    }

    return employeeTasks
      .filter(
        (task) =>
          task.assigneeId &&
          task.relation.type === 'initiative' &&
          task.relation.targetId === selectedInitiative.id
      )
      .map((task) => {
        const window = resolveTaskScheduleWindow(task, employeeTaskMap);
        if (!window) {
          return null;
        }
        const startDay = Math.max(
          0,
          Math.round((window.start.getTime() - timelineBaseStart.getTime()) / DAY_MS)
        );
        const durationDays = Math.max(
          1,
          Math.round((window.end.getTime() - window.start.getTime()) / DAY_MS) + 1
        );
        const expert = task.assigneeId ? expertMap.get(task.assigneeId) : undefined;
        const assigneeName = expert?.fullName ?? task.assigneeId ?? 'Исполнитель не выбран';

        return {
          id: `employee-${task.id}`,
          name: task.name,
          role: expert?.title ?? 'Участник инициативы',
          projectId: selectedInitiative.id,
          projectName: selectedInitiative.name,
          workId: 'employee-task',
          workName: 'Задачи сотрудников',
          startDay,
          durationDays,
          effortDays: durationDays,
          effortHours: durationDays * 8,
          minUnits: 1,
          maxUnits: 1,
          canSplit: false,
          parallelAllowed: true,
          durationMode: 'fixed-effort',
          constraints: undefined,
          priority: 1,
          wipLimitTag: 'employee-tasks',
          assignedExpert: assigneeName,
          resources:
            task.assigneeId && assigneeName
              ? [
                  {
                    id: task.assigneeId,
                    name: assigneeName,
                    role: expert?.title ?? 'Эксперт',
                    units: 1
                  }
                ]
              : [],
          blockers: [],
          scenarioBranch: 'Задачи сотрудников'
        } satisfies InitiativeGanttTask;
      })
      .filter((task): task is InitiativeGanttTask => Boolean(task));
  }, [employeeTaskMap, employeeTasks, expertMap, selectedInitiative, timelineBaseStart]);

  const timelineTasks = useMemo<InitiativeGanttTask[]>(() => {
    if (!selectedInitiative) {
      return [];
    }

    return selectedInitiative.roles.flatMap((role) => {
      const workTasks = (role.workItems ?? []).map((item, index) => {
        const assignedExpertName = item.assignedExpertId
          ? expertMap.get(item.assignedExpertId)?.fullName ?? item.assignedExpertId
          : undefined;
        const taskName = resolveWorkItemTaskName(item.tasks, item.title);
        const resources: InitiativeGanttResource[] = assignedExpertName
          ? [
              {
                id: item.assignedExpertId ?? `${role.id}-${item.id}-resource`,
                name: assignedExpertName,
                role: role.role,
                units: 1
              }
            ]
          : [];
        const blockers: InitiativeGanttBlocker[] = assignedExpertName
          ? []
          : [
              {
                id: `${role.id}-${item.id}-blocker`,
                scope: 'task',
                reason: 'Нет назначенного эксперта',
                active: true
              }
            ];

        const dependencies: InitiativeGanttDependency[] = [];
        if (index > 0) {
          const previous = role.workItems?.[index - 1];
          if (previous) {
            dependencies.push({
              id: `${role.id}-${previous.id}`,
              type: 'FS'
            });
          }
        }

        return {
          id: `${role.id}-${item.id}`,
          name: taskName,
          role: role.role,
          projectId: selectedInitiative.id,
          projectName: selectedInitiative.name,
          workId: role.id,
          workName: role.role,
          startDay: item.startDay,
          durationDays: item.durationDays,
          effortDays: item.effortDays,
          effortHours: item.effortDays * 8,
          minUnits: 1,
          maxUnits: Math.max(1, role.required),
          canSplit: role.required > 1,
          parallelAllowed: role.required > 1,
          durationMode: 'fixed-effort',
          constraints: item.startDay > 0 ? [`SNET D${item.startDay + 1}`] : undefined,
          priority: index + 1,
          wipLimitTag: role.role,
          assignedExpert: assignedExpertName,
          resources,
          dependencies,
          blockers,
          scenarioBranch: 'Базовый план'
        } satisfies InitiativeGanttTask;
      });

      return workTasks;
    });
  }, [expertMap, selectedInitiative]);

  const displayedTimelineTasks = useMemo(
    () => (timelineSource === 'initiative' ? timelineTasks : employeeTimelineTasks),
    [employeeTimelineTasks, timelineSource, timelineTasks]
  );

  const handleOpenCreate = () => {
    setModalMode('create');
    setModalTargetId(null);
    setModalInitialDraft(null);
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleSubmitModal = useCallback(
    async (draft: InitiativeCreationRequest) => {
      try {
        setIsModalSubmitting(true);
        setModalError(null);
        const result = await Promise.resolve(
          modalMode === 'edit'
            ? (() => {
                if (!modalTargetId) {
                  throw new Error('Не выбрана инициатива для редактирования.');
                }
                return onUpdateInitiative(modalTargetId, draft);
              })()
            : onCreateInitiative(draft)
        );
        setIsModalOpen(false);
        setModalInitialDraft(null);
        setModalTargetId(null);
        setModalMode('create');
        setSelectedId(result.id);
      } catch (error) {
        const fallbackMessage =
          modalMode === 'edit'
            ? 'Не удалось обновить инициативу. Попробуйте ещё раз.'
            : 'Не удалось создать инициативу. Попробуйте ещё раз.';
        const message = error instanceof Error ? error.message : fallbackMessage;
        setModalError(message);
      } finally {
        setIsModalSubmitting(false);
      }
    },
    [modalMode, modalTargetId, onCreateInitiative, onUpdateInitiative]
  );

  const handleToggleCandidateDetails = (candidateId: CandidateKey) => {
    setOpenCandidates((prev) => {
      const next = new Set(prev);
      if (next.has(candidateId)) {
        next.delete(candidateId);
      } else {
        next.add(candidateId);
      }
      return next;
    });
  };

  const handleToggleRoleCollapse = (roleId: string) => {
    setCollapsedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        next.add(roleId);
      }
      return next;
    });
  };

  const modal = (
    <InitiativeCreationModal
      isOpen={isModalOpen}
      experts={experts}
      domains={domains}
      modules={modules}
      domainNameMap={domainNameMap}
      onClose={() => {
        setIsModalOpen(false);
        setModalError(null);
        setModalInitialDraft(null);
        setModalTargetId(null);
        setModalMode('create');
      }}
      onSubmit={handleSubmitModal}
      isSubmitting={isModalSubmitting}
      errorMessage={modalError}
      mode={modalMode}
      initialDraft={modalInitialDraft}
    />
  );

  if (!selectedInitiative) {
    return (
      <section className={styles.container} aria-label="Инициативы">
        <div className={styles.emptyState}>
          <Card className={styles.emptyCard} verticalSpace="2xl" horizontalSpace="2xl">
            <div>
              <Text size="2xl" weight="bold">
                Пока нет инициатив для планирования
              </Text>
              <Text size="s" view="secondary">
                Создайте первую инициативу, чтобы сформировать команду и увидеть дорожку планирования работ.
              </Text>
            </div>
            <div className={styles.emptyActions}>
              <Button size="m" view="primary" label="Создать инициативу" onClick={handleOpenCreate} />
            </div>
            <div className={styles.emptyHints}>
              <div className={styles.emptyHintItem}>
                <Badge size="xs" view="stroked" label="1" />
                <Text size="xs" view="secondary">
                  Добавьте краткое описание и владельца — так участникам будет проще понять контекст.
                </Text>
              </div>
              <div className={styles.emptyHintItem}>
                <Badge size="xs" view="stroked" label="2" />
                <Text size="xs" view="secondary">
                  Укажите домены и требуемые роли, чтобы подобрать подходящих экспертов.
                </Text>
              </div>
              <div className={styles.emptyHintItem}>
                <Badge size="xs" view="stroked" label="3" />
                <Text size="xs" view="secondary">
                  Заполните работы по ролям — после этого появится диаграмма с дорожкой реализации.
                </Text>
              </div>
            </div>
          </Card>
        </div>
        {modal}
      </section>
    );
  }

  const activeTimelineTab =
    timelineSourceTabs.find((tab) => tab.value === timelineSource) ?? timelineSourceTabs[0];
  const timelineEmptyText =
    timelineSource === 'employee'
      ? 'Назначьте задачи сотрудникам во вкладке «Задачи» или выберите исполнителя.'
      : 'Диаграмма появится после добавления работ по ролям.';

  const handleOpenEdit = () => {
    if (!selectedInitiative) {
      return;
    }
    setModalMode('edit');
    setModalTargetId(selectedInitiative.id);
    setModalInitialDraft(buildCreationRequestFromInitiative(selectedInitiative));
    setModalError(null);
    setIsModalOpen(true);
  };

  const domainLabels = selectedInitiative.domains.map(
    (domainId) => domainNameMap[domainId] ?? domainId
  );

  const statusIndex = statusSteps.findIndex((step) => step.value === selectedInitiative.status);
  const activeStatus = statusBadgeMeta[selectedInitiative.status];

  const severitySelectValue = severityOptions.find((option) => option.value === riskSeverity) ?? null;

  const handleAddRisk = () => {
    onAddRisk(selectedInitiative.id, { description: riskDescription, severity: riskSeverity });
    setRiskDescription('');
  };

  const renderRoleCard = (role: Initiative['roles'][number]) => {
    const pinnedSet = new Set(role.pinnedExpertIds);
    const sortedCandidates = [...role.candidates].sort((a, b) => b.score - a.score);
    const isCollapsed = collapsedRoles.has(role.id);
    const candidateListId = `${role.id}-candidates`;

    return (
      <Card
        key={role.id}
        className={clsx(styles.roleCard, isCollapsed && styles.roleCardCollapsed)}
        verticalSpace="xl"
        horizontalSpace="xl"
        data-collapsed={isCollapsed}
      >
        <div className={styles.roleHeader}>
          <div className={styles.roleInfo}>
            <Text size="s" weight="semibold">
              {role.role}
            </Text>
            <Text size="xs" view="secondary">
              Требуется: {role.required} · Закреплено: {role.pinnedExpertIds.length}
            </Text>
          </div>
          <div className={styles.roleActions}>
            {pinnedSet.size > 0 && <Badge size="s" status="success" label="Есть закрепления" />}
            <Button
              size="xs"
              view="ghost"
              label={isCollapsed ? 'Развернуть' : 'Свернуть'}
              onClick={() => handleToggleRoleCollapse(role.id)}
              aria-expanded={!isCollapsed}
              aria-controls={candidateListId}
            />
          </div>
        </div>
        {!isCollapsed && (
          <div className={styles.candidateList} id={candidateListId}>
            {sortedCandidates.map((candidate) => {
              const candidateKey: CandidateKey = `${role.id}:${candidate.expertId}`;
              const expert = expertMap.get(candidate.expertId);
              const isPinned = pinnedSet.has(candidate.expertId);
              const isOpen = openCandidates.has(candidateKey);
              const scoreLabel = `${Math.round(candidate.score)} баллов`;

              return (
                <div
                  key={candidateKey}
                  className={clsx(styles.candidateCard, isPinned && styles.candidatePinned)}
                >
                <div className={styles.candidateHeader}>
                  <div className={styles.candidateTitle}>
                    <Text size="s" weight="semibold">
                      {expert?.fullName ?? candidate.expertId}
                    </Text>
                    <Text size="xs" view="secondary">
                      {expert?.title ?? 'Эксперт не найден в каталоге'}
                    </Text>
                  </div>
                  <div className={styles.candidateActions}>
                    <Badge size="s" view="filled" status="system" label={scoreLabel} />
                    {isPinned && <Badge size="s" status="success" label="Закреплён" />}
                    <Button
                      size="xs"
                      view="ghost"
                      label={isOpen ? 'Скрыть детали' : 'Показать детали'}
                      onClick={() => handleToggleCandidateDetails(candidateKey)}
                    />
                    <Button
                      size="xs"
                      view={isPinned ? 'secondary' : 'primary'}
                      label={isPinned ? 'Открепить' : 'Закрепить'}
                      onClick={() => onTogglePin(selectedInitiative.id, role.id, candidate.expertId)}
                    />
                  </div>
                </div>
                {isOpen && (
                  <div className={styles.candidateDetails}>
                    <Text size="xs" view="secondary" className={styles.candidateComment}>
                      {candidate.fitComment}
                    </Text>
                    <div className={styles.scoreDetails}>
                      {candidate.scoreDetails.map((detail) => (
                        <div key={`${candidateKey}-${detail.criterion}`} className={styles.scoreRow}>
                          <Text size="xs" weight="semibold">
                            {detail.criterion}
                          </Text>
                          <Text size="xs" view="secondary">
                            {(detail.value * 100).toFixed(0)}% · вклад {(detail.weight * 100).toFixed(0)}%
                          </Text>
                          {detail.comment && (
                            <Text size="xs" view="secondary">
                              {detail.comment}
                            </Text>
                          )}
                        </div>
                      ))}
                    </div>
                    {candidate.riskTags.length > 0 && (
                      <div className={styles.riskTagList}>
                        {candidate.riskTags.map((tag) => (
                          <Badge
                            key={`${candidateKey}-${tag}`}
                            size="xs"
                            view="stroked"
                            label={tag}
                            className={styles.riskTag}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
            })}
          </div>
        )}
      </Card>
    );
  };

  return (
    <section className={styles.container} aria-label="Планирование инициатив">
      <header className={styles.header}>
        <div className={styles.headerInfo}>
          <Text size="xl" weight="bold">
            {selectedInitiative.name}
          </Text>
          <Text size="s" view="secondary" className={styles.headerDescription}>
            {selectedInitiative.description}
          </Text>
          <div className={styles.metaRow}>
            <div className={styles.metaItem}>
              <Text size="xs" view="secondary">Владелец</Text>
              <Text size="s" weight="semibold">{selectedInitiative.owner}</Text>
            </div>
            <div className={styles.metaItem}>
              <Text size="xs" view="secondary">Домены</Text>
              <Text size="s" weight="semibold">{domainLabels.join(', ') || '—'}</Text>
            </div>
            <div className={styles.metaItem}>
              <Text size="xs" view="secondary">Обновлено</Text>
              <Text size="s" weight="semibold">{new Date(selectedInitiative.lastUpdated).toLocaleString('ru-RU')}</Text>
            </div>
          </div>
        </div>
        <div className={styles.headerControls}>
          <Button size="s" view="secondary" label="Создать инициативу" onClick={handleOpenCreate} />
          <Button
            size="s"
            view="secondary"
            label="Редактировать инициативу"
            onClick={handleOpenEdit}
            disabled={!selectedInitiative}
          />
          <Select<SelectItem<string>>
            size="s"
            items={initiativeOptions}
            value={selectValue}
            onChange={(option) => option && setSelectedId(option.value)}
            getItemLabel={(item) => item.label}
            getItemKey={(item) => item.value}
          />
          <Button
            size="s"
            view="primary"
            label="Экспортировать в модуль"
            onClick={() => onExport(selectedInitiative.id)}
          />
        </div>
      </header>
      <div className={styles.statusSection}>
        <div className={styles.statusHeadline}>
          <Badge size="s" status={activeStatus.view} label={activeStatus.label} />
          <Text size="xs" view="secondary">
            {statusSteps[statusIndex]?.description ?? ''}
          </Text>
        </div>
        <Steps
          size="s"
          items={statusSteps}
          value={statusSteps[Math.max(0, statusIndex)]}
          getItemLabel={(item) => item.label}
          getItemKey={(item) => item.value}
          onChange={(step) => onStatusChange(selectedInitiative.id, step.value)}
        />
      </div>
      <div className={styles.contentGrid}>
        <section className={styles.rolesSection} aria-label="Роли и кандидаты">
          {selectedInitiative.customer && (
            <Card className={styles.customerCard} verticalSpace="xl" horizontalSpace="xl">
              <Text size="s" weight="semibold">
                Параметры заказчика
              </Text>
              <div className={styles.customerGrid}>
                <div>
                  <Text size="xs" view="secondary">
                    Компания
                  </Text>
                  <Text size="s">
                    {selectedInitiative.customer.companies.length > 0
                      ? selectedInitiative.customer.companies.join(', ')
                      : '—'}
                  </Text>
                </div>
                <div>
                  <Text size="xs" view="secondary">
                    Подразделение
                  </Text>
                  <Text size="s">
                    {selectedInitiative.customer.units.length > 0
                      ? selectedInitiative.customer.units.join(', ')
                      : '—'}
                  </Text>
                </div>
                <div>
                  <Text size="xs" view="secondary">
                    Контактное лицо
                  </Text>
                  <Text size="s">{selectedInitiative.customer.representative || '—'}</Text>
                </div>
                <div>
                  <Text size="xs" view="secondary">
                    Контакты
                  </Text>
                  <Text size="s">{selectedInitiative.customer.contact || '—'}</Text>
                </div>
              </div>
              {selectedInitiative.customer.comment && (
                <Text size="xs" view="secondary" className={styles.customerComment}>
                  {selectedInitiative.customer.comment}
                </Text>
              )}
            </Card>
          )}
          {selectedInitiative.roles.map((role) => renderRoleCard(role))}
        </section>
        <div className={styles.sideColumn}>
          <Card className={styles.timelineCard} verticalSpace="xl" horizontalSpace="xl">
            <div className={styles.timelineHeader}>
              <Text size="s" weight="semibold">
                План работ
              </Text>
              <Text size="xs" view="secondary">
                {displayedTimelineTasks.length > 0
                  ? `Задач в расписании: ${displayedTimelineTasks.length}`
                  : timelineEmptyText}
              </Text>
            </div>
            <Tabs
              size="s"
              items={timelineSourceTabs}
              value={activeTimelineTab}
              getItemKey={(item) => item.value}
              getItemLabel={(item) => item.label}
              onChange={(item) => item && setTimelineSource(item.value)}
            />
            <div className={styles.timelineBody}>
              <InitiativeGanttChart
                tasks={displayedTimelineTasks}
                startDate={selectedInitiative.startDate}
              />
            </div>
          </Card>
          <aside className={styles.riskSection} aria-label="Риски инициативы">
            <Card verticalSpace="xl" horizontalSpace="xl" className={styles.riskCard}>
              <Text size="s" weight="semibold">
                Риски
              </Text>
              {selectedInitiative.risks.length === 0 ? (
                <Text size="xs" view="secondary">
                  Риски не зафиксированы.
                </Text>
              ) : (
                <ul className={styles.riskList}>
                  {selectedInitiative.risks.map((risk) => {
                    const meta = severityBadgeMeta[risk.severity];
                    return (
                      <li key={risk.id} className={styles.riskItem}>
                        <div className={styles.riskHeader}>
                          <Badge size="xs" status={meta.status} label={meta.label} />
                          <Text size="xs" view="secondary">
                            {new Date(risk.createdAt).toLocaleString('ru-RU')}
                          </Text>
                        </div>
                        <Text size="xs">{risk.description}</Text>
                        <Button
                          size="xs"
                          view="ghost"
                          label="Удалить"
                          onClick={() => onRemoveRisk(selectedInitiative.id, risk.id)}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className={styles.riskForm}>
                <Select<SeverityOption>
                  size="s"
                  items={severityOptions}
                  value={severitySelectValue}
                  getItemKey={(item) => item.value}
                  getItemLabel={(item) => item.label}
                  onChange={(option) => option && setRiskSeverity(option.value)}
                />
                <textarea
                  className={styles.riskTextarea}
                  rows={3}
                  placeholder="Опишите риск или блокирующий фактор"
                  value={riskDescription}
                  onChange={(event) => setRiskDescription(event.target.value)}
                />
                <Button
                  size="s"
                  view="secondary"
                  label="Зафиксировать риск"
                  disabled={riskDescription.trim().length === 0}
                  onClick={handleAddRisk}
                />
              </div>
            </Card>
          </aside>
        </div>
      </div>
      {modal}
    </section>
  );
};

export default InitiativePlanner;
