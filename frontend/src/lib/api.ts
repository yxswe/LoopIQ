const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? 'http://localhost:3000'

export class ApiError extends Error {
  code: string
  status?: number

  constructor(code: string, message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export function getBackendUrl(): string {
  return BACKEND_URL
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  })
  if (res.status === 401) {
    // Only auto-redirect for protected endpoints — the caller (apiSilent below)
    // can opt out by catching this case before navigation occurs.
    if (typeof window !== 'undefined' && !window.location.hash.startsWith('#/login')) {
      window.location.hash = '#/login'
    }
    throw new ApiError('UNAUTHORIZED', 'Login required', 401)
  }
  if (!res.ok) {
    let body: { error?: { code?: string; message?: string } } | null = null
    try {
      body = (await res.json()) as { error?: { code?: string; message?: string } }
    } catch {
      // fall through
    }
    throw new ApiError(
      body?.error?.code ?? 'INTERNAL',
      body?.error?.message ?? res.statusText,
      res.status,
    )
  }
  // 204 No Content
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/** Same as apiFetch but never auto-redirects on 401 (used for the boot probe). */
export async function apiSilent<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  })
  if (!res.ok) {
    throw new ApiError('NOT_OK', res.statusText, res.status)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export async function pingHealth(): Promise<{ status: string; uptime: number }> {
  return apiSilent<{ status: string; uptime: number }>('/health')
}
