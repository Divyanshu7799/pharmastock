import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="navbar">
      <div className="navbar-container">
        <Link to={isAuthenticated ? '/dashboard' : '/'} className="navbar-brand">
          <span className="brand-badge">Rx</span>
          <span className="brand-text">PharmaStock</span>
        </Link>

        <nav className="navbar-links">
          {isAuthenticated ? (
            <>
              <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                Dashboard
              </NavLink>
              <NavLink to="/inventory" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                Inventory
              </NavLink>
              <NavLink to="/dispense" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                Dispense
              </NavLink>
              <NavLink to="/history" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                History
              </NavLink>
            </>
          ) : (
            <>
              <NavLink to="/" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')} end>
                Home
              </NavLink>
            </>
          )}
        </nav>

        <div className="navbar-actions">
          {isAuthenticated ? (
            <div className="user-profile">
              <span className="user-name">{user?.name}</span>
              <button className="btn-logout" onClick={handleLogout}>
                Logout
              </button>
            </div>
          ) : (
            <div className="auth-buttons">
              <Link to="/login" className="btn-nav-login">
                Sign In
              </Link>
              <Link to="/register" className="btn-nav-register">
                Register
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
