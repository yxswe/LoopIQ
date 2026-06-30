import { useState } from 'react'
import { authApi } from '../auth/auth-api'
import { useAuth } from '../auth/useAuth'
import { navigate } from '../router/useRoute'
import { ApiError } from '../lib/api'
import { AuthShell } from './shared/AuthShell'
import { ErrorBanner } from './shared/ErrorBanner'
import { FormField } from './shared/FormField'

export const SignupPage = () => {
  const { refresh } = useAuth()
  const [invitationCode, setInvitationCode] = useState('')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await authApi.signup({
        invitationCode: invitationCode.trim(),
        email: email.trim(),
        displayName: displayName.trim() || null,
        password,
      })
      await refresh()
      navigate('/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Signup failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell title="Sign up">
      <ErrorBanner message={error} />
      <form onSubmit={submit}>
        <FormField
          label="Invitation code"
          required
          value={invitationCode}
          onChange={(e) => setInvitationCode(e.target.value)}
          hint="Ask the admin for an invitation."
        />
        <FormField
          label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <FormField
          label="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <FormField
          label="Password"
          type="password"
          required
          minLength={8}
          maxLength={72}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="At least 8 characters."
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-[12px] bg-dls-accent px-4 py-2 text-[14px] text-white disabled:opacity-60"
        >
          {submitting ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p className="mt-4 text-center text-[13px] text-dls-secondary">
        Already have an account?{' '}
        <a className="text-dls-accent" href="#/login">
          Sign in
        </a>
      </p>
    </AuthShell>
  )
}
