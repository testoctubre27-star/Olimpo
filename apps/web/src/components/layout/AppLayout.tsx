import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, GraduationCap, Calendar,
  CreditCard, BarChart3, LogOut, ChevronRight,
  BookOpen, Waves,
} from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import { ToastContainer } from '../ui/Toast';


interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  roles?: string[];
}

const navItems: NavItem[] = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/students',    icon: Users,            label: 'Alumnos',   roles: ['ADMIN'] },
  { to: '/teachers',    icon: GraduationCap,    label: 'Maestros',  roles: ['ADMIN'] },
  { to: '/schedules',   icon: Calendar,         label: 'Horarios',  roles: ['ADMIN'] },
  { to: '/payments',    icon: CreditCard,       label: 'Pagos',     roles: ['ADMIN'] },
  { to: '/reports',     icon: BarChart3,        label: 'Reportes',  roles: ['ADMIN'] },
  { to: '/my-students', icon: BookOpen,         label: 'Mis alumnos', roles: ['TEACHER'] },
];

export default function AppLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const visible = navItems.filter(item =>
    !item.roles || item.roles.includes(user?.role ?? '')
  );

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* ── Sidebar ── */}
      <aside style={{
        width: 'var(--sidebar-width)',
        background: 'var(--sidebar-bg)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}>

        {/* Logo */}
        <div style={{ padding: '22px 20px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Waves size={18} color="white" />
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: 15, color: 'white', letterSpacing: '-0.2px' }}>OLIMPO</p>
              <p style={{ fontSize: 11, color: 'var(--sidebar-text)', marginTop: 1 }}>Academia de Natación</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {visible.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 8,
                  textDecoration: 'none',
                  fontSize: 13.5,
                  fontWeight: isActive ? 500 : 400,
                  color: isActive ? 'var(--sidebar-active)' : 'var(--sidebar-text)',
                  background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
                  transition: 'all .15s',
                })}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  if (!el.style.background.includes('rgba(255,255,255,0.08)')) {
                    el.style.background = 'var(--sidebar-hover)';
                    el.style.color = 'rgba(255,255,255,0.9)';
                  }
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  if (!el.style.background.includes('rgba(255,255,255,0.08)')) {
                    el.style.background = 'transparent';
                    el.style.color = 'var(--sidebar-text)';
                  }
                }}
              >
                {({ isActive }) => (
                  <>
                    <item.icon size={16} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7 }} />
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {isActive && <ChevronRight size={12} style={{ opacity: 0.5 }} />}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* User + logout */}
        <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ padding: '8px 10px', borderRadius: 8, marginBottom: 4 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name}
            </p>
            <p style={{ fontSize: 11, color: 'var(--sidebar-text)', marginTop: 2 }}>
              {user?.role === 'ADMIN' ? 'Administrador' : user?.role === 'TEACHER' ? 'Maestro' : 'Usuario'}
            </p>
          </div>
          <button
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '8px 10px',
              background: 'none', border: 'none',
              borderRadius: 8, cursor: 'pointer',
              color: 'var(--sidebar-text)', fontSize: 13,
              transition: 'all .15s', fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(220,50,50,0.12)';
              (e.currentTarget as HTMLElement).style.color = '#ff7b7b';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'none';
              (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-text)';
            }}
          >
            <LogOut size={15} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top bar */}
        <header style={{
          height: 56, background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center',
          padding: '0 28px',
          flexShrink: 0,
        }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
          <Outlet />
        </main>
      </div>

      <ToastContainer />
    </div>
  );
}
