import { NavLink, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { auth } from '../lib/auth';

const NAV_ITEMS = [
  { to: '/',          icon: 'ti-layout-dashboard', label: 'Dashboard' },
  { to: '/users',     icon: 'ti-users',            label: 'Users' },
  { to: '/services',  icon: 'ti-wifi',             label: 'Services' },
  { to: '/categories',icon: 'ti-stack-2',          label: 'Categories' },
  { to: '/logs',      icon: 'ti-terminal',         label: 'Logs' },
  { to: '/health',    icon: 'ti-activity',         label: 'Health' },
  { to: '/settings',  icon: 'ti-settings-2',       label: 'Settings' },
];

export function Sidebar() {
  const navigate = useNavigate();

  async function handleLogout() {
    await api.post('/auth/logout').catch(() => {});
    auth.clearToken();
    navigate('/login');
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <i className="ti ti-route" />
        </div>
        RoutePanel
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <i className={`ti ${item.icon}`} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="sidebar-logout" onClick={handleLogout}>
          <i className="ti ti-logout" style={{ fontSize: '0.9rem' }} />
          Logout
        </button>
      </div>
    </aside>
  );
}
