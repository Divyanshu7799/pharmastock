import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { getMedicinesApi } from '../api/medicines';
import { dispenseApi } from '../api/dispensing';

export function DispensePage() {
  const [searchParams] = useSearchParams();
  const preselectedMedId = searchParams.get('medicineId');

  const [medicines, setMedicines] = useState([]);
  const [loadingMedicines, setLoadingMedicines] = useState(true);

  const [selectedMedId, setSelectedMedId] = useState(preselectedMedId || '');
  const [quantity, setQuantity] = useState('');
  const [loading, setLoading] = useState(false);

  // Result state
  const [successResult, setSuccessResult] = useState(null);
  const [errorDetails, setErrorDetails] = useState(null);

  // Fetch available medicines list for selector
  const fetchMedicinesList = async () => {
    try {
      setLoadingMedicines(true);
      const res = await getMedicinesApi({ limit: 50 });
      setMedicines(res.data || []);
      if (!selectedMedId && preselectedMedId) {
        setSelectedMedId(preselectedMedId);
      } else if (!selectedMedId && res.data?.length > 0) {
        setSelectedMedId(String(res.data[0].id));
      }
    } catch (err) {
      console.error('Failed to load medicines list:', err);
    } finally {
      setLoadingMedicines(false);
    }
  };

  useEffect(() => {
    fetchMedicinesList();
  }, [preselectedMedId]);

  const currentMedicine = medicines.find((m) => String(m.id) === String(selectedMedId));
  const currentSellableStock = currentMedicine ? Number(currentMedicine.sellableStock) : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccessResult(null);
    setErrorDetails(null);

    const parsedQty = Number(quantity);

    if (!selectedMedId) {
      setErrorDetails({ message: 'Please select a medicine to dispense.' });
      return;
    }

    if (!Number.isInteger(parsedQty) || parsedQty <= 0) {
      setErrorDetails({ message: 'Quantity must be a positive whole integer greater than zero.' });
      return;
    }

    try {
      setLoading(true);
      const res = await dispenseApi({
        medicineId: parseInt(selectedMedId, 10),
        quantity: parsedQty,
      });

      setSuccessResult(res.data);
      setQuantity('');
      // Refresh inventory list so stock counts update immediately
      fetchMedicinesList();
    } catch (err) {
      setErrorDetails({
        message: err.message || 'Dispensing failed.',
        requestedQuantity: err.requestedQuantity,
        availableQuantity: err.availableQuantity,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>Dispense Medication</h2>
          <p className="subtitle">Automatic First Expiry, First Out (FEFO) batch allocation engine</p>
        </div>
        <Link to="/history" className="btn-secondary">
          View Dispensing History
        </Link>
      </div>

      <div className="dispense-layout">
        {/* Dispense Form Card */}
        <div className="card dispense-form-card">
          <h3>Dispensing Order Form</h3>

          <form onSubmit={handleSubmit} className="dispense-form">
            <div className="form-group">
              <label htmlFor="medicineSelect">Select Medicine *</label>
              {loadingMedicines ? (
                <p className="text-muted">Loading medicines catalog...</p>
              ) : (
                <select
                  id="medicineSelect"
                  value={selectedMedId}
                  onChange={(e) => {
                    setSelectedMedId(e.target.value);
                    setSuccessResult(null);
                    setErrorDetails(null);
                  }}
                  className="select-input"
                  disabled={loading}
                  required
                >
                  <option value="">-- Choose Medicine --</option>
                  {medicines.map((med) => (
                    <option key={med.id} value={med.id}>
                      {med.name} (Sellable: {med.sellableStock} units)
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Current Medicine Stock Indicator */}
            {currentMedicine && (
              <div className="stock-preview-box">
                <div className="preview-label">Live Available Sellable Stock:</div>
                <div className={`preview-value ${currentSellableStock === 0 ? 'text-danger' : 'text-success'}`}>
                  {currentSellableStock.toLocaleString()} units
                </div>
                {currentSellableStock === 0 && (
                  <p className="preview-warning">
                    ⚠️ This medication has 0 sellable units. Expired batches cannot be dispensed.
                  </p>
                )}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="quantity">Dispense Quantity (Units) *</label>
              <input
                id="quantity"
                type="number"
                min="1"
                step="1"
                placeholder="e.g. 120"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={loading || currentSellableStock === 0}
                required
              />
            </div>

            <button
              type="submit"
              className="btn-primary btn-block"
              disabled={loading || currentSellableStock === 0 || !quantity}
            >
              {loading ? 'Processing FEFO Transaction...' : 'Dispense Medication'}
            </button>
          </form>
        </div>

        {/* Results & Feedback Column */}
        <div className="dispense-feedback-col">
          {/* Insufficient Stock or Validation Error Banner */}
          {errorDetails && (
            <div className="card alert-result-card error">
              <div className="result-header">
                <span className="result-icon-badge error">&times;</span>
                <h4>Dispensing Rejected</h4>
              </div>
              <p className="result-message">{errorDetails.message}</p>

              {errorDetails.requestedQuantity !== undefined && (
                <div className="stock-comparison-box">
                  <div className="comparison-item">
                    <span>Requested Quantity:</span>
                    <strong>{errorDetails.requestedQuantity} units</strong>
                  </div>
                  <div className="comparison-item">
                    <span>Available Sellable Stock:</span>
                    <strong className="text-danger">{errorDetails.availableQuantity} units</strong>
                  </div>
                </div>
              )}
              <p className="atomicity-note">
                🔒 <strong>Atomicity Guaranteed:</strong> Zero units were deducted from inventory. No partial dispensing
                was applied.
              </p>
            </div>
          )}

          {/* Success Result Card with Batch Consumption Breakdown */}
          {successResult && (
            <div className="card alert-result-card success">
              <div className="result-header">
                <span className="result-icon-badge success">&#10003;</span>
                <div>
                  <h4>Dispensed Successfully</h4>
                  <p className="card-subtitle">Transaction ID #{successResult.dispensingId}</p>
                </div>
              </div>

              <div className="success-summary">
                <div>
                  <strong>Medicine:</strong> {successResult.medicineName}
                </div>
                <div>
                  <strong>Total Units Dispensed:</strong> {successResult.dispensedQuantity} units
                </div>
              </div>

              <div className="batch-breakdown-section">
                <h5>FEFO Batch Allocation Breakdown</h5>
                <p className="breakdown-subtitle">Earliest-expiring batches consumed first:</p>
                <div className="consumed-items-list">
                  {successResult.items.map((item, idx) => (
                    <div key={idx} className="consumed-item-row">
                      <span className="batch-code">Batch: <strong>{item.batchNumber}</strong></span>
                      <span className="batch-qty-pill">&rarr; {item.quantityDispensed} units</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="result-actions">
                <Link to="/history" className="btn-secondary btn-sm">
                  View in History
                </Link>
                <button
                  className="btn-outline btn-sm"
                  onClick={() => setSuccessResult(null)}
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Default Info Box when no action taken yet */}
          {!successResult && !errorDetails && (
            <div className="card info-card">
              <h4>FEFO Automated Dispensing Rules</h4>
              <ul>
                <li>Valid batches are automatically ordered by <code>expiry_date ASC</code>.</li>
                <li>Earliest-expiring batch is depleted before moving to subsequent batches.</li>
                <li>Expired batches are never consumed under any circumstances.</li>
                <li>If sellable stock is less than requested, the entire operation is rolled back.</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
