import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Text } from '@consta/uikit/Text';
import { Button } from '@consta/uikit/Button';
import { Select } from '@consta/uikit/Select';
import { Badge } from '@consta/uikit/Badge';
import { IconNodes } from '@consta/icons/IconNodes';
import { IconLineAndBarChart } from '@consta/icons/IconLineAndBarChart';
import { IconUser } from '@consta/icons/IconUser';
import { IconFlagFilled } from '@consta/icons/IconFlagFilled';
import { IconCheck } from '@consta/icons/IconCheck';
import { IconSettings } from '@consta/icons/IconSettings';
import { IconMoon } from '@consta/icons/IconMoon';
import { IconSun } from '@consta/icons/IconSun';
import { IconHamburger } from '@consta/icons/IconHamburger';
import { IconClose } from '@consta/icons/IconClose';
import { IconArrowLeft } from '@consta/icons/IconArrowLeft';
import { IconArrowRight } from '@consta/icons/IconArrowRight';
import type { GraphSummary } from '../types/graph';
import styles from './LayoutShell.module.css';

type ViewMode = 'graph' | 'stats' | 'experts' | 'initiatives' | 'employee-tasks' | 'admin';
type ThemeMode = 'light' | 'dark';

interface LayoutShellProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  headerTitle: string;
  headerDescription?: string;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
  themeMode: ThemeMode;
  onSetThemeMode: (mode: ThemeMode) => void;
  graphs?: GraphSummary[];
  activeGraphId?: string | null;
  onGraphSelect?: (graphId: string | null) => void;
  onGraphCreate?: () => void;
  onGraphDelete?: (graphId: string) => void;
  isGraphListLoading?: boolean;
  graphListError?: string | null;
}

const MENU_ITEMS: Array<{
  id: ViewMode;
  label: string;
  icon: React.ElementType;
}> = [
  { id: 'graph', label: 'Граф', icon: IconNodes },
  { id: 'stats', label: 'Статистика', icon: IconLineAndBarChart },
  { id: 'experts', label: 'Экспертиза', icon: IconUser },
  { id: 'initiatives', label: 'Инициативы', icon: IconFlagFilled },
  { id: 'employee-tasks', label: 'Задачи', icon: IconCheck },
  { id: 'admin', label: 'Администрирование', icon: IconSettings },
];

const SIDEBAR_WIDTH = 280;
const SIDEBAR_WIDTH_COLLAPSED = 80;
const MOBILE_BREAKPOINT = 768;

