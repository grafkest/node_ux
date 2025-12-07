import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import { flattenDomainTree } from '../utils/domain';
import { domainTree as initialDomainTree } from '../data';
import type { ModuleStatus } from '../types/module';
import type { GraphNode } from '../features/graph/components/GraphView';

type FilterContextValue = {
  search: string;
  setSearch: (value: string) => void;
  statusFilters: Set<ModuleStatus>;
  setStatusFilters: (updater: Set<ModuleStatus> | ((prev: Set<ModuleStatus>) => Set<ModuleStatus>)) => void;
  productFilter: string[];
  setProductFilter: (updater: string[] | ((prev: string[]) => string[])) => void;
  companyFilter: string | null;
  setCompanyFilter: (value: string | null) => void;
  selectedDomains: Set<string>;
  setSelectedDomains: (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  showAllConnections: boolean;
  setShowAllConnections: (value: boolean) => void;
  selectedNode: GraphNode | null;
  setSelectedNode: (node: GraphNode | null) => void;
};

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: PropsWithChildren) {
  const [search, setSearch] = useState('');
  const [statusFilters, setStatusFilters] = useState<Set<ModuleStatus>>(new Set());
  const [productFilter, setProductFilter] = useState<string[]>([]);
  const [companyFilter, setCompanyFilter] = useState<string | null>(null);
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(
    () => new Set(flattenDomainTree(initialDomainTree).map((domain) => domain.id))
  );
  const [showAllConnections, setShowAllConnections] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  const value = useMemo<FilterContextValue>(
    () => ({
      search,
      setSearch,
      statusFilters,
      setStatusFilters,
      productFilter,
      setProductFilter,
      companyFilter,
      setCompanyFilter,
      selectedDomains,
      setSelectedDomains,
      showAllConnections,
      setShowAllConnections,
      selectedNode,
      setSelectedNode
    }),
    [
      companyFilter,
      productFilter,
      search,
      selectedDomains,
      selectedNode,
      showAllConnections,
      statusFilters
    ]
  );

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useFilters() {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error('useFilters must be used within a FilterProvider');
  }

  return context;
}
