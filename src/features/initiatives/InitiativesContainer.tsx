import { motion, type Variants } from 'framer-motion';

import InitiativePlanner from '../../components/InitiativePlanner';
import styles from '../../App.module.css';
import type { DomainNode, ExpertProfile, Initiative, InitiativeRolePlan, ModuleNode } from '../../data';
import type { InitiativeCreationRequest } from '../../types/initiativeCreation';
import type { TaskListItem } from '../../types/tasks';

export type InitiativesContainerProps = {
  isActive: boolean;
  pageVariants: Variants;
  initiatives: Initiative[];
  experts: ExpertProfile[];
  domains: DomainNode[];
  modules: ModuleNode[];
  domainNameMap: Record<string, string>;
  employeeTasks: TaskListItem[];
  onTogglePin: (id: string) => void;
  onAddRisk: (initiativeId: string, risk: InitiativeRolePlan) => void;
  onRemoveRisk: (initiativeId: string, index: number) => void;
  onStatusChange: (initiativeId: string, status: Initiative['status']) => void;
  onExport: (initiativeId: string) => void;
  onCreateInitiative: (request: InitiativeCreationRequest) => Initiative;
  onUpdateInitiative: (initiativeId: string, request: InitiativeCreationRequest) => Initiative;
};

export function InitiativesContainer({
  isActive,
  pageVariants,
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
}: InitiativesContainerProps) {
  return (
    <motion.main
      className={styles.initiativesMain}
      initial="hidden"
      animate={isActive ? 'visible' : 'hidden'}
      variants={pageVariants}
    >
      <InitiativePlanner
        initiatives={initiatives}
        experts={experts}
        domains={domains}
        modules={modules}
        domainNameMap={domainNameMap}
        employeeTasks={employeeTasks}
        onTogglePin={onTogglePin}
        onAddRisk={onAddRisk}
        onRemoveRisk={onRemoveRisk}
        onStatusChange={onStatusChange}
        onExport={onExport}
        onCreateInitiative={onCreateInitiative}
        onUpdateInitiative={onUpdateInitiative}
      />
    </motion.main>
  );
}
