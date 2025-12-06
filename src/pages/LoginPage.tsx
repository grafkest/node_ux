import { Navigate } from 'react-router-dom';
import Login from '../components/Login';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { user } = useAuth();

  if (user) {
    return <Navigate to="/graph" replace />;
  }

  return <Login />;
}

export default LoginPage;
