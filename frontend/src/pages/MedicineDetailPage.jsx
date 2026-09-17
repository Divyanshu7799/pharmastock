import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getMedicineByIdApi } from '../api/medicines';
import { createBatchApi } from '../api/batches';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';

export function MedicineDetailPage() {
  const { id } = useParams();

  const [medicine, setMedicine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add Batch Modal State
  const [isAddBatchOpen, setIsAddBatchOpen] = useState(false);
  const [batchForm, setBatchForm] = useState({
    batchNumber: '',
    quantity: '',
    expiryDate: '',
  });
  const [addBatchLoading, setAddBatchLoading] = useState(false);
  const [addBatchError, setAddBatchError] = useState('');

  const fetchMedicineDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getMedicineByIdApi(id);
      setMedicine(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch medicine details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMedicineDetails();
  }, [fetchMedicineDetails]);

  const handleAddBatchSubmit = async (e) => {
    e.preventDefault();
    setAddBatchError('');

    if (!batchForm.batchNumber.trim() || !batchForm.quantity || !batchForm.expiryDate) {
      setAddBatchError('All batch fields are required.');
      return;
    }

    try {
      setAddBatchLoading(true);
      await createBatchApi(id, {
        batchNumber: batchForm.batchNumber.trim(),
        quantity: parseInt(batchForm.quantity, 10),
        expiryDate: batchForm.expiryDate,
      });
      setIsAddBatchOpen(false);
      setBatchForm({ batchNumber: '', quantity: '', expiryDate: '' });
      fetchMedicineDetails();
    } catch (err) {
      setAddBatchError(err.message || 'Failed to add batch.');
    } finally {
      setAddBatchLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading medicine details and batches...</p>
        </div>
      </div>
    );
  }

  if (error || !medicine) {
    return (
      <div className="page-container">
        <div className="alert alert-error">{error || 'Medicine not found.'}</div>
        <Link to="/inventory" className="btn-secondary">
          &larr; Back to Inventory
        </Link>
      </div>
    );
  }

  const batches = medicine.batches || [];
  const hasSellableStock = Number(medicine.sellableStock) > 0;

  return (
    <div className="page-container">
      <div className="breadcrumb">
        <Link to="/inventory">&larr; Back to Medicine Inventory</Link>
      </div>

      {/* Header Profile Card */}
      <div className="card medicine-profile-card">
        <div className="medicine-profile-header">
          <div>
            <h2>{medicine.name}</h2>
            <p className="medicine-desc">{medicine.description || 'No description recorded.'}</p>
          </div>
          <div className="profile-actions">
            <Link
              to={`/dispense?medicineId=${medicine.id}`}
              className={`btn-primary ${!hasSellableStock ? 'btn-disabled' : ''}`}
              title={!hasSellableStock ? 'No sellable stock available' : 'Dispense medicine'}
            >
              Dispense Medicine
            </Link>
            <button className="btn-secondary" onClick={() => setIsAddBatchOpen(true)}>
              + Receive New Batch
            </button>
          </div>
        </div>

        <div className="medicine-stat-pills">
          <div className="stat-pill">
            <span className="pill-label">Total Sellable Stock</span>
            <span className="pill-value highlight">{Number(medicine.sellableStock).toLocaleString()} units</span>
          </div>
          <div className="stat-pill">
            <span className="pill-label">Total Batches on File</span>
            <span className="pill-value">{batches.length}</span>
          </div>
          <div className="stat-pill">
            <span className="pill-label">Expired Batches</span>
            <span className="pill-value danger">{medicine.expiredBatchesCount || 0}</span>
          </div>
        </div>
      </div>

      {/* Expiry Warning Notice */}
      <div className="notice-banner">
        <span className="notice-icon">ℹ️</span>
        <div>
          <strong>FEFO Rule Enforcement:</strong> Dispensing automatically orders batches by{' '}
          <code>expiry_date ASC</code>. Expired batches are <strong>never</strong> dispensed and are strictly excluded
          from sellable stock counts.
        </div>
      </div>

      {/* Batches Table Card */}
      <div className="card table-card">
        <div className="card-header-row">
          <h3>Batches Breakdown (FEFO Order)</h3>
          <span className="badge badge-secondary">{batches.length} Batches</span>
        </div>

        {batches.length === 0 ? (
          <div className="empty-state-box">
            <p>No batches registered for this medicine yet.</p>
            <button
              className="btn-primary btn-sm"
              onClick={() => setIsAddBatchOpen(true)}
              style={{ marginTop: '0.75rem' }}
            >
              Add First Batch
            </button>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Batch Number</th>
                  <th>Quantity</th>
                  <th>Expiry Date</th>
                  <th>Batch Status</th>
                  <th>FEFO Priority</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch, index) => {
                  let statusTag = 'Valid';
                  if (batch.isExpired) statusTag = 'Expired';
                  else if (batch.quantity === 0) statusTag = 'Out of Stock';
                  else if (batch.status === 'expiring_soon') statusTag = 'Expiring Soon';

                  return (
                    <tr key={batch.id} className={batch.isExpired ? 'row-expired' : ''}>
                      <td>
                        <strong>{batch.batchNumber}</strong>
                      </td>
                      <td>
                        <span className={batch.quantity === 0 ? 'text-muted' : ''}>
                          {batch.quantity} units
                        </span>
                      </td>
                      <td>{batch.expiryDate}</td>
                      <td>
                        <Badge status={statusTag} text={statusTag} />
                      </td>
                      <td className="table-cell-muted">
                        {batch.isExpired ? (
                          <span className="text-danger">Unsellable</span>
                        ) : batch.quantity === 0 ? (
                          <span>Depleted</span>
                        ) : (
                          <span className="text-success">Priority #{index + 1}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Batch Modal */}
      <Modal isOpen={isAddBatchOpen} onClose={() => setIsAddBatchOpen(false)} title={`Receive Batch for ${medicine.name}`}>
        {addBatchError && <div className="alert alert-error">{addBatchError}</div>}
        <form onSubmit={handleAddBatchSubmit}>
          <div className="form-group">
            <label htmlFor="batchNumber">Batch Number *</label>
            <input
              id="batchNumber"
              type="text"
              placeholder="e.g. BATCH-2026-X1"
              value={batchForm.batchNumber}
              onChange={(e) => setBatchForm((prev) => ({ ...prev, batchNumber: e.target.value }))}
              disabled={addBatchLoading}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="quantity">Quantity Received *</label>
            <input
              id="quantity"
              type="number"
              min="0"
              placeholder="e.g. 100"
              value={batchForm.quantity}
              onChange={(e) => setBatchForm((prev) => ({ ...prev, quantity: e.target.value }))}
              disabled={addBatchLoading}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="expiryDate">Expiry Date (YYYY-MM-DD) *</label>
            <input
              id="expiryDate"
              type="date"
              value={batchForm.expiryDate}
              onChange={(e) => setBatchForm((prev) => ({ ...prev, expiryDate: e.target.value }))}
              disabled={addBatchLoading}
              required
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsAddBatchOpen(false)}
              disabled={addBatchLoading}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={addBatchLoading}>
              {addBatchLoading ? 'Saving...' : 'Add Batch'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
