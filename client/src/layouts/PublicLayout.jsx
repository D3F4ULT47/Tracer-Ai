import { Link, Outlet } from 'react-router-dom';
import { MoonStar, PanelLeft, SunMedium } from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { Button } from '../components/Button/index.js';

export function PublicLayout({ children }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="public-shell">
      <header className="public-header">
        <div className="public-brand-group">
          <span className="brand-mark" aria-hidden="true">
            <PanelLeft size={18} />
          </span>
          <Link to="/" className="brand">
            Tracer AI
          </Link>
        </div>
        <nav className="public-nav">
          <Link to="/login" className="public-link">
            Log in
          </Link>
          <Link to="/signup" className="public-link public-link--button">
            Sign up
          </Link>
          <Button type="button" onClick={toggleTheme}>
            {theme === 'dark' ? <SunMedium size={16} /> : <MoonStar size={16} />}
            <span className="hide-mobile">Theme</span>
          </Button>
        </nav>
      </header>
      <main className="public-main">{children ?? <Outlet />}</main>
    </div>
  );
}
