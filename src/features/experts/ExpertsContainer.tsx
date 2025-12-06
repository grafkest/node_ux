import { motion, type Variants } from 'framer-motion';

import ExpertExplorer from '../../components/ExpertExplorer';
import styles from '../../App.module.css';
import type { ExpertSkill, Initiative, ModuleNode } from '../../data';
import type { ExpertProfile } from '../../types/graph';

export type ExpertsContainerProps = {
  isActive: boolean;
  pageVariants: Variants;
  experts: ExpertProfile[];
  modules: ModuleNode[];
  moduleNameMap: Record<string, string>;
  moduleDomainMap: Record<string, string[]>;
  domainNameMap: Record<string, string>;
  initiatives: Initiative[];
  onUpdateExpertSkills: (expertId: string, skills: ExpertSkill[]) => void;
  onUpdateExpertSoftSkills: (expertId: string, softSkills: string[]) => void;
};

export function ExpertsContainer({
  isActive,
  pageVariants,
  experts,
  modules,
  moduleNameMap,
  moduleDomainMap,
  domainNameMap,
  initiatives,
  onUpdateExpertSkills,
  onUpdateExpertSoftSkills
}: ExpertsContainerProps) {
  return (
    <motion.main
      className={styles.expertMain}
      initial="hidden"
      animate={isActive ? 'visible' : 'hidden'}
      variants={pageVariants}
    >
      <ExpertExplorer
        experts={experts}
        modules={modules}
        moduleNameMap={moduleNameMap}
        moduleDomainMap={moduleDomainMap}
        domainNameMap={domainNameMap}
        initiatives={initiatives}
        onUpdateExpertSkills={onUpdateExpertSkills}
        onUpdateExpertSoftSkills={onUpdateExpertSoftSkills}
      />
    </motion.main>
  );
}
