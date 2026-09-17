import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getMedicinesApi, createMedicineApi } from '../api/medicines';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';

export function InventoryPage() {
  const [medicines, setMedicines] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [order, setOrder] = useState('asc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add Medicine Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newMedData, setNewMedData] = useState({ name: '', description: '' });
  const [addMedLoading, setAddMedLoading] = useState(false);
  const [addMedError, setAddMedError] = useState('');

  const fetchMedicines = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await getMedicinesApi({
        search,
        page: pagination.page,
        limit: pagination.limit,
        sortBy,
        order,
      });
      setMedicines(res.data || []);
      setPagination(res.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.message || 'Failed to fetch inventory medicines.');
    } finally {
      setLoading(false);
    }
  }, [search, pagination.page, pagination.limit, sortBy, order]);

  useEffect(() => {
    fetchMedicines();
  }, [fetchMedicines]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setPagination((prev) => ({ ...prev, page: newPage }));
    }
  };

  const handleAddMedicineSubmit = async (e) => {
    e.preventDefault();
    setAddMedError('');

    if (!newMedData.name.trim()) {
      setAddMedError('Medicine name is required.');
      return;
    }

    try {
      setAddMedLoading(true);
      await createMedicineApi(newMedData);
      setIsAddModalOpen(false);
      setNewMedData({ name: '', description: '' });
      fetchMedicines();
    } catch (err) {
      setAddMedError(err.message || 'Failed to create medicine.');
    } finally {
      setAddMedLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>Medicine Inventory</h2>
          <p className="subtitle">Real-time sellable stock tracking and batch management</p>
        </div>
        <button className="btn-primary" onClick={() => setIsAddModalOpen(true)}>
          + Add Medicine
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Filter and Search Bar */}
      <div className="card filter-bar">
        <form onSubmit={handleSearchSubmit} className="search-form">
          <input
            type="text"
            placeholder="Search by medicine name (e.g. Paracetamol)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
          <button type="submit" className="btn-secondary">
            Search
          </button>
        </form>

        <div className="sort-controls">
          <label htmlFor="sortBy">Sort by:</label>
          <select
            id="sortBy"
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className="select-input"
          >
            <option value="name">Name</option>
            <option value="created_at">Date Created</option>
            <option value="sellable_stock">Sellable Stock</option>
          </select>

          <select
            value={order}
            onChange={(e) => {
              setOrder(e.target.value);
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className="select-input"
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="card table-card">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading inventory...</p>
          </div>
        ) : medicines.length === 0 ? (
          <div className="empty-state-box">
            <p>No medicines found matching your criteria.</p>
            {search && (
              <button
                className="btn-secondary btn-sm"
                onClick={() => setSearch('')}
                style={{ marginTop: '0.75rem' }}
              >
                Clear Search Filter
              </button>
            )}
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Description</th>
                  <th>Sellable Stock</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {medicines.map((med) => {
                  const isAvailable = Number(med.sellableStock) > 0;
                  return (
                    <tr key={med.id}>
                      <td className="table-cell-title">
                        <Link to={`/inventory/${med.id}`} className="table-link">
                          {med.name}
                        </Link>
                      </td>
                      <td className="table-cell-muted">{med.description || 'No description provided'}</td>
                      <td>
                        <strong className="stock-number">
                          {Number(med.sellableStock).toLocaleString()} units
                        </strong>
                      </td>
                      <td>
                        <Badge
                          status={isAvailable ? 'In Stock' : 'Out of Stock'}
                          text={isAvailable ? 'In Stock' : 'Out of Stock'}
                        />
                      </td>
                      <td>
                        <div className="action-button-group">
                          <Link to={`/inventory/${med.id}`} className="btn-secondary btn-xs">
                            Batches
                          </Link>
                          <Link
                            to={`/dispense?medicineId=${med.id}`}
                            className={`btn-primary btn-xs ${!isAvailable ? 'btn-disabled' : ''}`}
                            title={!isAvailable ? 'No sellable stock available' : 'Dispense now'}
                          >
                            Dispense
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Server-side Pagination Footer */}
        {pagination.totalPages > 1 && (
          <div className="pagination-bar">
            <div className="pagination-info">
              Showing page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages}</strong> (Total {pagination.total} medicines)
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

      {/* Add Medicine Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add New Medicine">
        {addMedError && <div className="alert alert-error">{addMedError}</div>}
        <form onSubmit={handleAddMedicineSubmit}>
          <div className="form-group">
            <label htmlFor="medName">Medicine Name *</label>
            <input
              id="medName"
              type="text"
              placeholder="e.g. Ciprofloxacin 500mg"
              value={newMedData.name}
              onChange={(e) => setNewMedData((prev) => ({ ...prev, name: e.target.value }))}
              disabled={addMedLoading}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="medDesc">Description</label>
            <textarea
              id="medDesc"
              placeholder="Dosage form, therapeutic class, or notes..."
              value={newMedData.description}
              onChange={(e) => setNewMedData((prev) => ({ ...prev, description: e.target.value }))}
              disabled={addMedLoading}
              rows={3}
            />
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsAddModalOpen(false)}
              disabled={addMedLoading}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={addMedLoading}>
              {addMedLoading ? 'Saving...' : 'Create Medicine'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
