import { IconAdd } from '@consta/icons/IconAdd';
import { IconTrash } from '@consta/icons/IconTrash';
import { IconRestart } from '@consta/icons/IconRestart';
import { Badge } from '@consta/uikit/Badge';
import { Button } from '@consta/uikit/Button';
import { CheckboxGroup } from '@consta/uikit/CheckboxGroup';
import { Select } from '@consta/uikit/Select';
import { Text } from '@consta/uikit/Text';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ArtifactNode, DomainNode, ExpertProfile, Initiative, ModuleNode } from '../data';
import { normalizeLayoutSnapshot } from '../services/graphStorage';
import {
  GRAPH_SNAPSHOT_VERSION,
  type GraphDataScope,
  type GraphLayoutSnapshot,
  type GraphSnapshotPayload,
  type GraphSummary,
  type GraphSyncStatus
} from '../types/graph';
import styles from './GraphPersistenceControls.module.css';

type StatusMessage =
  | { type: 'success'; message: string }
  | { type: 'error'; message: string };

type GraphPersistenceControlsProps = {
  modules: ModuleNode[];
  domains: DomainNode[];
  artifacts: ArtifactNode[];
  experts: ExpertProfile[];
  initiatives: Initiative[];
  onImport: (snapshot: GraphSnapshotPayload) => void;
  onImportFromGraph?: (request: {
    graphId: string;
    includeDomains: boolean;
    includeModules: boolean;
    includeArtifacts: boolean;
    includeExperts: boolean;
    includeInitiatives: boolean;
  }) => Promise<{ domains: number; modules: number; artifacts: number; experts: number; initiatives: number }>;
  graphs?: GraphSummary[];
  activeGraphId?: string | null;
  onGraphSelect?: (graphId: string | null) => void;
  onGraphCreate?: () => void;
  onGraphDelete?: () => void;
  isGraphListLoading?: boolean;
  syncStatus?: GraphSyncStatus | null;
  layout?: GraphLayoutSnapshot;
  onForceSave?: () => void;
  isSyncAvailable?: boolean;
  onRetryLoad?: () => void;
  isReloading?: boolean;
  lastUpdated?: string;
};

