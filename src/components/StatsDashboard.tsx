import { Bar, type BarProps } from '@consta/charts/Bar';
import { Column, type ColumnProps } from '@consta/charts/Column';
import { Line, type LineProps } from '@consta/charts/Line';
import { Pie, type PieProps } from '@consta/charts/Pie';
import { Card } from '@consta/uikit/Card';
import { Text } from '@consta/uikit/Text';
import { motion } from 'framer-motion';
import { useMemo } from 'react';
import {
  artifacts as allArtifacts,
  domainTree as allDomains,
  modules as allModules,
  type ArtifactNode,
  type DomainNode,
  type ModuleNode,
  type ModuleStatus,
  type ReuseTrendPoint
} from '../data';
import styles from './StatsDashboard.module.css';

const statusOrder: ModuleStatus[] = ['production', 'in-dev', 'deprecated'];
const statusLabels: Record<ModuleStatus, string> = {
  production: 'В эксплуатации',
  'in-dev': 'В разработке',
  deprecated: 'Выведено из эксплуатации'
};

const statusBadgeView: Record<ModuleStatus, 'success' | 'warning' | 'alert'> = {
  production: 'success',
  'in-dev': 'warning',
  deprecated: 'alert'
};

type StatsDashboardProps = {
  modules?: ModuleNode[];
  domains?: DomainNode[];
  artifacts?: ArtifactNode[];
  reuseHistory: ReuseTrendPoint[];
};

type SystemRow = {
  name: string;
  total: number;
  statuses: Record<ModuleStatus, number>;
};

type ArtifactChartDatum = {
  type: string;
  count: number;
};

type ReuseChartDatum = {
  periodLabel: string;
  averagePercent: number;
};

type DistributionDatum = {
  label: string;
  value: number;
};

type TeamDatum = {
  team: string;
  count: number;
};

const defaultModules = allModules;
const defaultDomains = allDomains;
const defaultArtifacts = allArtifacts;

