import { useOutletContext } from 'react-router-dom';
import { AdminContainer } from '../features/admin/AdminContainer';
import type { AppOutletContext } from '../App';

export function AdminPage() {
  const { adminPageProps } = useOutletContext<AppOutletContext>();

  return <AdminContainer {...adminPageProps} />;
}

export default AdminPage;