const GraphPersistenceControls: React.FC<GraphPersistenceControlsProps> = ({
  modules,
  domains,
  artifacts,
  experts,
  initiatives,
  onImport,
  onImportFromGraph,
  graphs,
  activeGraphId,
  onGraphSelect,
  onGraphCreate,
  onGraphDelete,
  isGraphListLoading = false,
  syncStatus,
  layout,
  onForceSave,
  isSyncAvailable,
  onRetryLoad,
  isReloading = false,
  lastUpdated
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [sourceGraphId, setSourceGraphId] = useState<string | null>(null);
  const [copyOptions, setCopyOptions] = useState<
    Set<'domains' | 'modules' | 'artifacts' | 'experts' | 'initiatives'>
  >(() => new Set(['domains', 'modules', 'artifacts', 'experts', 'initiatives']));
  const [fileTransferOptions, setFileTransferOptions] = useState<
    Set<GraphDataScope>
  >(() => new Set(['domains', 'modules', 'artifacts', 'experts', 'initiatives']));
  const [isGraphImporting, setIsGraphImporting] = useState(false);
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);

  const buildSnapshot = useCallback((): GraphSnapshotPayload => {
    const sanitizedLayout = normalizeLayoutSnapshot(layout) ?? undefined;
    return {
      version: GRAPH_SNAPSHOT_VERSION,
      exportedAt: new Date().toISOString(),
      modules,
      domains,
      artifacts,
      experts,
      initiatives,
      layout: sanitizedLayout
    };
  }, [artifacts, domains, experts, initiatives, layout, modules]);

  const handleExport = () => {
    if (fileTransferOptions.size === 0) {
      setStatus({ type: 'error', message: 'Выберите типы данных для экспорта.' });
      return;
    }

    try {
      const snapshot = filterSnapshotByScope(buildSnapshot(), fileTransferOptions);
      const data = JSON.stringify(snapshot, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = snapshot.exportedAt?.replace(/[:.]/g, '-') ?? 'snapshot';
      link.href = url;
      link.download = `graph-snapshot-${timestamp}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus({ type: 'success', message: 'Экспорт выполнен. Файл сохранён.' });
    } catch {
      setStatus({ type: 'error', message: 'Не удалось сформировать файл экспорта.' });
    }
  };

  const handleTriggerImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result;
        if (typeof text !== 'string') {
          throw new Error('Неверный формат файла');
        }

        const parsed = JSON.parse(text);
        if (!isGraphSnapshotLike(parsed)) {
          throw new Error('Файл не соответствует структуре графа');
        }

        if (fileTransferOptions.size === 0) {
          throw new Error('Выберите хотя бы один тип данных для импорта.');
        }

        const normalized = normalizeImportedSnapshot(parsed);
        const filtered = filterSnapshotByScope(normalized, fileTransferOptions);

        onImport(filtered);
        const moduleCount = filtered.modules.length;
        const domainCount = filtered.domains.length;
        const artifactCount = filtered.artifacts.length;
        const expertCount = filtered.experts?.length ?? 0;
        const initiativeCount = filtered.initiatives?.length ?? 0;
        setStatus({
          type: 'success',
          message:
            `Импорт завершён. Модулей: ${moduleCount}, доменов: ${domainCount}, артефактов: ${artifactCount}, сотрудников: ${expertCount}, инициатив: ${initiativeCount}.`
        });
      } catch (error) {
        setStatus({
          type: 'error',
          message:
            error instanceof Error ? error.message : 'Не удалось прочитать данные из файла.'
        });
      }
    };
    reader.onerror = () => {
      setStatus({ type: 'error', message: 'Ошибка чтения файла.' });
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const availableGraphs = useMemo(() => {
    if (!graphs || graphs.length === 0) {
      return [] as GraphSummary[];
    }
    return graphs.filter((graph) => graph.id !== activeGraphId);
  }, [graphs, activeGraphId]);

  const sourceGraph = useMemo(
    () => graphs?.find((graph) => graph.id === sourceGraphId) ?? null,
    [graphs, sourceGraphId]
  );

  const graphOptions = useMemo(
    () =>
      availableGraphs.map((graph) => ({
        label: graph.isDefault ? `${graph.name} • основной` : graph.name,
        value: graph.id
      })),
    [availableGraphs]
  );

  const selectedGraphOption = useMemo(
    () => graphOptions.find((option) => option.value === sourceGraphId) ?? null,
    [graphOptions, sourceGraphId]
  );

  const dataScopeItems = useMemo(
    () =>
      [
        { id: 'domains' as const, label: 'Домены' },
        { id: 'modules' as const, label: 'Модули' },
        { id: 'artifacts' as const, label: 'Артефакты' },
        { id: 'experts' as const, label: 'Сотрудники' },
        { id: 'initiatives' as const, label: 'Инициативы' }
      ],
    []
  );

  const selectedCopyOptionItems = useMemo(
    () => dataScopeItems.filter((item) => copyOptions.has(item.id)),
    [dataScopeItems, copyOptions]
  );

  const selectedTransferOptionItems = useMemo(
    () => dataScopeItems.filter((item) => fileTransferOptions.has(item.id)),
    [dataScopeItems, fileTransferOptions]
  );

  const isFileTransferSelectionEmpty = fileTransferOptions.size === 0;

  const isCopySectionAvailable = Boolean(onImportFromGraph) && graphOptions.length > 0;
  const canImportFromGraph =
    Boolean(onImportFromGraph) && Boolean(sourceGraphId) && copyOptions.size > 0;

  useEffect(() => {
    if (!sourceGraphId) {
      return;
    }

    if (!graphOptions.some((option) => option.value === sourceGraphId)) {
      setSourceGraphId(null);
    }
  }, [graphOptions, sourceGraphId]);

  const handleImportFromGraphClick = useCallback(async () => {
    if (!onImportFromGraph || !sourceGraphId || copyOptions.size === 0) {
      return;
    }

    setIsGraphImporting(true);
    try {
      const result = await onImportFromGraph({
        graphId: sourceGraphId,
        includeDomains: copyOptions.has('domains'),
        includeModules: copyOptions.has('modules'),
        includeArtifacts: copyOptions.has('artifacts'),
        includeExperts: copyOptions.has('experts'),
        includeInitiatives: copyOptions.has('initiatives')
      });
      const graphName = graphs?.find((graph) => graph.id === sourceGraphId)?.name ?? 'выбранного графа';
      setStatus({
        type: 'success',
        message:
          `Импорт завершён из графа «${graphName}». Модулей: ${result.modules}, доменов: ${result.domains}, артефактов: ${result.artifacts}, сотрудников: ${result.experts}, инициатив: ${result.initiatives}.`
      });
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Не удалось импортировать данные из выбранного графа.'
      });
    } finally {
      setIsGraphImporting(false);
    }
  }, [onImportFromGraph, sourceGraphId, copyOptions, graphs]);

  const handleGraphSelectChange = (value: { label: string; value: string } | null) => {
    const item = value;
    const selectedId = item?.value ?? null;
    setSelectedGraphId(selectedId);
    setFallbackGraphOption(item);
    if (onGraphSelect) {
      onGraphSelect(selectedId);
    }
  };

  const graphsOptions = useMemo(
    () =>
      graphs?.map((graph) => ({
        label: graph.isDefault ? `${graph.name} • основной` : graph.name,
        value: graph.id
      })) ?? [],
    [graphs]
  );

  const [fallbackGraphOption, setFallbackGraphOption] = useState<{ label: string; value: string } | null>(null);

  const currentGraphOption = useMemo(
    () =>
      graphsOptions.find((option) => option.value === (selectedGraphId ?? activeGraphId)) ??
      fallbackGraphOption,
    [graphsOptions, activeGraphId, fallbackGraphOption, selectedGraphId]
  );

  useEffect(() => {
    if (!activeGraphId) {
      setFallbackGraphOption(null);
      setSelectedGraphId(null);
      return;
    }

    // Синхронизируем только если selectedGraphId не совпадает с activeGraphId
    // Это позволяет пользователю выбирать граф без немедленного перезаписывания
    if (selectedGraphId === activeGraphId) {
      return;
    }

    const option = graphsOptions.find((item) => item.value === activeGraphId);
    if (option) {
      setFallbackGraphOption(option);
      setSelectedGraphId(option.value);
      return;
    }

    if (!fallbackGraphOption || fallbackGraphOption.value !== activeGraphId) {
      setFallbackGraphOption({ label: 'Выбранный граф', value: activeGraphId });
    }
    setSelectedGraphId(activeGraphId);
  }, [activeGraphId, graphsOptions]);

  const formattedLastUpdated = useMemo(() => {
    if (!lastUpdated) {
      return null;
    }

    const date = new Date(lastUpdated);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date.toLocaleString('ru-RU');
  }, [lastUpdated]);

  return (
    <section className={styles.wrapper} aria-label="Управление графами">
      <div className={styles.topBar}>
        <div className={styles.selectorGroup}>
          <Select<{ label: string; value: string }>
            size="s"
            items={graphsOptions}
            value={currentGraphOption}
            placeholder={isGraphListLoading ? 'Загрузка...' : currentGraphOption ? undefined : 'Выберите граф'}
            getItemLabel={(item) => item.label}
            getItemKey={(item) => item.value}
            disabled={isGraphListLoading || isReloading}
            onChange={handleGraphSelectChange}
            className={styles.graphSelect}
          />
          {activeGraphId && (
            <div className={styles.graphActions}>
              {onGraphCreate && (
                <Button
                  size="s"
                  view="clear"
                  iconLeft={IconAdd}
                  onlyIcon
                  onClick={onGraphCreate}
                  title="Создать новый граф"
                />
              )}
              {onGraphDelete && (
                <Button
                  size="s"
                  view="clear"
                  status="alert"
                  iconLeft={IconTrash}
                  onlyIcon
                  onClick={onGraphDelete}
                  title="Удалить текущий граф"
                />
              )}
            </div>
          )}
          {!activeGraphId && onGraphCreate && (
            <Button size="s" view="secondary" label="Создать граф" onClick={onGraphCreate} />
          )}
        </div>

        <div className={styles.syncStatus}>
          {syncStatus && (
            <Text
              size="xs"
              view={
                syncStatus.state === 'error'
                  ? 'alert'
                  : syncStatus.state === 'saving'
                    ? 'ghost'
                    : 'secondary'
              }
            >
              {syncStatus.message ??
                (syncStatus.state === 'saving'
                  ? 'Сохранение...'
                  : syncStatus.state === 'error'
                    ? 'Ошибка'
                    : 'Синхронизировано')}
            </Text>
          )}
          {activeGraphId && isSyncAvailable && onRetryLoad && (
            <Button
              size="xs"
              view="clear"
              iconLeft={IconRestart}
              onlyIcon
              loading={isReloading}
              onClick={onRetryLoad}
              title="Перезагрузить данные"
            />
          )}
        </div>
      </div>

      <div className={styles.header}>
        <Text size="s" weight="semibold">
          Импорт и экспорт графа
        </Text>
        <Text size="xs" view="secondary">
          Сохраните текущие данные в файл JSON или загрузите ранее выгруженный граф.
        </Text>
        {formattedLastUpdated && (
          <Text size="xs" view="secondary">
            Последнее обновление: {formattedLastUpdated}
          </Text>
        )}
      </div>

      <div className={styles.transferSection}>
        <div className={styles.transferOptions}>
          <Text size="xs" view="secondary">
            Выберите типы данных для экспорта и импорта из файла JSON.
          </Text>
          <CheckboxGroup
            size="s"
            direction="row"
            items={dataScopeItems}
            value={selectedTransferOptionItems}
            getItemKey={(item) => item.id}
            getItemLabel={(item) => item.label}
            onChange={(items) => {
              setFileTransferOptions(new Set((items ?? []).map((item) => item.id)));
            }}
          />
          <Text size="xs" view="secondary">
            Даже если в файле присутствуют все сущности, будут загружены только выбранные.
          </Text>
        </div>
        <div className={styles.actions}>
          <Button
            size="s"
            view="secondary"
            label="Экспорт в JSON"
            onClick={handleExport}
            disabled={isFileTransferSelectionEmpty}
          />
          <Button
            size="s"
            view="primary"
            label="Импорт из файла"
            onClick={handleTriggerImport}
            disabled={isFileTransferSelectionEmpty}
          />
          {onForceSave && (
            <Button
              size="s"
              view="ghost"
              label="Сохранить в хранилище"
              onClick={onForceSave}
              disabled={!isSyncAvailable}
            />
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {isCopySectionAvailable && (
        <div className={styles.copySection}>
          <div className={styles.copyHeader}>
            <Text size="s" weight="semibold">
              Импорт из другого графа
            </Text>
            <Text size="xs" view="secondary">
              Скопируйте полные наборы сущностей из доступных графов. Поштучный выбор не требуется.
            </Text>
          </div>
          <div className={styles.copyControls}>
            <Select<{ label: string; value: string }>
              size="s"
              items={graphOptions}
              value={selectedGraphOption}
              placeholder={
                isGraphListLoading ? 'Загрузка графов...' : 'Выберите граф-источник'
              }
              getItemLabel={(item) => item.label}
              getItemKey={(item) => item.value}
              disabled={isGraphListLoading || graphOptions.length === 0 || isGraphImporting}
              onChange={({ value }) => {
                setSourceGraphId(value?.value ?? null);
              }}
              style={{ minWidth: 220 }}
            />
            {sourceGraph && (
              <Badge
                className={styles.copyBadge}
                size="xs"
                view="filled"
                status={sourceGraph.isDefault ? 'success' : 'system'}
                label={
                  sourceGraph.isDefault
                    ? `Источник: ${sourceGraph.name} • основной`
                    : `Источник: ${sourceGraph.name}`
                }
              />
            )}
            <div className={styles.copyOptions}>
              <CheckboxGroup
                size="s"
                direction="row"
                items={dataScopeItems}
                value={selectedCopyOptionItems}
                getItemKey={(item) => item.id}
                getItemLabel={(item) => item.label}
                disabled={!sourceGraphId || isGraphImporting}
                onChange={(items) => {
                  setCopyOptions(new Set((items ?? []).map((item) => item.id)));
                }}
              />
              <Text size="xs" view="secondary">
                {sourceGraphId
                  ? 'Будут скопированы только выбранные типы данных.'
                  : 'Выберите граф-источник, чтобы включить параметры копирования.'}
              </Text>
            </div>
            <Button
              size="s"
              view="primary"
              label="Скопировать данные"
              onClick={() => {
                void handleImportFromGraphClick();
              }}
              disabled={!canImportFromGraph || isGraphImporting}
              loading={isGraphImporting}
            />
          </div>
          {!graphOptions.length && !isGraphListLoading && (
            <Text size="xs" view="secondary">
              Нет других графов для импорта. Создайте новый граф, чтобы копировать данные.
            </Text>
          )}
        </div>
      )}
      {status && (
        <Text
          size="xs"
          className={`${styles.status} ${
            status.type === 'success' ? styles.statusSuccess : styles.statusError
          }`}
        >
          {status.message}
        </Text>
      )}
      {syncStatus && (
        <Text
          size="xs"
          className={`${styles.status} ${
            syncStatus.state === 'error'
              ? styles.statusError
              : syncStatus.state === 'saving'
                ? styles.statusInProgress
                : styles.statusSecondary
          }`}
        >
          {syncStatus.message ??
            (syncStatus.state === 'saving'
              ? 'Сохраняем изменения в хранилище...'
              : syncStatus.state === 'error'
                ? 'Не удалось синхронизировать данные.'
                : 'Все изменения синхронизированы.')}
        </Text>
      )}
    </section>
  );
};

type GraphSnapshotLike = {
  version?: number;
  exportedAt?: string;
  modules: ModuleNode[];
  domains: DomainNode[];
  artifacts: ArtifactNode[];
  experts?: ExpertProfile[];
  initiatives?: Initiative[];
  layout?: GraphSnapshotPayload['layout'];
  scopesIncluded?: GraphDataScope[];
};

function isGraphSnapshotLike(value: unknown): value is GraphSnapshotLike {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<GraphSnapshotPayload>;
  if (
    !Array.isArray(candidate.modules) ||
    !Array.isArray(candidate.domains) ||
    !Array.isArray(candidate.artifacts) ||
    (candidate.experts !== undefined && !Array.isArray(candidate.experts)) ||
    (candidate.initiatives !== undefined && !Array.isArray(candidate.initiatives))
  ) {
    return false;
  }

  if (candidate.experts !== undefined && !Array.isArray(candidate.experts)) {
    return false;
  }

  if (candidate.initiatives !== undefined && !Array.isArray(candidate.initiatives)) {
    return false;
  }

  if (candidate.version !== undefined && typeof candidate.version !== 'number') {
    return false;
  }

  return true;
}

function filterSnapshotByScope(
  snapshot: GraphSnapshotPayload,
  scopes: Set<GraphDataScope>
): GraphSnapshotPayload {
  const includeDomains = scopes.has('domains');
  const includeModules = scopes.has('modules');
  const includeArtifacts = scopes.has('artifacts');
  const includeExperts = scopes.has('experts');
  const includeInitiatives = scopes.has('initiatives');

  const allowedNodeIds = new Set<string>();

  if (includeDomains) {
    snapshot.domains.forEach((domain) => allowedNodeIds.add(domain.id));
  }

  if (includeModules) {
    snapshot.modules.forEach((module) => allowedNodeIds.add(module.id));
  }

  if (includeArtifacts) {
    snapshot.artifacts.forEach((artifact) => allowedNodeIds.add(artifact.id));
  }

  if (includeInitiatives) {
    snapshot.initiatives?.forEach((initiative) => allowedNodeIds.add(initiative.id));
  }

  const filteredLayout =
    snapshot.layout && allowedNodeIds.size > 0
      ? filterLayoutByNodes(snapshot.layout, allowedNodeIds)
      : undefined;

  return {
    version: snapshot.version,
    exportedAt: snapshot.exportedAt,
    domains: includeDomains ? snapshot.domains : [],
    modules: includeModules ? snapshot.modules : [],
    artifacts: includeArtifacts ? snapshot.artifacts : [],
    experts: includeExperts ? snapshot.experts ?? [] : [],
    initiatives: includeInitiatives ? snapshot.initiatives ?? [] : [],
    layout: filteredLayout,
    scopesIncluded: Array.from(scopes)
  };
}

function filterLayoutByNodes(
  layout: GraphLayoutSnapshot,
  allowedNodeIds: Set<string>
): GraphLayoutSnapshot | undefined {
  const filteredEntries = Object.entries(layout.nodes ?? {}).reduce<
    GraphLayoutSnapshot['nodes']
  >((acc, [id, position]) => {
    if (allowedNodeIds.has(id)) {
      acc[id] = position;
    }
    return acc;
  }, {});

  if (Object.keys(filteredEntries).length === 0) {
    return undefined;
  }

  return { nodes: filteredEntries };
}

function normalizeImportedSnapshot(snapshot: GraphSnapshotLike): GraphSnapshotPayload {
  const scopes = snapshot.scopesIncluded ?? [];
  const validScopes = Array.isArray(scopes)
    ? scopes.filter((scope): scope is GraphDataScope =>
        scope === 'domains' ||
        scope === 'modules' ||
        scope === 'artifacts' ||
        scope === 'experts' ||
        scope === 'initiatives'
      )
    : [];

  return {
    version:
      typeof snapshot.version === 'number' && Number.isFinite(snapshot.version)
        ? snapshot.version
        : GRAPH_SNAPSHOT_VERSION,
    exportedAt: typeof snapshot.exportedAt === 'string' ? snapshot.exportedAt : undefined,
    modules: snapshot.modules,
    domains: snapshot.domains,
    artifacts: snapshot.artifacts,
    experts: snapshot.experts ?? undefined,
    initiatives: snapshot.initiatives ?? [],
    layout: normalizeLayoutSnapshot(snapshot.layout) ?? undefined,
    scopesIncluded: validScopes.length ? validScopes : undefined
  };
}

export default GraphPersistenceControls;
