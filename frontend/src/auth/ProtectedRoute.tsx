import { type ReactNode, useEffect } from 'react'
import { useAuth } from './useAuth'

export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { status } = useAuth()

  useEffect(() => {
    if (status === 'anonymous' && !window.location.hash.startsWith('#/login') && !window.location.hash.startsWith('#/signup')) {
      window.location.hash = '#/login'
    }
  }, [status])

  if (status === 'loading') {
    return (
      <div className="flex h-dvh items-center justify-center text-dls-secondary">
        Loading…
      </div>
    )
  }
  if (status === 'anonymous') return null
  return <>{children}</>
}
