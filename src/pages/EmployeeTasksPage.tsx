import { useOutletContext } from 'react-router-dom';
import { EmployeeTasksContainer } from '../features/employeeTasks/EmployeeTasksContainer';
import type { AppOutletContext } from '../App';

export function EmployeeTasksPage() {
  const { employeeTasksPageProps } = useOutletContext<AppOutletContext>();

  return <EmployeeTasksContainer {...employeeTasksPageProps} />;
}

export default EmployeeTasksPage;
