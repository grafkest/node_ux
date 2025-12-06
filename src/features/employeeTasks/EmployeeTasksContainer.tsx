import { motion, type Variants } from 'framer-motion';

import EmployeeWorkloadTrack from '../../components/EmployeeWorkloadTrack';
import styles from '../../App.module.css';
import type { ExpertProfile, Initiative } from '../../data';
import type { TaskListItem } from '../../types/tasks';

export type EmployeeTasksContainerProps = {
  isActive: boolean;
  pageVariants: Variants;
  experts: ExpertProfile[];
  initiatives: Initiative[];
  tasks: TaskListItem[];
  onTasksChange: (tasks: TaskListItem[]) => void;
};

export function EmployeeTasksContainer({
  isActive,
  pageVariants,
  experts,
  initiatives,
  tasks,
  onTasksChange
}: EmployeeTasksContainerProps) {
  return (
    <motion.main
      className={styles.employeeTasksMain}
      initial="hidden"
      animate={isActive ? 'visible' : 'hidden'}
      variants={pageVariants}
    >
      <EmployeeWorkloadTrack
        experts={experts}
        initiatives={initiatives}
        tasks={tasks}
        onTasksChange={onTasksChange}
      />
    </motion.main>
  );
}
