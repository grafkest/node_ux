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
import type { ExpertProfile, GraphLayoutNodePosition } from '../../types/graph';
import type { ModuleStatus } from '../../types/module';

export type GraphContainerProps = {
  isActive: boolean;
  pageVariants: Variants;
  sidebarRef: RefObject<HTMLDivElement>;
  sidebarMaxHeight: number | null;
  isDomainTreeOpen: boolean;
  onToggleDomainTree: () => void;
  areFiltersOpen: boolean;
  onToggleFilters: () => void;
  domainData: DomainNode[];
  selectedDomains: Set<string>;
  onToggleDomain: (id: string) => void;
  domainDescendants: Map<string, string[]>;
  search: string;
  onSearchChange: (value: string) => void;
  allStatuses: ModuleStatus[];
  statusFilters: Set<ModuleStatus>;
  onStatusToggle: (status: ModuleStatus) => void;
  products: string[];
  productFilter: string[];
  onProductFilterChange: (products: string[]) => void;
  companies: string[];
  companyFilter: string | null;
  onCompanyChange: (value: string | null) => void;
  showAllConnections: boolean;
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
  layoutPositions: Record<string, GraphLayoutNodePosition>;
  layoutNormalizationRequest: number;
  onLayoutChange: (positions: Record<string, GraphLayoutNodePosition>) => void;
  shouldShowAnalytics: boolean;
  filteredModules: ModuleNode[];
  domainNameMap: Record<string, string>;
  moduleNameMap: Record<string, string>;
  artifactNameMap: Record<string, string>;
  expertProfiles: ExpertProfile[];
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
  domainData,
  selectedDomains,
  onToggleDomain,
  domainDescendants,
  search,
  onSearchChange,
  allStatuses,
  statusFilters,
  onStatusToggle,
  products,
  productFilter,
  onProductFilterChange,
  companies,
  companyFilter,
  onCompanyChange,
  showAllConnections,
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
  layoutPositions,
  layoutNormalizationRequest,
  onLayoutChange,
  shouldShowAnalytics,
  filteredModules,
  domainNameMap,
  moduleNameMap,
  artifactNameMap,
  expertProfiles,
  onNavigate
}: GraphContainerProps) {
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
