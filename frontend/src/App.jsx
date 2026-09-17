import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [healthStatus, setHealthStatus] = useState({
    loading: true,
    data: null,
    error: null,
  });

  const checkHealth = async () => {
    setHealthStatus({ loading: true, data: null, error: null });
    try {
      const response = await fetch('http://localhost:5000/api/health');
      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }
      const data = await response.json();
      setHealthStatus({ loading: false, data, error: null });
    } catch (err) {
      setHealthStatus({ loading: false, data: null, error: err.message });
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <div className="container">
      <header className="header">
        <div className="logo-badge">Rx</div>
        <h1>PharmaStock</h1>
        <p className="subtitle">Pharmacy Inventory Management System</p>
      </header>

      <main className="card">
        <h2>Development Setup Verification (Step 1)</h2>
        <div className="status-badge status-ok">
          <span className="indicator active"></span>
          Frontend is running (React + Vite)
        </div>

        <div className="health-section">
          <h3>Backend Health Check (GET /api/health)</h3>
          {healthStatus.loading && (
            <p className="status-text muted">Connecting to backend at http://localhost:5000/api/health...</p>
          )}
          {!healthStatus.loading && healthStatus.data && (
            <div className="status-badge status-ok">
              <span className="indicator active"></span>
              Backend Response: <code>{JSON.stringify(healthStatus.data)}</code>
            </div>
          )}
          {!healthStatus.loading && healthStatus.error && (
            <div className="status-badge status-error">
              <span className="indicator inactive"></span>
              Backend Offline or Unreachable: {healthStatus.error}
            </div>
          )}

          <button className="btn-refresh" onClick={checkHealth}>
            Recheck Backend Health
          </button>
        </div>

        <div className="info-box">
          <h4>Project Scope - Step 1 Complete</h4>
          <ul>
            <li>Clean <code>/frontend</code> and <code>/backend</code> architecture</li>
            <li>Express server with <code>GET /api/health</code> endpoint</li>
            <li>Environment variables managed via <code>.env</code></li>
            <li>Git ignore rules configured for secrets and build artifacts</li>
          </ul>
        </div>
      </main>

      <footer className="footer">
        PharmaStock &copy; {new Date().getFullYear()} - Timed Assessment Project
      </footer>
    </div>
  );
}

export default App;
