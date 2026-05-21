import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { useAuthStore, UserRole } from './store/auth.store';

// Layouts
import AppLayout from './components/layout/AppLayout';

// Pages
import LoginPage from './pages/auth/LoginPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import StudentsPage from './pages/students/StudentsPage';
import StudentDetailPage from './pages/students/StudentDetailPage';
import TeachersPage from './pages/teachers/TeachersPage';
import SchedulesPage from './pages/schedules/SchedulesPage';
import PaymentsPage from './pages/payments/PaymentsPage';
import ReportsPage from './pages/reports/ReportsPage';
import MyStudentsPage from './pages/teachers/MyStudentsPage';
import MySchedulesPage from './pages/teachers/MySchedulesPage';
import NotFoundPage from './pages/NotFoundPage';
import CoursesPage from './pages/courses/CoursesPage';

// ─── Auth guard ───────────────────────────────
function RequireAuth({ roles }: { roles?: UserRole[] }) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },

          // Admin only
          {
            element: <RequireAuth roles={['ADMIN']} />,
            children: [
              { path: 'students', element: <StudentsPage /> },
              { path: 'students/:id', element: <StudentDetailPage /> },
              { path: 'teachers', element: <TeachersPage /> },
              { path: 'schedules', element: <SchedulesPage /> },
              { path: 'payments', element: <PaymentsPage /> },
              { path: 'reports', element: <ReportsPage /> },
            ],
          },

          // Teacher portal
          {
            element: <RequireAuth roles={['ADMIN', 'TEACHER']} />,
            children: [
              { path: 'my-students',  element: <MyStudentsPage /> },
              { path: 'my-schedules', element: <MySchedulesPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
