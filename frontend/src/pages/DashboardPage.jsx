import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getMedicinesApi } from '../api/medicines';
import { getExpiringAlertsApi } from '../api/alerts';
import { getDispensingHistoryApi } from '../api/dispensing';
import { useAuth } from '../context/AuthContext';

export function DashboardPage() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [metrics, setMetrics] = useState({
    totalMedicines: 0,
    totalSellableStock: 0,
    expiringSoonCount: 0,
  });
  const [expiringAlerts, setExpiringAlerts] = useState([]);
  const [recentDispensing, setRecentDispensing] = useState([]);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoading(true);
        setError('');

        const [medicinesRes, alertsRes, historyRes] = await Promise.all([
          getMedicinesApi({ limit: 50 }),
          getExpiringAlertsApi(30),
          getDispensingHistoryApi({ page: 1, limit: 5 }),
        ]);

        const medicines = medicinesRes.data || [];
        const totalSellable = medicines.reduce((sum, m) => sum + Number(m.sellableStock || 0), 0);

        setMetrics({
          totalMedicines: medicinesRes.pagination?.total || medicines.length,
          totalSellableStock: totalSellable,
          expiringSoonCount: (alertsRes || []).length,
        });

        setExpiringAlerts(alertsRes || []);
        setRecentDispensing(historyRes.data || []);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
        setError(err.message || 'Failed to fetch dashboard data. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading pharmacy dashboard metrics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>Dispensary Dashboard</h2>
          <p className="subtitle">Welcome back, {user?.name}. Real-time FEFO inventory status.</p>
        </div>
        <div className="header-actions">
          <Link to="/dispense" className="btn-primary">
            + Dispense Medicine
          </Link>
          <Link to="/inventory" className="btn-secondary">
            View All Stock
          </Link>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Metric Cards Grid */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-title">Total Medicines</div>
          <div className="metric-value">{metrics.totalMedicines}</div>
          <div className="metric-note">Catalog items tracked</div>
        </div>

        <div className="metric-card highlight">
          <div className="metric-title">Sellable Stock</div>
          <div className="metric-value">{metrics.totalSellableStock.toLocaleString()}</div>
          <div className="metric-note">Units available for FEFO dispensing</div>
        </div>

        <div className="metric-card warning">
          <div className="metric-title">Expiring Soon (&le; 30 Days)</div>
          <div className="metric-value">{metrics.expiringSoonCount}</div>
          <div className="metric-note">Batches needing priority rotation</div>
        </div>
      </div>

      {/* Main Dashboard Grid */}
      <div className="dashboard-grid">
        {/* Expiry Alerts Section */}
        <div className="card dashboard-section">
          <div className="section-title-row">
            <div>
              <h3>Critical Expiry Alerts (&le; 30 Days)</h3>
              <p className="card-subtitle">Batches approaching expiry date. Only sellable stock is shown.</p>
            </div>
            <span className="badge badge-warning">{expiringAlerts.length} Batches</span>
          </div>

          {expiringAlerts.length === 0 ? (
            <div className="empty-state-box">
              <p>No batches expiring within the next 30 days. Stock is in good health.</p>
            </div>
          ) : (
            <div className="alert-list">
              {expiringAlerts.map((alert) => (
                <div key={alert.batchId} className="alert-card-item">
                  <div className="alert-card-main">
                    <div className="alert-med-name">{alert.medicineName}</div>
                    <div className="alert-batch-info">
                      <span>Batch: <strong>{alert.batchNumber}</strong></span>
                      <span>Stock: <strong>{alert.quantity} units</strong></span>
                      <span>Expires: <strong>{alert.expiryDate}</strong></span>
                    </div>
                  </div>
                  <div className="alert-days-badge">
                    <span className="days-number">{alert.daysRemaining}</span>
                    <span className="days-label">days left</span>
                  </div>
                  <Link
                    to={`/dispense?medicineId=${alert.medicineId}`}
                    className="btn-dispense-sm"
                    title="Dispense this medication first"
                  >
                    Dispense
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Dispensing Activity */}
        <div className="card dashboard-section">
          <div className="section-title-row">
            <div>
              <h3>Recent Dispensing Activity</h3>
              <p className="card-subtitle">Latest completed FEFO transactions</p>
            </div>
            <Link to="/history" className="link-text">
              View All &rarr;
            </Link>
          </div>

          {recentDispensing.length === 0 ? (
            <div className="empty-state-box">
              <p>No dispensing transactions recorded yet.</p>
              <Link to="/dispense" className="btn-secondary btn-sm" style={{ marginTop: '0.75rem' }}>
                Perform First Dispense
              </Link>
            </div>
          ) : (
            <div className="recent-dispense-table-wrapper">
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th>Dispensing ID</th>
                    <th>Medicine</th>
                    <th>Units</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentDispensing.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Link to="/history" className="table-link">
                          #{item.id}
                        </Link>
                      </td>
                      <td><strong>{item.medicineName}</strong></td>
                      <td>{item.requestedQuantity}</td>
                      <td>{new Date(item.dispensedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
