import { apiClient } from './client';

export async function dispenseApi({ medicineId, quantity }) {
  return apiClient('/dispense', {
    method: 'POST',
    body: JSON.stringify({ medicineId, quantity }),
  });
}

export async function getDispensingHistoryApi({ page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams();
  if (page) params.append('page', page);
  if (limit) params.append('limit', limit);
  return apiClient(`/dispensing?${params.toString()}`);
}

export async function getDispensingRecordApi(id) {
  return apiClient(`/dispensing/${id}`);
}
