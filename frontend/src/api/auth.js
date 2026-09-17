import { apiClient } from './client';

export async function registerApi({ name, email, password }) {
  return apiClient('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
}

export async function loginApi({ email, password }) {
  return apiClient('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function getMeApi() {
  return apiClient('/auth/me');
}
