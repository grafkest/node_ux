import { Badge } from '@consta/uikit/Badge';
import { Button } from '@consta/uikit/Button';
import { Collapse } from '@consta/uikit/Collapse';
import { Tag } from '@consta/uikit/Tag';
import { Text } from '@consta/uikit/Text';
import React, { useEffect, useMemo, useState } from 'react';
import {
  type ExpertProfile,
  type InitiativeApprovalStatus,
  type InitiativeWorkItemStatus,
  type ModuleInput,
  type ModuleOutput,
  type TeamMember
} from '../../data';
import type { GraphNode } from './GraphView';
import styles from './NodeDetails.module.css';

type NodeDetailsProps = {
  node: GraphNode | null;
  onClose: () => void;
  onNavigate: (nodeId: string) => void;
  moduleNameMap: Record<string, string>;
  artifactNameMap: Record<string, string>;
  domainNameMap: Record<string, string>;
  expertProfiles: ExpertProfile[];
};

const statusBadgeView: Record<string, 'success' | 'warning' | 'alert' | 'normal'> = {
  production: 'success',
  'in-dev': 'warning',
  deprecated: 'alert'
};

type SectionId = 'general' | 'calculation' | 'technical' | 'nonFunctional';

const defaultSectionState: Record<SectionId, boolean> = {
  general: true,
  calculation: false,
  technical: false,
  nonFunctional: false
};

const clientTypeLabels: Record<'desktop' | 'web', string> = {
  desktop: 'Desktop-приложение',
  web: 'Web-интерфейс'
};

const deploymentToolLabels: Record<'docker' | 'kubernetes', string> = {
  docker: 'Docker',
  kubernetes: 'Kubernetes'
};

const workItemStatusMeta: Record<
  InitiativeWorkItemStatus,
  { label: string; badge: 'normal' | 'warning' | 'system' | 'success' }
> = {
  discovery: { label: 'Исследование', badge: 'normal' },
  design: { label: 'Проектирование', badge: 'warning' },
  pilot: { label: 'Пилот', badge: 'system' },
  delivery: { label: 'Внедрение', badge: 'success' }
};

const approvalStatusMeta: Record<
  InitiativeApprovalStatus,
  { label: string; badge: 'normal' | 'warning' | 'success' }
> = {
  pending: { label: 'Ожидание', badge: 'normal' },
  'in-progress': { label: 'В работе', badge: 'warning' },
  approved: { label: 'Одобрено', badge: 'success' }
};

