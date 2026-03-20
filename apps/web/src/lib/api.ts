import { useAuthStore } from '../stores/auth';

export function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = useAuthStore.getState().token;
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(url, { ...init, headers }).then((response) => {
    if (response.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return response;
  });
}

export function apiJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  return apiFetch(url, init).then((r) => {
    if (!r.ok) throw new Error(`API ${r.status}: ${r.statusText}`);
    return r.json() as Promise<T>;
  });
}
