const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

/**
 * Generic fetch wrapper for all backend REST API calls.
 * Automatically injects JWT Bearer token and formats structured errors.
 * @param {string} endpoint - API path (e.g. '/medicines')
 * @param {Object} [options] - fetch options
 * @returns {Promise<any>}
 */
export async function apiClient(endpoint, options = {}) {
  const token = localStorage.getItem('pharmastock_token');

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers,
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, config);

  let data = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  }

  if (!response.ok) {
    const error = new Error(data?.error || data?.message || `HTTP ${response.status} error`);
    error.status = response.status;
    error.data = data;
    if (data?.requestedQuantity !== undefined) error.requestedQuantity = data.requestedQuantity;
    if (data?.availableQuantity !== undefined) error.availableQuantity = data.availableQuantity;
    throw error;
  }

  return data;
}
