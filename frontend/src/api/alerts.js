import { apiClient } from './client';

export async function getExpiringAlertsApi(days = 30) {
  const params = new URLSearchParams();
  if (days) params.append('days', days);
  return apiClient(`/alerts/expiring?${params.toString()}`);
}
