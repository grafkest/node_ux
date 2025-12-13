export type AuthTokens = {
  accessToken: string;
  refreshToken?: string;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

let tokens: AuthTokens | null = null;

const listeners = new Set<() => void>();

export const authStore = {
  getTokens: (): AuthTokens | null => tokens,
  setTokens: (next: AuthTokens | null) => {
    tokens = next;
    listeners.forEach((listener) => listener());
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
};

export function buildApiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  if (!path.startsWith('/')) {
    return `${API_BASE}/${path}`;
  }
  if (API_BASE.endsWith('/')) {
    return `${API_BASE.slice(0, -1)}${path}`;
  }
  return `${API_BASE}${path}`;
}

function redirectToLogin() {
  if (typeof window !== 'undefined') {
    window.location.replace('/login');
  }
}

export type ApiRequestOptions = RequestInit & { skipAuth?: boolean };

export async function apiFetch(input: string, options: ApiRequestOptions = {}): Promise<Response> {
  const url = buildApiUrl(input);
  const headers = new Headers(options.headers ?? {});

  if (!options.skipAuth && tokens?.accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${tokens.accessToken}`);
  }

  const response = await fetch(url, { ...options, headers });

  if (!options.skipAuth && (response.status === 401 || response.status === 403)) {
    authStore.setTokens(null);
    redirectToLogin();
  }

  return response;
}

export async function readJsonSafe<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return (await response.json()) as T;
  }
  return null;
}

export const persistTokens = (next: AuthTokens | null) => {
  authStore.setTokens(next);
  if (typeof window === 'undefined') return;
  if (next) {
    localStorage.setItem('auth_tokens', JSON.stringify(next));
  } else {
    localStorage.removeItem('auth_tokens');
  }
};

export const restoreTokens = (): AuthTokens | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = localStorage.getItem('auth_tokens');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthTokens;
    authStore.setTokens(parsed);
    return parsed;
  } catch (error) {
    console.error('Failed to parse stored auth tokens', error);
    localStorage.removeItem('auth_tokens');
    return null;
  }
};
