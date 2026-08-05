import type { LoginResponse, Usuario } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options?.body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...options?.headers as Record<string, string> },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function login(email: string, senha: string): Promise<LoginResponse> {
  const data = await apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, senha }),
  });

  localStorage.setItem('token', data.token);
  localStorage.setItem('usuario', JSON.stringify(data.usuario));

  return data;
}

export function logout(): void {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
}

export function getStoredUser(): Usuario | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('usuario');
  return raw ? JSON.parse(raw) as Usuario : null;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}
