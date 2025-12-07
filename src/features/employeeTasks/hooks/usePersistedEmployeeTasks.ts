import { useEffect, useState } from 'react';

import { initialEmployeeTasks } from '../../../data/employeeTasks';
import { loadStoredTasks, persistStoredTasks } from '../../../utils/employeeTasks';
import type { TaskListItem } from '../../../types/tasks';

export function usePersistedEmployeeTasks() {
  const [employeeTasks, setEmployeeTasks] = useState<TaskListItem[]>(
    () => loadStoredTasks() ?? initialEmployeeTasks
  );

  useEffect(() => {
    persistStoredTasks(employeeTasks);
  }, [employeeTasks]);

  return { employeeTasks, setEmployeeTasks } as const;
}

