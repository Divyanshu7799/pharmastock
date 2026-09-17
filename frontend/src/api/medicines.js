import { apiClient } from './client';

export async function getMedicinesApi({ search = '', page = 1, limit = 10, sortBy = 'name', order = 'asc' } = {}) {
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (page) params.append('page', page);
  if (limit) params.append('limit', limit);
  if (sortBy) params.append('sortBy', sortBy);
  if (order) params.append('order', order);

  return apiClient(`/medicines?${params.toString()}`);
}

export async function getMedicineByIdApi(id) {
  return apiClient(`/medicines/${id}`);
}

export async function getMedicineStockApi(id) {
  return apiClient(`/medicines/${id}/stock`);
}

export async function createMedicineApi({ name, description }) {
  return apiClient('/medicines', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  });
}

export async function updateMedicineApi(id, { name, description }) {
  return apiClient(`/medicines/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, description }),
  });
}

export async function deleteMedicineApi(id) {
  return apiClient(`/medicines/${id}`, {
    method: 'DELETE',
  });
}
