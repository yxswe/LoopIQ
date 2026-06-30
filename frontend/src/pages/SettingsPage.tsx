import { useCallback, useEffect, useState } from 'react'
import { authApi, type SessionListItem } from '../auth/auth-api'
import { useAuth } from '../auth/useAuth'
import { navigate } from '../router/useRoute'
import { ApiError } from '../lib/api'
import { ErrorBanner } from './shared/ErrorBanner'
import { FormField } from './shared/FormField'

export const SettingsPage = () => {
  const { user, signOut } = useAuth()
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwOk, setPwOk] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')

  const load = useCallback(async () => {
    try {
      setSessions(await authApi.listSessions())
    } catch {
      // ignore
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError(null)
    setPwOk(false)
    try {
      await authApi.changePassword({ currentPassword: current, newPassword: next })
      setPwOk(true)
      setCurrent('')
      setNext('')
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : 'Could not change password')
    }
  }

  const kick = async (id: string) => {
    await authApi.deleteSession(id)
    await load()
  }

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-8 px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-[20px] font-medium">Settings</h1>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded-[12px] border border-dls-border bg-dls-surface px-3 py-1 text-[13px] text-dls-text"
        >
          ← Back
        </button>
      </header>

      <section>
        <h2 className="mb-3 text-[15px] text-dls-text">Account</h2>
        <p className="text-[13px] text-dls-secondary">
          Signed in as{' '}
          <span className="text-dls-text">{user?.email ?? user?.displayName ?? user?.id}</span>
        </p>
        <button
          type="button"
          onClick={signOut}
          className="mt-3 rounded-[12px] border border-dls-border bg-dls-surface px-3 py-1 text-[13px] text-dls-text"
        >
          Sign out
        </button>
      </section>

      <section>
        <h2 className="mb-3 text-[15px] text-dls-text">Change password</h2>
        <ErrorBanner message={pwError} />
        {pwOk ? (
          <p className="mb-3 text-[13px] text-green-500">Password updated.</p>
        ) : null}
        <form onSubmit={submitPassword}>
          <FormField
            label="Current password"
            type="password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <FormField
            label="New password"
            type="password"
            required
            minLength={8}
            maxLength={72}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            hint="At least 8 characters."
          />
          <button
            type="submit"
            className="rounded-[12px] bg-dls-accent px-4 py-2 text-[14px] text-white"
          >
            Update password
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-[15px] text-dls-text">Active sessions</h2>
        <div className="overflow-hidden rounded-[12px] border border-dls-border">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 border-b border-dls-border px-3 py-2 text-[13px] last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-dls-text">
                  {s.userAgent ?? 'Unknown device'} {s.isCurrent ? '(current)' : ''}
                </div>
                <div className="text-[12px] text-dls-secondary">
                  IP {s.ipAddress ?? '—'} · last seen {new Date(s.lastSeenAt).toLocaleString()}
                </div>
              </div>
              {s.isCurrent ? (
                <span className="text-[12px] text-dls-secondary">—</span>
              ) : (
                <button
                  type="button"
                  onClick={() => kick(s.id)}
                  className="rounded-[8px] border border-dls-border bg-dls-surface px-2 py-1 text-[12px] text-dls-text"
                >
                  Sign out
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
