import { createBrowserRouter, Navigate } from 'react-router-dom';
import App from './App';
import { GraphPage } from './pages/GraphPage';
import { StatsPage } from './pages/StatsPage';
import { ExpertsPage } from './pages/ExpertsPage';
import { InitiativesPage } from './pages/InitiativesPage';
import { EmployeeTasksPage } from './pages/EmployeeTasksPage';
import { AdminPage } from './pages/AdminPage';
import { LoginPage } from './pages/LoginPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/graph" replace />
  },
  {
    path: '/login',
    element: <LoginPage />
  },
  {
    element: <App />,
    children: [
      { path: '/graph', element: <GraphPage /> },
      { path: '/stats', element: <StatsPage /> },
      { path: '/experts', element: <ExpertsPage /> },
      { path: '/initiatives', element: <InitiativesPage /> },
      { path: '/tasks', element: <EmployeeTasksPage /> },
      { path: '/admin', element: <AdminPage /> }
    ]
  }
]);
