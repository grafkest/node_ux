import { motion, type Variants } from 'framer-motion';
import { type CSSProperties, type RefObject } from 'react';
import { Collapse } from '@consta/uikit/Collapse';
import { Text } from '@consta/uikit/Text';

import AnalyticsPanel from '../../components/AnalyticsPanel';
import DomainTree from '../../components/DomainTree';
import FiltersPanel from '../../components/FiltersPanel';
import GraphView, { type GraphNode } from '../../components/GraphView';
import NodeDetails from '../../components/NodeDetails';
import styles from '../../App.module.css';
import type { ArtifactNode, DomainNode, GraphLink, Initiative, ModuleNode } from '../../data';
import type { GraphLayoutNodePosition } from '../../types/graph';
import type { ModuleStatus } from '../../types/module';
import { useGraph } from '../../context/GraphContext';

export type GraphContainerProps = {
  isActive: boolean;
  pageVariants: Variants;
  sidebarRef: RefObject<HTMLDivElement>;
  sidebarMaxHeight: number | null;
  isDomainTreeOpen: boolean;
  onToggleDomainTree: () => void;
  areFiltersOpen: boolean;
  onToggleFilters: () => void;
  onToggleDomain: (id: string) => void;
  domainDescendants: Map<string, string[]>;
  onSearchChange: (value: string) => void;
  allStatuses: ModuleStatus[];
  onStatusToggle: (status: ModuleStatus) => void;
  products: string[];
  onProductFilterChange: (products: string[]) => void;
  companies: string[];
  onCompanyChange: (value: string | null) => void;
  onToggleConnections: (value: boolean) => void;
  graphModules: ModuleNode[];
  graphDomains: DomainNode[];
  graphArtifacts: ArtifactNode[];
  graphInitiatives: Initiative[];
  filteredLinks: GraphLink[];
  graphVersion: string;
  onSelectNode: (node: GraphNode | null) => void;
  selectedNode: GraphNode | null;
  visibleDomainIds: Set<string>;
  onLayoutChange: (positions: Record<string, GraphLayoutNodePosition>) => void;
  shouldShowAnalytics: boolean;
  filteredModules: ModuleNode[];
  domainNameMap: Record<string, string>;
  moduleNameMap: Record<string, string>;
  artifactNameMap: Record<string, string>;
  onNavigate: (nodeId: string) => void;
};

export function GraphContainer({
  isActive,
  pageVariants,
  sidebarRef,
  sidebarMaxHeight,
  isDomainTreeOpen,
  onToggleDomainTree,
  areFiltersOpen,
  onToggleFilters,
  onToggleDomain,
  domainDescendants,
  onSearchChange,
  allStatuses,
  onStatusToggle,
  products,
  onProductFilterChange,
  companies,
  onCompanyChange,
  onToggleConnections,
  graphModules,
  graphDomains,
  graphArtifacts,
  graphInitiatives,
  filteredLinks,
  graphVersion,
  onSelectNode,
  selectedNode,
  visibleDomainIds,
  onLayoutChange,
  shouldShowAnalytics,
  filteredModules,
  domainNameMap,
  moduleNameMap,
  artifactNameMap,
  onNavigate
}: GraphContainerProps) {
  const {
    domainData,
    selectedDomains,
    search,
    statusFilters,
    productFilter,
    companyFilter,
    showAllConnections,
    layoutPositions,
    layoutNormalizationRequest,
    expertProfiles
  } = useGraph();
  return (
    <motion.main
      className={styles.main}
      initial="hidden"
      animate={isActive ? 'visible' : 'hidden'}
      variants={pageVariants}
    >
      <aside
        ref={sidebarRef}
        className={styles.sidebar}
        style={
          sidebarMaxHeight
            ? ({ '--sidebar-max-height': `${sidebarMaxHeight}px` } as CSSProperties)
            : undefined
        }
      >
        <div className={styles.sidebarScrollArea}>
          <Collapse
            label={
              <Text size="s" weight="semibold">
                Домены
              </Text>
            }
            isOpen={isDomainTreeOpen}
            onClick={onToggleDomainTree}
            className={styles.domainCollapse}
          >
            <div className={styles.domainCollapseContent}>
              {isDomainTreeOpen ? (
                <DomainTree
                  tree={domainData}
                  selected={selectedDomains}
                  onToggle={onToggleDomain}
                  descendants={domainDescendants}
                />
              ) : null}
            </div>
          </Collapse>
          <Collapse
            label={
              <Text size="s" weight="semibold">
                Фильтры
              </Text>
            }
            isOpen={areFiltersOpen}
            onClick={onToggleFilters}
            className={styles.filtersCollapse}
          >
            <div className={styles.filtersCollapseContent}>
              <FiltersPanel
                search={search}
                onSearchChange={onSearchChange}
                statuses={allStatuses}
                activeStatuses={statusFilters}
                onToggleStatus={onStatusToggle}
                products={products}
                productFilter={productFilter}
                onProductChange={onProductFilterChange}
                companies={companies}
                companyFilter={companyFilter}
                onCompanyChange={onCompanyChange}
                showAllConnections={showAllConnections}
                onToggleConnections={onToggleConnections}
              />
            </div>
          </Collapse>
        </div>
      </aside>
      <section className={styles.graphSection}>
        <div className={styles.graphContainer}>
          <GraphView
            modules={graphModules}
            domains={graphDomains}
            artifacts={graphArtifacts}
            initiatives={graphInitiatives}
            links={filteredLinks}
            graphVersion={graphVersion}
            onSelect={onSelectNode}
            highlightedNode={selectedNode?.id ?? null}
            visibleDomainIds={visibleDomainIds}
            visibleModuleStatuses={statusFilters}
            layoutPositions={layoutPositions}
            normalizationRequest={layoutNormalizationRequest}
            onLayoutChange={onLayoutChange}
          />
        </div>
        {shouldShowAnalytics && (
          <div className={styles.analytics}>
            <AnalyticsPanel modules={filteredModules} domainNameMap={domainNameMap} />
          </div>
        )}
      </section>
      <aside className={styles.details}>
        <NodeDetails
          node={selectedNode}
          onClose={() => onSelectNode(null)}
          onNavigate={onNavigate}
          moduleNameMap={moduleNameMap}
          artifactNameMap={artifactNameMap}
          domainNameMap={domainNameMap}
          expertProfiles={expertProfiles}
        />
      </aside>
    </motion.main>
  );
}
