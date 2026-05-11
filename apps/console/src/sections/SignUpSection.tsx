'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '../auth/AuthContext'
import styles from './SignUpSection.module.css'

export function SignUpSection() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const { error, setError, signUpWithEmail, signInWithGoogle } = useAuth()

  const passwordsMatch = password === confirmPassword
  const canSubmit = email && password.length >= 6 && passwordsMatch && !loading

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!passwordsMatch) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      await signUpWithEmail(email, password)
      router.push('/verify-email/')
    } catch {
      // error is set by AuthContext
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setError(null)
    setLoading(true)
    try {
      await signInWithGoogle()
      router.push('/onboarding/')
    } catch {
      // error is set by AuthContext
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.card}>
        <div className={styles.badge}>Get started</div>
        <h2 className={styles.heading}>Create your account</h2>
        <p className={styles.subheading}>
          Set up a Chronogrove account to start syncing your data from connected providers.
        </p>

        {error && (
          <div className={styles.messageError} role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </label>
          <label className={styles.label}>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              placeholder="At least 6 characters"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </label>
          <label className={styles.label}>
            <span>Confirm password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={`${styles.input} ${confirmPassword && !passwordsMatch ? styles.inputError : ''}`}
              placeholder="Re-enter your password"
              required
              minLength={6}
              autoComplete="new-password"
            />
            {confirmPassword && !passwordsMatch && (
              <span className={styles.fieldError}>Passwords do not match</span>
            )}
          </label>
          <button type="submit" className={styles.btnPrimary} disabled={!canSubmit}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <div className={styles.divider}>
          <span>or</span>
        </div>

        <button
          type="button"
          className={styles.btnGoogle}
          onClick={handleGoogle}
          disabled={loading}
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <p className={styles.switchText}>
          Already have an account?{' '}
          <Link href="/auth/" className={styles.switchLink}>
            Sign in
          </Link>
        </p>
      </div>
    </section>
  )
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}
