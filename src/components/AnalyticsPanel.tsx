import { Card } from '@consta/uikit/Card';
import { Text } from '@consta/uikit/Text';
import React, { useMemo } from 'react';
import type { ModuleNode } from '../data';
import styles from './AnalyticsPanel.module.css';

type AnalyticsPanelProps = {
  modules: ModuleNode[];
  domainNameMap: Record<string, string>;
};

const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({ modules, domainNameMap }) => {
  const metrics = useMemo(() => {
    if (modules.length === 0) {
      return [] as const;
    }

    const coverage = average(modules.map((module) => module.metrics.coverage ?? 0));
    const reuse = average(modules.map((module) => Math.round(module.reuseScore * 100)));
    const domainCount = modules.reduce((acc, module) => {
      module.domains.forEach((domainId) => {
        acc.add(domainNameMap[domainId] ?? domainId);
      });
      return acc;
    }, new Set<string>());

    return [
      {
        id: 'modules',
        label: 'Модулей в графе',
        value: modules.length.toString()
      },
      {
        id: 'domains',
        label: 'Активных доменов',
        value: domainCount.size.toString()
      },
      {
        id: 'coverage',
        label: 'Среднее покрытие тестами',
        value: `${Math.round(coverage)}%`
      },
      {
        id: 'reuse',
        label: 'Средний индекс переиспользуемости',
        value: `${Math.round(reuse)}%`
      }
    ] as const;
  }, [domainNameMap, modules]);

  if (metrics.length === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      {metrics.map((metric) => (
        <Card
          key={metric.id}
          verticalSpace="l"
          horizontalSpace="l"
          shadow={false}
          className={styles.card}
        >
          <Text size="s" weight="semibold">
            {metric.label}
          </Text>
          <Text size="2xl" weight="bold">
            {metric.value}
          </Text>
        </Card>
      ))}
    </div>
  );
};

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export default AnalyticsPanel;
