import { useState, useEffect, useCallback } from 'react';
import { getDispensingHistoryApi, getDispensingRecordApi } from '../api/dispensing';
import { Modal } from '../components/Modal';

export function HistoryPage() {
  const [history, setHistory] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Details Modal State
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await getDispensingHistoryApi({
        page: pagination.page,
        limit: pagination.limit,
      });
      setHistory(res.data || []);
      setPagination(res.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.message || 'Failed to load dispensing history.');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleOpenDetails = async (id) => {
    try {
      setModalLoading(true);
      setModalError('');
      setSelectedRecord(null);
      const record = await getDispensingRecordApi(id);
      setSelectedRecord(record);
    } catch (err) {
      setModalError(err.message || 'Failed to load transaction details.');
    } finally {
      setModalLoading(false);
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setPagination((prev) => ({ ...prev, page: newPage }));
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>Dispensing Transaction History</h2>
          <p className="subtitle">Audit log of all completed FEFO medication dispensations</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card table-card">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading dispensing records...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="empty-state-box">
            <p>No dispensing transactions recorded on this account yet.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Transaction ID</th>
                  <th>Date & Time</th>
                  <th>Medicine</th>
                  <th>Quantity Dispensed</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {history.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <span className="id-tag">#{record.id}</span>
                    </td>
                    <td>{new Date(record.dispensedAt).toLocaleString()}</td>
                    <td>
                      <strong>{record.medicineName}</strong>
                    </td>
                    <td>
                      <span className="stock-number">{record.requestedQuantity} units</span>
                    </td>
                    <td>
                      <button
                        className="btn-secondary btn-xs"
                        onClick={() => handleOpenDetails(record.id)}
                      >
                        Batch Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {pagination.totalPages > 1 && (
          <div className="pagination-bar">
            <div className="pagination-info">
              Showing page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages}</strong> (Total {pagination.total} records)
            </div>
            <div className="pagination-actions">
              <button
                className="btn-secondary btn-sm"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
              >
                &larr; Previous
              </button>
              <button
                className="btn-secondary btn-sm"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
              >
                Next &rarr;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Transaction Details Modal */}
      <Modal
        isOpen={Boolean(selectedRecord || modalLoading || modalError)}
        onClose={() => {
          setSelectedRecord(null);
          setModalError('');
        }}
        title={`Dispensing Audit Details ${selectedRecord ? `(#${selectedRecord.id})` : ''}`}
      >
        {modalLoading && (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Fetching batch consumption details...</p>
          </div>
        )}

        {modalError && <div className="alert alert-error">{modalError}</div>}

        {selectedRecord && (
          <div className="history-details-content">
            <div className="detail-meta-grid">
              <div>
                <span className="meta-label">Medicine:</span>
                <strong>{selectedRecord.medicineName}</strong>
              </div>
              <div>
                <span className="meta-label">Date/Time:</span>
                <span>{new Date(selectedRecord.dispensedAt).toLocaleString()}</span>
              </div>
              <div>
                <span className="meta-label">Total Dispensed:</span>
                <strong>{selectedRecord.requestedQuantity} units</strong>
              </div>
            </div>

            <div className="detail-items-section">
              <h4>Consumed Batches (FEFO Traceability)</h4>
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th>Batch Number</th>
                    <th>Units Deducted</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRecord.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <code>{item.batchNumber}</code>
                      </td>
                      <td>
                        <strong>{item.quantityDispensed} units</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedRecord(null)}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
