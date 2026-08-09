import { NavLink, Outlet } from 'react-router-dom';
import {
  FolderKanban,
  Home,
  MoonStar,
  PanelLeftClose,
  PanelLeftOpen,
  SunMedium,
  UserRound,
} from 'lucide-react';
import { useAppStore } from '../store/use-app-store.js';
import { useTheme } from '../theme/ThemeProvider.jsx';

const navigation = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/roadmaps', label: 'My Roadmaps', icon: FolderKanban },
  { to: '/profile', label: 'Profile', icon: UserRound },
];

export function AppLayout({ children }) {
  const isSidebarCollapsed = useAppStore((state) => state.isSidebarCollapsed);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="app-shell" data-sidebar-collapsed={isSidebarCollapsed}>
      <aside className="sidebar" data-collapsed={isSidebarCollapsed}>
        <div className="sidebar-header">
          {!isSidebarCollapsed ? (
            <div className="sidebar-brand">
              <span className="brand">Tracer AI</span>
            </div>
          ) : null}
          <button
            type="button"
            className="icon-button"
            onClick={toggleSidebar}
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
        <nav aria-label="Primary navigation" className="sidebar-nav">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink key={label} to={to} className="nav-link" aria-label={label} title={label}>
              <Icon size={16} />
              {!isSidebarCollapsed ? <span className="nav-link-label">{label}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button
            type="button"
            className="theme-button"
            onClick={toggleTheme}
            aria-label={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? <SunMedium size={16} /> : <MoonStar size={16} />}
            {!isSidebarCollapsed ? `Use ${theme === 'dark' ? 'light' : 'dark'} theme` : null}
          </button>
        </div>
      </aside>
      <main className="main-content">{children ?? <Outlet />}</main>
    </div>
  );
}
