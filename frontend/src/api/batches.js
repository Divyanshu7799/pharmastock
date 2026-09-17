import { apiClient } from './client';

export async function getBatchesByMedicineApi(medicineId) {
  return apiClient(`/medicines/${medicineId}/batches`);
}

export async function createBatchApi(medicineId, { batchNumber, quantity, expiryDate }) {
  return apiClient(`/medicines/${medicineId}/batches`, {
    method: 'POST',
    body: JSON.stringify({ batchNumber, quantity, expiryDate }),
  });
}

export async function updateBatchApi(id, { quantity, expiryDate }) {
  return apiClient(`/batches/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ quantity, expiryDate }),
  });
}

export async function deleteBatchApi(id) {
  return apiClient(`/batches/${id}`, {
    method: 'DELETE',
  });
}
