import { Suspense, lazy, type ReactElement } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

const App = lazy(async () => ({
  default: (await import('./App')).default
}));
const GraphPage = lazy(async () => ({
  default: (await import('./features/graph/GraphPage')).GraphPage
}));
const StatsPage = lazy(async () => ({
  default: (await import('./pages/StatsPage')).StatsPage
}));
const ExpertsPage = lazy(async () => ({
  default: (await import('./pages/ExpertsPage')).ExpertsPage
}));
const InitiativesPage = lazy(async () => ({
  default: (await import('./pages/InitiativesPage')).InitiativesPage
}));
const EmployeeTasksPage = lazy(async () => ({
  default: (await import('./pages/EmployeeTasksPage')).EmployeeTasksPage
}));
const AdminPage = lazy(async () => ({
  default: (await import('./pages/AdminPage')).AdminPage
}));
const LoginPage = lazy(async () => ({
  default: (await import('./pages/LoginPage')).LoginPage
}));

const withSuspense = (element: ReactElement) => (
  <Suspense fallback={<div style={{ padding: '32px' }}>Загрузка...</div>}>
    {element}
  </Suspense>
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/graph" replace />
  },
  {
    path: '/login',
    element: withSuspense(<LoginPage />)
  },
  {
    element: withSuspense(<App />),
    children: [
      { path: '/graph', element: withSuspense(<GraphPage />) },
      { path: '/stats', element: withSuspense(<StatsPage />) },
      { path: '/experts', element: withSuspense(<ExpertsPage />) },
      { path: '/initiatives', element: withSuspense(<InitiativesPage />) },
      { path: '/tasks', element: withSuspense(<EmployeeTasksPage />) },
      { path: '/admin', element: withSuspense(<AdminPage />) }
    ]
  }
]);
