import {
  type ReactNode,
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { type AuthUser, authApi } from './auth-api'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export type AuthContextValue = {
  status: AuthStatus
  user: AuthUser | null
  setUser: (u: AuthUser | null) => void
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)

  const refresh = useCallback(async () => {
    try {
      const u = await authApi.getMe()
      setUser(u)
      setStatus('authenticated')
    } catch {
      setUser(null)
      setStatus('anonymous')
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setUser(null)
      setStatus('anonymous')
      window.location.hash = '#/login'
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, setUser, refresh, signOut }),
    [status, user, refresh, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
