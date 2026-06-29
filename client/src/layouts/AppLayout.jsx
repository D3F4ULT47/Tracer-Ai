import { NavLink, Outlet } from 'react-router-dom';
import { useAppStore } from '../store/use-app-store.js';
import { useTheme } from '../theme/ThemeProvider.jsx';

const navigation = [
  ['/dashboard', 'Dashboard'],
  ['/roadmaps', 'My Roadmaps'],
  ['/resources', 'Resources'],
  ['/profile', 'Profile'],
];

export function AppLayout() {
  const isSidebarCollapsed = useAppStore((state) => state.isSidebarCollapsed);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="app-shell">
      <aside className="sidebar" data-collapsed={isSidebarCollapsed}>
        <div className="sidebar-header">
          <span className="brand">{isSidebarCollapsed ? 'T' : 'Tracer AI'}</span>
          <button type="button" className="icon-button" onClick={toggleSidebar}>
            {isSidebarCollapsed ? '→' : '←'}
          </button>
        </div>
        <nav aria-label="Primary navigation">
          {navigation.map(([to, label]) => (
            <NavLink key={to} to={to} className="nav-link">
              {isSidebarCollapsed ? label.slice(0, 1) : label}
            </NavLink>
          ))}
        </nav>
        <button type="button" className="theme-button" onClick={toggleTheme}>
          {isSidebarCollapsed ? '◐' : `Use ${theme === 'dark' ? 'light' : 'dark'} theme`}
        </button>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
