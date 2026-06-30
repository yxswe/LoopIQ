import type { Provider } from '../auth.types.ts'

export type ProviderProfile = {
  provider: Provider
  subject: string
  email: string | null
  displayName: string | null
  avatarUrl: string | null
  rawMetadata: unknown
}

export type OAuthProvider = {
  name: Provider
  buildAuthorizeUrl: (state: string) => string
  exchangeCode: (code: string) => Promise<ProviderProfile>
}