const StatsDashboard = ({
  modules = defaultModules,
  domains = defaultDomains,
  artifacts = defaultArtifacts,
  reuseHistory
}: StatsDashboardProps) => {
  const domainNameMap = useMemo(() => buildDomainNameMap(domains), [domains]);

  if (!modules.length && !domains.length && !artifacts.length) {
    return (
      <div className={styles.emptyState}>
        <Text size="xl" weight="bold">Нет данных для статистики</Text>
        <Text size="s" view="secondary">
          В текущем графе отсутствуют модули, домены или артефакты.
          Попробуйте добавить данные или выбрать другой граф.
        </Text>
      </div>
    );
  }

  const systems = useMemo(() => {
    const map = new Map<string, SystemRow>();

    modules.forEach((module) => {
      const existing = map.get(module.productName);
      if (existing) {
        existing.total += 1;
        existing.statuses[module.status] += 1;
        return;
      }

      map.set(module.productName, {
        name: module.productName,
        total: 1,
        statuses: {
          production: module.status === 'production' ? 1 : 0,
          'in-dev': module.status === 'in-dev' ? 1 : 0,
          deprecated: module.status === 'deprecated' ? 1 : 0
        }
      });
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [modules]);

  const moduleCount = modules.length;
  const systemCount = systems.length;
  const artifactCount = artifacts.length;

  const modulesByStatus = useMemo(() => {
    return statusOrder.map((status) => ({
      status,
      statusLabel: statusLabels[status],
      count: modules.filter((module) => module.status === status).length
    }));
  }, [modules]);

  const artifactTypes = useMemo<ArtifactChartDatum[]>(() => {
    const counts = new Map<string, number>();

    artifacts.forEach((artifact) => {
      const type = resolveArtifactType(artifact);
      counts.set(type, (counts.get(type) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }, [artifacts]);

  const reuseChartData = useMemo<ReuseChartDatum[]>(() => {
    return reuseHistory.map((point) => ({
      periodLabel: formatPeriod(point.period),
      averagePercent: Math.round(point.averageScore * 1000) / 10
    }));
  }, [reuseHistory]);

  const domainWithoutModules = useMemo(() => {
    const flatDomains = flattenDomains(domains).filter(
      (domain) => !domain.children || domain.children.length === 0
    );
    const usage = new Map<string, number>();

    modules.forEach((module) => {
      module.domains.forEach((domainId) => {
        usage.set(domainId, (usage.get(domainId) ?? 0) + 1);
      });
    });

    return flatDomains.filter((domain) => (usage.get(domain.id) ?? 0) === 0);
  }, [domains, modules]);

  const deploymentDistribution = useMemo<DistributionDatum[]>(() => {
    const counts = modules.reduce<Record<string, number>>((acc, module) => {
      const key = module.deploymentTool === 'kubernetes' ? 'Kubernetes' : 'Docker';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [modules]);

  const clientDistribution = useMemo<DistributionDatum[]>(() => {
    const counts = modules.reduce<Record<string, number>>((acc, module) => {
      const key = module.clientType === 'desktop' ? 'Desktop' : 'Web';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [modules]);

  const teamLeaders = useMemo<TeamDatum[]>(() => {
    const counts = modules.reduce<Record<string, number>>((acc, module) => {
      acc[module.creatorCompany] = (acc[module.creatorCompany] ?? 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts)
      .map(([team, count]) => ({ team, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [modules]);

  const averageAutomation = useMemo(() => average(modules.map((module) => module.metrics.automationRate)), [modules]);
  const averageDependencies = useMemo(
    () => average(modules.map((module) => module.dependencies.length)),
    [modules]
  );
  const averageResponseTime = useMemo(
    () => average(modules.map((module) => module.nonFunctional.responseTimeMs)),
    [modules]
  );
  const licenseRatio = useMemo(() => {
    const withLicense = modules.filter((module) => module.licenseServerIntegrated).length;
    return {
      withLicense,
      ratio: modules.length === 0 ? 0 : Math.round((withLicense / modules.length) * 100)
    };
  }, [modules]);
  const artifactsPerModule = useMemo(
    () => (modules.length === 0 ? 0 : Math.round((artifactCount / modules.length) * 10) / 10),
    [artifactCount, modules.length]
  );

  const modulesByStatusPieProps: PieProps<(typeof modulesByStatus)[number]> = {
    data: modulesByStatus,
    angleField: 'count',
    colorField: 'statusLabel',
    legend: { position: 'bottom' },
    height: 280,
    radius: 0.9,
    innerRadius: 0.45,
    tooltip: ({ statusLabel, count }) => ({
      name: statusLabel,
      value: `${count} мод.`
    })
  };

  const artifactColumnProps: ColumnProps<ArtifactChartDatum> = {
    data: artifactTypes,
    xField: 'type',
    yField: 'count',
    height: 280,
    columnWidthRatio: 0.6,
    label: {
      position: 'top',
      style: { fontSize: 12 }
    },
    xAxis: {
      label: {
        style: { fontSize: 12 }
      }
    },
    yAxis: {
      label: {
        style: { fontSize: 12 }
      }
    },
    tooltip: ({ type, count }) => ({
      name: type,
      value: `${count} шт.`
    })
  };

  const reuseLineProps: LineProps<ReuseChartDatum> = {
    data: reuseChartData,
    xField: 'periodLabel',
    yField: 'averagePercent',
    height: 280,
    smooth: true,
    point: {
      size: 4
    },
    yAxis: {
      label: {
        formatter: (value: string) => `${value}%`,
        style: { fontSize: 12 }
      }
    },
    xAxis: {
      label: {
        style: { fontSize: 12 }
      }
    },
    tooltip: ({ averagePercent, periodLabel }) => ({
      name: periodLabel,
      value: `${averagePercent}%`
    })
  };

  const deploymentPieProps: PieProps<DistributionDatum> = {
    data: deploymentDistribution,
    angleField: 'value',
    colorField: 'label',
    legend: { position: 'bottom' },
    height: 260,
    tooltip: ({ label, value }) => ({
      name: label,
      value: `${value} мод.`
    })
  };

  const clientPieProps: PieProps<DistributionDatum> = {
    data: clientDistribution,
    angleField: 'value',
    colorField: 'label',
    legend: { position: 'bottom' },
    height: 260,
    tooltip: ({ label, value }) => ({
      name: label,
      value: `${value} мод.`
    })
  };

  const teamBarProps: BarProps<TeamDatum> = {
    data: teamLeaders,
    xField: 'count',
    yField: 'team',
    seriesField: 'team',
    legend: false,
    height: 260,
    autoFit: true
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 }
    }
  };

  return (
    <motion.div
      className={styles.container}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <section className={styles.summaryGrid}>
        <motion.div variants={itemVariants} style={{ display: 'contents' }}>
          <Card className={styles.summaryCard} verticalSpace="l" horizontalSpace="l" shadow={false}>
            <Text size="xs" view="secondary">
              Активные системы
            </Text>
            <Text size="3xl" weight="bold" className={styles.summaryValue}>
              {systemCount}
            </Text>
            <Text size="xs" view="ghost">
              Сформированы по уникальным продуктовым контурам
            </Text>
          </Card>
        </motion.div>
        <motion.div variants={itemVariants} style={{ display: 'contents' }}>
          <Card className={styles.summaryCard} verticalSpace="l" horizontalSpace="l" shadow={false}>
            <Text size="xs" view="secondary">
              Модули в каталоге
            </Text>
            <Text size="3xl" weight="bold" className={styles.summaryValue}>
              {moduleCount}
            </Text>
            <Text size="xs" view="ghost">
              Включая совместно используемые компоненты
            </Text>
          </Card>
        </motion.div>
        <motion.div variants={itemVariants} style={{ display: 'contents' }}>
          <Card className={styles.summaryCard} verticalSpace="l" horizontalSpace="l" shadow={false}>
            <Text size="xs" view="secondary">
              Домены без функций
            </Text>
            <Text size="3xl" weight="bold" className={styles.summaryValue}>
              {domainWithoutModules.length}
            </Text>
            <Text size="xs" view="ghost">
              Требуют наполнения или ревизии
            </Text>
          </Card>
        </motion.div>
        <motion.div variants={itemVariants} style={{ display: 'contents' }}>
          <Card className={styles.summaryCard} verticalSpace="l" horizontalSpace="l" shadow={false}>
            <Text size="xs" view="secondary">
              Артефакты данных
            </Text>
            <Text size="3xl" weight="bold" className={styles.summaryValue}>
              {artifactCount}
            </Text>
            <Text size="xs" view="ghost">
              Используются при обмене между командами
            </Text>
          </Card>
        </motion.div>
      </section>

      <section className={styles.chartsGrid}>
        <motion.div variants={itemVariants} style={{ display: 'contents' }}>
          <Card className={styles.card} verticalSpace="l" horizontalSpace="l" shadow={false}>
            <Text size="s" weight="semibold" className={styles.cardTitle}>
              Статусы модулей
            </Text>
            <Pie {...modulesByStatusPieProps} />
          </Card>
        </motion.div>
        <motion.div variants={itemVariants} style={{ display: 'contents' }}>
          <Card className={styles.card} verticalSpace="l" horizontalSpace="l" shadow={false}>
            <Text size="s" weight="semibold" className={styles.cardTitle}>
              Артефакты по типам файлов
            </Text>
            <Column {...artifactColumnProps} />
          </Card>
        </motion.div>
        <motion.div variants={itemVariants} style={{ display: 'contents' }}>
          <Card className={styles.card} verticalSpace="l" horizontalSpace="l" shadow={false}>
            <Text size="s" weight="semibold" className={styles.cardTitle}>
              Динамика среднего индекса переиспользования
            </Text>
            <Line {...reuseLineProps} />
          </Card>
        </motion.div>
      </section>

      <section className={styles.chartsGrid}>
        <motion.div variants={itemVariants} style={{ display: 'contents' }}>
          <Card className={styles.card} verticalSpace="l" horizontalSpace="l" shadow={false}>
            <Text size="s" weight="semibold" className={styles.cardTitle}>
              Инструменты деплоя
            </Text>
            <Pie {...deploymentPieProps} />
          </Card>
        </motion.div>
        <motion.div variants={itemVariants} style={{ display: 'contents' }}>
          <Card className={styles.card} verticalSpace="l" horizontalSpace="l" shadow={false}>
            <Text size="s" weight="semibold" className={styles.cardTitle}>
              Каналы доставки клиентам
            </Text>
            <Pie {...clientPieProps} />
          </Card>
        </motion.div>
        <motion.div variants={itemVariants} style={{ display: 'contents' }}>
          <Card className={styles.card} verticalSpace="l" horizontalSpace="l" shadow={false}>
            <Text size="s" weight="semibold" className={styles.cardTitle}>
              Компании-лидеры по числу модулей
            </Text>
            <Bar {...teamBarProps} />
          </Card>
        </motion.div>
      </section>

      <section className={styles.splitGrid}>
        <motion.div variants={itemVariants} style={{ display: 'contents' }}>
          <Card className={styles.card} verticalSpace="l" horizontalSpace="l" shadow={false}>
            <Text size="s" weight="semibold" className={styles.cardTitle}>
              Разрез по системам и статусам
            </Text>
            <div className={styles.tableWrapper}>
              <table className={styles.systemTable}>
                <thead>
                  <tr>
                    <th>Система</th>
                    <th>Всего</th>
                    {statusOrder.map((status) => (
                      <th key={status}>{statusLabels[status]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {systems.map((system) => (
                    <tr key={system.name}>
                      <td>{system.name}</td>
                      <td>{system.total}</td>
                      {statusOrder.map((status) => (
                        <td key={status}>
                          <span className={styles.statusPill} data-status={statusBadgeView[status]}>
                            {system.statuses[status]}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>
        <motion.div variants={itemVariants} style={{ display: 'contents' }}>
          <Card className={styles.card} verticalSpace="l" horizontalSpace="l" shadow={false}>
            <Text size="s" weight="semibold" className={styles.cardTitle}>
              Домены без закреплённых функций
            </Text>
            <div className={styles.domainList}>
              {domainWithoutModules.length === 0 ? (
                <Text size="s" view="secondary">
                  Все домены покрыты модулями
                </Text>
              ) : (
                domainWithoutModules.map((domain) => (
                  <span key={domain.id} className={styles.domainPill}>
                    {domainNameMap[domain.id] ?? domain.name}
                  </span>
                ))
              )}
            </div>
          </Card>
        </motion.div>
      </section>

      <motion.div variants={itemVariants} style={{ display: 'contents' }}>
        <Card className={styles.card} verticalSpace="l" horizontalSpace="l" shadow={false}>
          <Text size="s" weight="semibold" className={styles.cardTitle}>
            Дополнительные метрики мониторинга
          </Text>
          <div className={styles.metricsList}>
            <div className={styles.metricsItem}>
              <span className={styles.metricsLabel}>Средний уровень автоматизации тестов</span>
              <span className={styles.metricsValue}>{Math.round(averageAutomation)}%</span>
            </div>
            <div className={styles.metricsItem}>
              <span className={styles.metricsLabel}>Среднее число зависимостей на модуль</span>
              <span className={styles.metricsValue}>{averageDependencies.toFixed(1)}</span>
            </div>
            <div className={styles.metricsItem}>
              <span className={styles.metricsLabel}>Средняя длительность ответа сервисов</span>
              <span className={styles.metricsValue}>{Math.round(averageResponseTime)} мс</span>
            </div>
            <div className={styles.metricsItem}>
              <span className={styles.metricsLabel}>Модулей с интеграцией лицензирования</span>
              <span className={styles.metricsValue}>
                {licenseRatio.ratio}% ({licenseRatio.withLicense}/{moduleCount})
              </span>
            </div>
            <div className={styles.metricsItem}>
              <span className={styles.metricsLabel}>Среднее число артефактов на модуль</span>
              <span className={styles.metricsValue}>{artifactsPerModule}</span>
            </div>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
};

function flattenDomains(nodes: DomainNode[]): DomainNode[] {
  return nodes.flatMap((node) => {
    const children = node.children ? flattenDomains(node.children) : [];
    if (node.isCatalogRoot) {
      return children;
    }
    return [node, ...children];
  });
}

function resolveArtifactType(artifact: ArtifactNode): string {
  const extension = extractExtension(artifact.sampleUrl);

  if (extension === 'xlsx') {
    return 'Excel (XLSX)';
  }

  if (extension === 'las') {
    return 'LAS';
  }

  if (extension === 'csv') {
    return 'CSV';
  }

  if (extension === 'json') {
    return 'JSON';
  }

  if (extension === 'parquet') {
    return 'Parquet';
  }

  if (extension === 'pdf') {
    return 'PDF';
  }

  return artifact.dataType;
}

function extractExtension(url: string): string | null {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const segments = pathname.split('/');
    const last = segments[segments.length - 1];
    if (!last) {
      return null;
    }
    const clean = last.split('.')[1] ? last.split('.').pop() : null;
    return clean ? clean.toLowerCase() : null;
  } catch {
    const parts = url.split('?')[0].split('.');
    return parts.length > 1 ? parts.pop()?.toLowerCase() ?? null : null;
  }
}

function formatPeriod(period: string): string {
  const [year, month] = period.split('-');
  if (!month) {
    return period;
  }

  const monthIndex = Number(month);
  if (Number.isNaN(monthIndex) || monthIndex < 1 || monthIndex > 12) {
    return period;
  }

  const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${monthNames[monthIndex - 1]} ${year}`;
}

function buildDomainNameMap(domains: DomainNode[]): Record<string, string> {
  const map: Record<string, string> = {};

  const traverse = (nodes: DomainNode[]) => {
    nodes.forEach((domain) => {
      map[domain.id] = domain.name;
      if (domain.children) {
        traverse(domain.children);
      }
    });
  };

  traverse(domains);
  return map;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sum = values.reduce((total, value) => total + value, 0);
  return sum / values.length;
}

export default StatsDashboard;
