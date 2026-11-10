import { Link, NavLink, useLocation } from 'react-router-dom';
import { Gift, LayoutDashboard, LayoutList, Map, MapPin, Moon, Plus, Sun, User, LogIn } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { STROKE } from '../icons.jsx';
import { useTheme } from '../utils.js';
import NotificationsPanel from './NotificationsPanel.jsx';

const I = (C, size = 18) => <C size={size} strokeWidth={STROKE} aria-hidden="true" />;

export default function Navbar() {
  const { user } = useAuth();
  const location = useLocation();
  const official = user?.role === 'official';
  const [theme, setTheme] = useTheme();

  // Floating dock: Reports, Map, Rewards (Dashboard for staff), Profile.
  const dock = [
    { to: '/', label: 'Reports', icon: LayoutList, end: true },
    { to: '/map', label: 'Map', icon: Map },
    official ? { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard } : { to: '/rewards', label: 'Rewards', icon: Gift },
    user ? { to: '/profile', label: 'Profile', icon: User } : { to: '/login', label: 'Sign in', icon: LogIn },
  ];
  // The report button only lives on the home feed.
  const showFab = !official && location.pathname === '/';

  return (
    <>
      <header className="nav">
        <Link to="/" className="brand" aria-label="Titik home">
          <span className="brand-mark">{I(MapPin, 16)}</span>
          titik
        </Link>
        <div className="nav-right">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            title={theme === 'light' ? 'Dark mode' : 'Light mode'}
          >
            {I(theme === 'light' ? Moon : Sun, 20)}
          </button>
          {user ? (
            <>
              <NotificationsPanel />
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost btn-sm">
                Sign in
              </Link>
              <Link to="/register" className="btn btn-sm hide-phone">
                Join
              </Link>
            </>
          )}
        </div>
      </header>

      <nav className="dock" aria-label="Main">
        {dock.map((d) => (
          <NavLink key={d.to} to={d.to} end={d.end} className={({ isActive }) => `dock-item ${isActive ? 'active' : ''}`} aria-label={d.label} title={d.label}>
            {I(d.icon, 22)}
          </NavLink>
        ))}
      </nav>

      {showFab && (
        <Link to="/new" className="fab" aria-label="Report a problem" title="Report a problem">
          {I(Plus, 26)}
        </Link>
      )}
    </>
  );
}