export const LayoutShell: React.FC<LayoutShellProps> = ({
  currentView,
  onViewChange,
  headerTitle,
  headerDescription,
  headerActions,
  children,
  themeMode,
  onSetThemeMode,
  graphs,
  activeGraphId,
  onGraphSelect,
  onGraphCreate,
  onGraphDelete,
  isGraphListLoading = false,
  graphListError = null,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const graphDropdownRef = useRef<HTMLDivElement | null>(null);
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);

  useEffect(() => {
    const updateSidebarOffset = () => {
      const isMobile = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
      const width = isMobile ? 0 : isCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH;
      document.documentElement.style.setProperty('--layout-sidebar-offset', `${width}px`);
    };

    updateSidebarOffset();

    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    mediaQuery.addEventListener('change', updateSidebarOffset);

    return () => {
      mediaQuery.removeEventListener('change', updateSidebarOffset);
    };
  }, [isCollapsed]);

  const handleViewChange = (view: ViewMode) => {
    onViewChange(view);
    setIsMobileMenuOpen(false);
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

  const activeGraph = useMemo(
    () => graphs?.find((graph) => graph.id === activeGraphId),
    [graphs, activeGraphId]
  );

  React.useEffect(() => {
    if (!activeGraphId) {
      setFallbackGraphOption(null);
      setSelectedGraphId(null);
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

  const handleGraphSelectChange = (value: { label: string; value: string } | null) => {
    const item = value;
    if (onGraphSelect) {
      onGraphSelect(item?.value ?? null);
    }
    setSelectedGraphId(item?.value ?? null);
    setFallbackGraphOption(item);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className={styles.root}>
      <aside className={`${styles.sidebar} ${isMobileMenuOpen ? styles.sidebarOpen : ''} ${isCollapsed ? styles.sidebarCollapsed : ''}`}>
        <div className={styles.sidebarHeader}>
          {!isCollapsed && (
            <Text size="l" weight="bold" view="primary" className={styles.logoText}>
              Nedra.Expert Node
            </Text>
          )}
          <Button 
             className={styles.collapseButton}
             view="clear"
             size="s"
             onlyIcon
             iconLeft={isCollapsed ? IconArrowRight : IconArrowLeft}
             onClick={() => setIsCollapsed(!isCollapsed)}
          />
          <button 
            className={styles.mobileCloseButton}
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Закрыть меню"
          >
             <IconClose size="s" />
          </button>
        </div>
        
        <nav className={styles.sidebarContent}>
          {MENU_ITEMS.map((item) => {
            const isActive = currentView === item.id;
            return (
              <Button
                key={item.id}
                view={isActive ? 'primary' : 'ghost'}
                size="m"
                width="full"
                iconLeft={item.icon}
                label={!isCollapsed ? item.label : undefined}
                onlyIcon={isCollapsed}
                className={styles.menuButton}
                onClick={() => handleViewChange(item.id)}
              />
            );
          })}
        </nav>
        
        {!isCollapsed && (
          <div className={styles.graphSection}>
            <Text size="xs" weight="semibold" view="secondary" className={styles.graphSectionTitle}>
              Граф
            </Text>
            {activeGraph && (
              <Badge
                size="s"
                view="filled"
                status="success"
                label={activeGraph.isDefault ? 'Основной граф' : activeGraph.name}
                className={styles.graphBadge}
              />
            )}
            <Select<{ label: string; value: string }>
              size="s"
              items={graphsOptions}
              value={currentGraphOption}
              placeholder={isGraphListLoading ? 'Загрузка...' : currentGraphOption ? undefined : 'Выберите граф'}
              getItemLabel={(item) => item.label}
              getItemKey={(item) => item.value}
              disabled={isGraphListLoading}
              onChange={handleGraphSelectChange}
              className={styles.graphSelect}
              dropdownRef={graphDropdownRef}
              dropdownClassName={styles.graphSelectDropdown}
            />
            {graphListError && (
              <Text size="xs" view="alert">
                {graphListError}
              </Text>
            )}
            <div className={styles.graphActions}>
              {onGraphCreate && (
                <Button
                  size="s"
                  view="secondary"
                  width="full"
                  label="Создать граф"
                  onClick={onGraphCreate}
                />
              )}
              {activeGraphId && onGraphDelete && !activeGraph?.isDefault && (
                <Button
                  size="s"
                  view="ghost"
                  width="full"
                  label="Удалить граф"
                  onClick={() => onGraphDelete(activeGraphId)}
                />
              )}
            </div>
          </div>
        )}
        
        {!isCollapsed && (
          <div className={styles.sidebarFooter}>
            <div className={styles.themeRow}>
              <Text size="xs" view="secondary">Тема</Text>
              <div className={styles.themeButtons}>
                <Button
                  size="xs"
                  view={themeMode === 'light' ? 'primary' : 'ghost'}
                  iconLeft={IconSun}
                  label="Светлая"
                  onClick={() => onSetThemeMode('light')}
                />
                <Button
                  size="xs"
                  view={themeMode === 'dark' ? 'primary' : 'ghost'}
                  iconLeft={IconMoon}
                  label="Темная"
                  onClick={() => onSetThemeMode('dark')}
                />
              </div>
            </div>
            <Text size="xs" view="secondary">
              v0.1.0
            </Text>
          </div>
        )}
      </aside>

      {isMobileMenuOpen && (
        <div className={styles.overlay} onClick={() => setIsMobileMenuOpen(false)} />
      )}

      <div className={styles.mainContent}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <button 
              className={styles.mobileMenuButton}
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Открыть меню"
            >
              <IconHamburger size="s" />
            </button>
            <div className={styles.headerTitle}>
              <Text size="xl" weight="bold">
                {headerTitle}
              </Text>
              {headerDescription && (
                <Text size="xs" view="secondary" className={styles.headerDescription}>
                  {headerDescription}
                </Text>
              )}
            </div>
          </div>
          <div className={styles.headerActions}>
            {headerActions}
          </div>
        </header>
        
        <main className={styles.pageContent}>
          {children}
        </main>
      </div>
    </div>
  );
};
