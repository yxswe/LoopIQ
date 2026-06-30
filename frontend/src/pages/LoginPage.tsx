import { useEffect, useState } from 'react'
import { authApi, type ProviderConfig } from '../auth/auth-api'
import { useAuth } from '../auth/useAuth'
import { navigate } from '../router/useRoute'
import { ApiError } from '../lib/api'
import { AuthShell } from './shared/AuthShell'
import { ErrorBanner } from './shared/ErrorBanner'
import { FormField } from './shared/FormField'

export const LoginPage = () => {
  const { refresh } = useAuth()
  const [providers, setProviders] = useState<ProviderConfig['providers']>(['password'])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [wechat, setWechat] = useState<{ qrUrl: string; state: string } | null>(null)

  useEffect(() => {
    authApi.getConfig().then((cfg) => setProviders(cfg.providers)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!wechat) return
    let cancelled = false
    const tick = async () => {
      try {
        const r = await authApi.wechatPoll(wechat.state)
        if (cancelled) return
        if (r.status === 'success') {
          await refresh()
          navigate('/')
          return
        }
        if (r.status === 'expired') {
          setWechat(null)
          setError('WeChat QR expired, please retry')
          return
        }
      } catch {
        // network blip — retry
      }
      setTimeout(tick, 2000)
    }
    tick()
    return () => {
      cancelled = true
    }
  }, [wechat, refresh])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await authApi.login({ email, password })
      await refresh()
      navigate('/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  const showWechat = async () => {
    try {
      const r = await authApi.wechatQr(null)
      setWechat({ qrUrl: r.qrUrl, state: r.state })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'WeChat unavailable')
    }
  }

  return (
    <AuthShell title="Sign in">
      <ErrorBanner message={error} />

      <form onSubmit={submit}>
        <FormField
          label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <FormField
          label="Password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-[12px] bg-dls-accent px-4 py-2 text-[14px] text-white disabled:opacity-60"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {providers.includes('google') ? (
        <a
          href={authApi.googleStart(null)}
          className="mt-3 block rounded-[12px] border border-dls-border bg-dls-surface px-4 py-2 text-center text-[14px] text-dls-text"
        >
          Continue with Google
        </a>
      ) : null}

      {providers.includes('wechat') ? (
        <>
          <button
            type="button"
            onClick={showWechat}
            className="mt-3 w-full rounded-[12px] border border-dls-border bg-dls-surface px-4 py-2 text-[14px] text-dls-text"
          >
            Continue with WeChat
          </button>
          {wechat ? (
            <div className="mt-3 rounded-[12px] border border-dls-border bg-dls-surface p-3 text-center text-[12px] text-dls-secondary">
              Open WeChat → Scan:
              <div className="mt-2 break-all text-dls-text">{wechat.qrUrl}</div>
            </div>
          ) : null}
        </>
      ) : null}

      <p className="mt-4 text-center text-[13px] text-dls-secondary">
        Need an account?{' '}
        <a className="text-dls-accent" href="#/signup">
          Sign up
        </a>
      </p>
    </AuthShell>
  )
}
