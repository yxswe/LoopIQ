import { apiFetch, apiSilent } from '../lib/api'

export type AuthUser = {
  id: string
  email: string | null
  displayName: string | null
  avatarUrl: string | null
  role: 'admin' | 'user'
  identities: Array<{ provider: 'password' | 'google' | 'wechat'; subject: string }>
}

export type ProviderConfig = { providers: Array<'password' | 'google' | 'wechat'> }

export type SessionListItem = {
  id: string
  createdAt: number
  lastSeenAt: number
  userAgent: string | null
  ipAddress: string | null
  isCurrent: boolean
}

export const authApi = {
  getConfig(): Promise<ProviderConfig> {
    return apiSilent<ProviderConfig>('/api/auth/config')
  },
  getMe(): Promise<AuthUser> {
    return apiSilent<AuthUser>('/api/me')
  },
  signup(input: {
    email: string
    password: string
    displayName: string | null
    invitationCode: string
  }): Promise<{ user: AuthUser }> {
    return apiFetch<{ user: AuthUser }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  login(input: { email: string; password: string }): Promise<{ user: AuthUser }> {
    return apiFetch<{ user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  logout(): Promise<{ ok: true }> {
    return apiFetch<{ ok: true }>('/api/auth/logout', { method: 'POST' })
  },
  changePassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
    return apiFetch<void>('/api/me/password', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  listSessions(): Promise<SessionListItem[]> {
    return apiFetch<SessionListItem[]>('/api/me/sessions')
  },
  deleteSession(id: string): Promise<void> {
    return apiFetch<void>(`/api/me/sessions/${id}`, { method: 'DELETE' })
  },
  googleStart(invitationCode: string | null): string {
    const url = new URL(`${(import.meta.env.VITE_BACKEND_URL as string) ?? 'http://localhost:3000'}/api/auth/oauth/google/start`)
    if (invitationCode) url.searchParams.set('invitationCode', invitationCode)
    return url.toString()
  },
  wechatQr(invitationCode: string | null): Promise<{ qrUrl: string; state: string; expiresAt: number }> {
    const qs = invitationCode ? `?invitationCode=${encodeURIComponent(invitationCode)}` : ''
    return apiSilent<{ qrUrl: string; state: string; expiresAt: number }>(`/api/auth/oauth/wechat/qr${qs}`)
  },
  wechatPoll(state: string): Promise<{ status: 'pending' | 'success' | 'expired' }> {
    return apiSilent<{ status: 'pending' | 'success' | 'expired' }>(`/api/auth/oauth/wechat/poll/${state}`)
  },
}