const NodeDetails: React.FC<NodeDetailsProps> = ({
  node,
  onClose,
  onNavigate,
  moduleNameMap,
  artifactNameMap,
  domainNameMap,
  expertProfiles
}) => {
  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>(
    () => ({ ...defaultSectionState })
  );
  const [isTeamExpanded, setIsTeamExpanded] = useState(false);

  const expertByName = useMemo(() => {
    const map = new Map<string, ExpertProfile>();
    expertProfiles.forEach((expert) => {
      map.set(expert.fullName.toLowerCase(), expert);
    });
    return map;
  }, [expertProfiles]);

  const resolveEntityName = (id: string) =>
    moduleNameMap[id] ?? artifactNameMap[id] ?? domainNameMap[id] ?? id;

  useEffect(() => {
    if (node?.type !== 'module') {
      return;
    }

    setOpenSections({ ...defaultSectionState });
    setIsTeamExpanded(false);
  }, [node?.id, node?.type]);

  const toggleSection = (section: SectionId) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  if (!node) {
    return (
      <div className={styles.empty}>
        <Text size="s" view="secondary">
          Выберите узел, чтобы увидеть подробности
        </Text>
      </div>
    );
  }

  if (node.type === 'domain') {
    const experts = (node.experts ?? []).filter((expert) => expert.trim().length > 0);
    const meetupLink = node.meetupLink?.trim() ?? '';

    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <Text size="l" weight="bold">
            {node.name}
          </Text>
          <Button size="xs" label="Закрыть" view="ghost" onClick={onClose} />
        </header>
        <div className={styles.section}>
          <Text size="s" view="secondary">
            {node.description}
          </Text>
        </div>
        <div className={styles.section}>
          <Text size="s" weight="semibold">
            Эксперты
          </Text>
          {experts.length > 0 ? (
            <ul className={styles.list}>
              {experts.map((expert) => {
                const trimmed = expert.trim();
                const profile = expertByName.get(trimmed.toLowerCase());
                return (
                  <li key={expert} className={styles.listItem}>
                    <Text size="s">{trimmed}</Text>
                    {(profile?.softSkills ?? []).length ? (
                      <div className={styles.tagList}>
                        {(profile?.softSkills ?? []).map((skill) => (
                          <Badge
                            key={`${trimmed}-${skill}`}
                            size="xs"
                            view="ghost"
                            label={skill}
                          />
                        ))}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Text size="xs" view="secondary">
              Эксперты не указаны
            </Text>
          )}
        </div>
        <div className={styles.section}>
          <Text size="s" weight="semibold">
            Ссылка на митап
          </Text>
          {meetupLink ? (
            <a
              href={meetupLink}
              className={styles.link}
              target="_blank"
              rel="noreferrer"
            >
              {meetupLink}
            </a>
          ) : (
            <Text size="xs" view="secondary">
              Ссылка не указана
            </Text>
          )}
        </div>
      </div>
    );
  }

  if (node.type === 'artifact') {
    const producerLabel = node.producedBy
      ? moduleNameMap[node.producedBy] ?? node.producedBy
      : 'Не назначен';
    const consumerLabels = node.consumerIds.map((consumerId) => ({
      id: consumerId,
      label: moduleNameMap[consumerId] ?? consumerId
    }));

    const canNavigateToProducer = Boolean(node.producedBy);

    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <Text size="l" weight="bold">
            {node.name}
          </Text>
          <Button size="xs" label="Закрыть" view="ghost" onClick={onClose} />
        </header>

        <div className={styles.section}>
          <Text size="s" weight="semibold">
            Описание
          </Text>
          <Text size="s" view="secondary">
            {node.description}
          </Text>
        </div>

        <div className={styles.section}>
          <Text size="s" weight="semibold">
            Доменная область
          </Text>
          <div className={styles.tagList}>
            <Tag label={domainNameMap[node.domainId] ?? node.domainId} size="xs" />
          </div>
        </div>

        <div className={styles.section}>
          <Text size="s" weight="semibold">
            Модуль-источник
          </Text>
          {canNavigateToProducer ? (
            <a
              href="#"
              className={styles.link}
              onClick={(event) => {
                event.preventDefault();
                if (node.producedBy) {
                  onNavigate(node.producedBy);
                }
              }}
            >
              {producerLabel}
            </a>
          ) : (
            <Text size="s" view="secondary">
              {producerLabel}
            </Text>
          )}
        </div>

        <div className={styles.section}>
          <Text size="s" weight="semibold">
            Модули-потребители
          </Text>
          {consumerLabels.length > 0 ? (
            <div className={styles.tagList}>
              {consumerLabels.map((consumer) => (
                <a
                  key={consumer.id}
                  href="#"
                  className={styles.link}
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigate(consumer.id);
                  }}
                >
                  {consumer.label}
                </a>
              ))}
            </div>
          ) : (
            <Text size="xs" view="secondary">
              Потребители отсутствуют
            </Text>
          )}
        </div>

        <div className={styles.section}>
          <Text size="s" weight="semibold">
            Тип данных
          </Text>
          <Text size="s">{node.dataType}</Text>
        </div>

        <div className={styles.section}>
          <Text size="s" weight="semibold">
            Пример данных
          </Text>
          <a href={node.sampleUrl} className={styles.link} target="_blank" rel="noreferrer">
            {node.sampleUrl}
          </a>
        </div>
      </div>
    );
  }

  if (node.type === 'initiative') {
    const domainLabels = node.domains.map((domainId) => domainNameMap[domainId] ?? domainId);
    const plannedModules = node.plannedModuleIds.map((moduleId) => ({
      id: moduleId,
      label: moduleNameMap[moduleId] ?? moduleId
    }));

    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <Text size="l" weight="bold">
            {node.name}
          </Text>
          <Button size="xs" label="Закрыть" view="ghost" onClick={onClose} />
        </header>

        <div className={styles.section}>
          <Text size="s" weight="semibold">
            Описание
          </Text>
          <Text size="s" view="secondary">
            {node.description}
          </Text>
        </div>

        <div className={styles.section}>
          <Text size="s" weight="semibold">
            Домены
          </Text>
          {domainLabels.length > 0 ? (
            <div className={styles.tagList}>
              {domainLabels.map((label, index) => (
                <Tag key={node.domains[index]} label={label} size="xs" />
              ))}
            </div>
          ) : (
            <Text size="xs" view="secondary">
              Домены не указаны
            </Text>
          )}
        </div>

        <div className={styles.section}>
          <Text size="s" weight="semibold">
            Планируемые модули
          </Text>
          {plannedModules.length > 0 ? (
            <ul className={styles.list}>
              {plannedModules.map((module) => (
                <li key={module.id} className={styles.listItem}>
                  <a
                    href="#"
                    className={styles.link}
                    onClick={(event) => {
                      event.preventDefault();
                      onNavigate(module.id);
                    }}
                  >
                    {module.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <Text size="xs" view="secondary">
              Модули не назначены
            </Text>
          )}
        </div>

        <div className={styles.section}>
          <Text size="s" weight="semibold">
            Работы
          </Text>
          {node.workItems.length > 0 ? (
            <ul className={styles.list}>
              {node.workItems.map((item) => {
                const status = workItemStatusMeta[item.status];
                return (
                  <li key={item.id} className={styles.listItem}>
                    <div className={styles.listItemHeader}>
                      <Text size="s" weight="semibold">
                        {item.title}
                      </Text>
                      <Badge
                        size="xs"
                        status={status.badge}
                        view="filled"
                        label={status.label}
                      />
                    </div>
                    <Text size="xs" view="secondary">
                      {item.description}
                    </Text>
                    <Text size="xs" view="secondary">
                      {`Ответственный: ${item.owner} • ${item.timeframe}`}
                    </Text>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Text size="xs" view="secondary">
              Работы не определены
            </Text>
          )}
        </div>

        <div className={styles.section}>
          <Text size="s" weight="semibold">
            Требуемые навыки
          </Text>
          {node.requiredSkills.length > 0 ? (
            <div className={styles.tagList}>
              {node.requiredSkills.map((skill) => (
                <Tag key={skill} label={skill} size="xs" />
              ))}
            </div>
          ) : (
            <Text size="xs" view="secondary">
              Навыки не указаны
            </Text>
          )}
        </div>

        <div className={styles.section}>
          <Text size="s" weight="semibold">
            Этапы согласования
          </Text>
          {node.approvalStages.length > 0 ? (
            <ul className={styles.list}>
              {node.approvalStages.map((stage) => {
                const status = approvalStatusMeta[stage.status];
                return (
                  <li key={stage.id} className={styles.listItem}>
                    <div className={styles.listItemHeader}>
                      <Text size="s" weight="semibold">
                        {stage.title}
                      </Text>
                      <Badge
                        size="xs"
                        status={status.badge}
                        view="filled"
                        label={status.label}
                      />
                    </div>
                    <Text size="xs" view="secondary">
                      {`Согласующий: ${stage.approver}`}
                    </Text>
                    {stage.comment ? (
                      <Text size="xs" view="secondary">
                        {stage.comment}
                      </Text>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Text size="xs" view="secondary">
              Этапы согласования не заданы
            </Text>
          )}
        </div>
      </div>
    );
  }

  const companyUsage = node.userStats.companies;
  const totalCompanies = companyUsage.length;
  const totalLicenses = companyUsage.reduce((sum, company) => sum + company.licenses, 0);

  const sections: { id: SectionId; title: string; content: React.ReactNode }[] = [
    {
      id: 'general',
      title: 'Общая информация',
      content: (
        <>
          <InfoRow label="Описание модуля">
            <Text size="s" className={styles.description}>
              {node.description}
            </Text>
          </InfoRow>
          <InfoRow label="Доменные области">
            <div className={styles.tagList}>
              {node.domains.map((domain) => (
                <Tag key={domain} label={domainNameMap[domain] ?? domain} size="xs" />
              ))}
            </div>
          </InfoRow>
          <InfoRow label="Название продукта">
            <Text size="s">{node.productName}</Text>
          </InfoRow>
          <InfoRow label="Компания создатель решения">
            <Text size="s">{node.creatorCompany}</Text>
          </InfoRow>
          <InfoRow label="Владелец РИД">
            <>
              <Text size="s">{node.ridOwner.company}</Text>
              <Text size="xs" view="secondary">
                {node.ridOwner.division}
              </Text>
            </>
          </InfoRow>
          <InfoRow label="Локализация функции">
            <Text size="s">{node.localization}</Text>
          </InfoRow>
          <InfoRow label="Использование компаниями">
            {companyUsage.length === 0 ? (
              <Text size="s" view="secondary">
                Нет данных о компаниях
              </Text>
            ) : (
              <>
                <Text size="s">
                  {formatCompanyCount(totalCompanies)}, всего {formatNumber(totalLicenses)} {formatLicenseCount(totalLicenses)}
                </Text>
                <ul className={styles.companyList}>
                  {companyUsage.map((company) => (
                    <li key={company.name} className={styles.companyListItem}>
                      <Text size="s" weight="semibold">
                        {company.name}
                      </Text>
                      <Text size="s" view="secondary">
                        {formatNumber(company.licenses)} {formatLicenseCount(company.licenses)}
                      </Text>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </InfoRow>
          <InfoRow label="Стек технологий">
            <div className={styles.tagList}>
              {node.technologyStack.map((technology) => (
                <Tag key={technology} label={technology} size="xs" />
              ))}
            </div>
          </InfoRow>
          <InfoRow label="Команда проекта">
            <TeamRoster
              members={node.projectTeam}
              expanded={isTeamExpanded}
              onToggle={() => setIsTeamExpanded((prev) => !prev)}
              expertByName={expertByName}
            />
          </InfoRow>
        </>
      )
    },
    {
      id: 'calculation',
      title: 'Расчётный узел',
      content: (
        <>
          <ModuleIoSection
            title="Данные In"
            items={node.dataIn}
            onNavigate={onNavigate}
            resolveName={resolveEntityName}
          />
          <ModuleOutputSection
            items={node.dataOut}
            onNavigate={onNavigate}
            resolveName={resolveEntityName}
          />
          <InfoRow label="Описание алгоритма расчёта модуля">
            <Text size="s" className={styles.code}>
              {node.formula}
            </Text>
          </InfoRow>
        </>
      )
    },
    {
      id: 'technical',
      title: 'Техническая информация',
      content: (
        <>
          {node.repository && (
            <InfoRow label="Репозиторий">
              <a href={node.repository} target="_blank" rel="noreferrer" className={styles.link}>
                {node.repository}
              </a>
            </InfoRow>
          )}
          {node.api && (
            <InfoRow label="API">
              <Text size="s" className={styles.code}>
                {node.api}
              </Text>
            </InfoRow>
          )}
          <InfoRow label="Постановка на разработку">
            <a href={node.specificationUrl} target="_blank" rel="noreferrer" className={styles.link}>
              {node.specificationUrl}
            </a>
          </InfoRow>
          <InfoRow label="Документация контрактов API">
            <a href={node.apiContractsUrl} target="_blank" rel="noreferrer" className={styles.link}>
              {node.apiContractsUrl}
            </a>
          </InfoRow>
          <InfoRow label="Технический дизайн">
            <a href={node.techDesignUrl} target="_blank" rel="noreferrer" className={styles.link}>
              {node.techDesignUrl}
            </a>
          </InfoRow>
          <InfoRow label="Архитектурная схема">
            <a href={node.architectureDiagramUrl} target="_blank" rel="noreferrer" className={styles.link}>
              {node.architectureDiagramUrl}
            </a>
          </InfoRow>
          <InfoRow label="Интеграция с сервером лицензирования">
            <Text size="s">{node.licenseServerIntegrated ? 'Да' : 'Нет'}</Text>
          </InfoRow>
          <InfoRow label="Перечень библиотек">
            <ul className={styles.list}>
              {node.libraries.map((library) => (
                <li
                  key={`${node.id}-${library.name}-${library.version}`}
                  className={styles.listItem}
                >
                  <Text size="s">{library.name}</Text>
                  <Text size="xs" view="secondary">
                    v{library.version}
                  </Text>
                </li>
              ))}
            </ul>
          </InfoRow>
          <InfoRow label="Клиент">
            <Text size="s">{clientTypeLabels[node.clientType]}</Text>
          </InfoRow>
          <InfoRow label="Средство развертывания">
            <Text size="s">{deploymentToolLabels[node.deploymentTool]}</Text>
          </InfoRow>
          <div>
            <Text size="xs" view="secondary">
              Метрики по тестам
            </Text>
            <div className={styles.metrics}>
              <div>
                <Text size="xs" view="secondary">
                  Покрытие
                </Text>
                <Text size="m" weight="semibold">
                  {node.metrics.coverage}%
                </Text>
              </div>
              <div>
                <Text size="xs" view="secondary">
                  Всего тестов
                </Text>
                <Text size="m" weight="semibold">
                  {node.metrics.tests}
                </Text>
              </div>
              <div>
                <Text size="xs" view="secondary">
                  Автоматизация
                </Text>
                <Text size="m" weight="semibold">
                  {node.metrics.automationRate}%
                </Text>
              </div>
            </div>
          </div>
        </>
      )
    },
    {
      id: 'nonFunctional',
      title: 'Нефункциональные требования',
      content: (
        <>
          <div className={styles.metrics}>
            <div>
              <Text size="xs" view="secondary">
                Время отклика
              </Text>
              <Text size="m" weight="semibold">
                {node.nonFunctional.responseTimeMs} мс
              </Text>
            </div>
            <div>
              <Text size="xs" view="secondary">
                Пропускная способность
              </Text>
              <Text size="m" weight="semibold">
                {node.nonFunctional.throughputRps} rps
              </Text>
            </div>
            <div>
              <Text size="xs" view="secondary">
                Потребление ресурсов
              </Text>
              <Text size="m" weight="semibold">
                {node.nonFunctional.resourceConsumption}
              </Text>
              <Text size="xs" view="secondary">
                при {formatNumber(node.nonFunctional.baselineUsers)} пользователях
              </Text>
            </div>
          </div>
        </>
      )
    }
  ];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <Text size="l" weight="bold">
            {node.name}
          </Text>
          <Badge label={statusLabel(node.status)} status={statusBadgeView[node.status]} size="s" />
        </div>
        <Button size="xs" label="Закрыть" view="ghost" onClick={onClose} />
      </header>
      <div className={styles.sections}>
        {sections.map((section) => (
          <Collapse
            key={section.id}
            label={
              <div className={styles.collapseLabel}>
                <Text size="s" weight="semibold">
                  {section.title}
                </Text>
              </div>
            }
            isOpen={openSections[section.id]}
            onClick={() => toggleSection(section.id)}
          >
            <div className={styles.sectionContent}>{section.content}</div>
          </Collapse>
        ))}
      </div>
    </div>
  );
};

function statusLabel(status: GraphNode & { type: 'module' }['status']) {
  switch (status) {
    case 'production':
      return 'В эксплуатации';
    case 'in-dev':
      return 'В разработке';
    case 'deprecated':
      return 'Устаревший';
    default:
      return status;
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

const companyPluralRules = new Intl.PluralRules('ru');

function formatCompanyCount(count: number): string {
  const category = companyPluralRules.select(count);

  switch (category) {
    case 'one':
      return `${count} компания`;
    case 'few':
      return `${count} компании`;
    default:
      return `${count} компаний`;
  }
}

const licensePluralRules = new Intl.PluralRules('ru');

function formatLicenseCount(count: number): string {
  const category = licensePluralRules.select(count);

  switch (category) {
    case 'one':
      return 'лицензия';
    case 'few':
      return 'лицензии';
    default:
      return 'лицензий';
  }
}

const teamCountPluralRules = new Intl.PluralRules('ru');

function formatTeamCount(count: number): string {
  const category = teamCountPluralRules.select(count);

  switch (category) {
    case 'one':
      return `${count} специалист`;
    case 'few':
      return `${count} специалиста`;
    default:
      return `${count} специалистов`;
  }
}

type InfoRowProps = {
  label: string;
  children: React.ReactNode;
};

const InfoRow: React.FC<InfoRowProps> = ({ label, children }) => (
  <div className={styles.keyValueItem}>
    <Text size="xs" view="secondary">
      {label}
    </Text>
    <div className={styles.value}>{children}</div>
  </div>
);

type ModuleIoSectionProps = {
  title: string;
  items: ModuleInput[];
  onNavigate: (nodeId: string) => void;
  resolveName: (id: string) => string;
};

const ModuleIoSection: React.FC<ModuleIoSectionProps> = ({
  title,
  items,
  onNavigate,
  resolveName
}) => {
  if (!items.length) {
    return null;
  }

  return (
    <div className={styles.section}>
      <Text size="s" weight="semibold">
        {title}
      </Text>
      <ul className={styles.ioList}>
        {items.map((item) => {
          const hasSource = Boolean(item.sourceId);
          const sourceLabel = item.sourceId ? resolveName(item.sourceId) : null;

          return (
            <li key={item.id} className={styles.ioItem}>
              <Text size="s" weight="semibold">
                {item.label}
              </Text>
              {hasSource ? (
                <a
                  href="#"
                  className={styles.link}
                  onClick={(event) => {
                    event.preventDefault();
                    if (item.sourceId) {
                      onNavigate(item.sourceId);
                    }
                  }}
                >
                  {sourceLabel}
                </a>
              ) : (
                <Text size="xs" view="secondary">
                  Источник вне графа
                </Text>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

type ModuleOutputSectionProps = {
  items: ModuleOutput[];
  onNavigate: (nodeId: string) => void;
  resolveName: (id: string) => string;
};

const ModuleOutputSection: React.FC<ModuleOutputSectionProps> = ({
  items,
  onNavigate,
  resolveName
}) => {
  if (!items.length) {
    return null;
  }

  return (
    <div className={styles.section}>
      <Text size="s" weight="semibold">
        Данные Out
      </Text>
      <ul className={styles.ioList}>
        {items.map((item) => {
          const hasArtifact = Boolean(item.artifactId);
          const artifactLabel = item.artifactId ? resolveName(item.artifactId) : null;
          return (
            <li key={item.id} className={styles.ioItem}>
              <Text size="s" weight="semibold">
                {item.label}
              </Text>
              {hasArtifact ? (
                <a
                  href="#"
                  className={styles.link}
                  onClick={(event) => {
                    event.preventDefault();
                    if (item.artifactId) {
                      onNavigate(item.artifactId);
                    }
                  }}
                >
                  {artifactLabel ?? item.artifactId}
                </a>
              ) : (
                <Text size="xs" view="secondary">
                  Артефакт не назначен
                </Text>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

type TeamRosterProps = {
  members: TeamMember[];
  expanded: boolean;
  onToggle: () => void;
  expertByName: Map<string, ExpertProfile>;
};

const TeamRoster: React.FC<TeamRosterProps> = ({ members, expanded, onToggle, expertByName }) => {
  const uniqueRoles = Array.from(new Set(members.map((member) => member.role)));

  return (
    <div className={styles.teamRoster}>
      <div className={styles.teamRosterHeader}>
        <div className={styles.teamSummary}>
          <Text size="s">{formatTeamCount(members.length)}</Text>
          <Text size="xs" view="secondary">
            Роли: {uniqueRoles.length > 0 ? uniqueRoles.join(', ') : '—'}
          </Text>
        </div>
        <Button
          size="xs"
          view="ghost"
          label={expanded ? 'Скрыть состав' : 'Показать состав'}
          onClick={onToggle}
        />
      </div>
      {expanded && (
        <ul className={styles.list}>
          {members.map((member) => {
            const profile = expertByName.get(member.fullName.toLowerCase());
            return (
              <li key={member.id} className={styles.listItem}>
                <Text size="s" weight="semibold">
                  {member.fullName}
                </Text>
                <Text size="xs" view="secondary">
                  {member.role}
                </Text>
                {(profile?.softSkills ?? []).length ? (
                  <div className={styles.tagList}>
                    {(profile?.softSkills ?? []).map((skill) => (
                      <Badge key={`${member.id}-${skill}`} label={skill} size="xs" view="ghost" />
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default NodeDetails;
