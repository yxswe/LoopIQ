export type Role = 'admin' | 'user'
export type Provider = 'password' | 'google' | 'wechat'

export type User = {
  id: string
  email: string | null
  emailVerified: boolean
  displayName: string | null
  avatarUrl: string | null
  role: Role
  createdAt: number
  lastLoginAt: number | null
}

export type UserRow = {
  id: string
  email: string | null
  email_verified: number
  password_hash: string | null
  display_name: string | null
  avatar_url: string | null
  role: Role
  created_at: number
  last_login_at: number | null
}

export type Session = {
  id: string
  userId: string
  createdAt: number
  expiresAt: number
  lastSeenAt: number
  userAgent: string | null
  ipAddress: string | null
}

export type SessionRow = {
  id: string
  token_hash: string
  user_id: string
  created_at: number
  expires_at: number
  last_seen_at: number
  user_agent: string | null
  ip_address: string | null
}

export type Identity = {
  id: string
  userId: string
  provider: Provider
  subject: string
  metadata: unknown
  createdAt: number
  lastUsedAt: number | null
}

export type IdentityRow = {
  id: string
  user_id: string
  provider: Provider
  subject: string
  metadata: string | null
  created_at: number
  last_used_at: number | null
}

export type Invitation = {
  id: string
  code: string
  createdBy: string | null
  usedBy: string | null
  usedAt: number | null
  expiresAt: number
  createdAt: number
}

export type InvitationRow = {
  id: string
  code: string
  created_by: string | null
  used_by: string | null
  used_at: number | null
  expires_at: number
  created_at: number
}

export function mapUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    emailVerified: row.email_verified === 1,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  }
}
