import { Link, Outlet } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { Button } from '../components/Button/index.js';

export function PublicLayout() {
  const { toggleTheme } = useTheme();
  return (
    <div className="public-shell">
      <header>
        <Link to="/" className="brand">
          Tracer AI
        </Link>
        <nav>
          <Link to="/login">Log in</Link>
          <Link to="/signup">Sign up</Link>
          <Button type="button" onClick={toggleTheme}>
            Theme
          </Button>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
