'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { ConfirmationResult } from 'firebase/auth'
import { useAuth } from '../auth/AuthContext'
import { mustVerifyEmailBeforeConsole } from '../lib/emailVerificationGate'
import styles from './AuthSection.module.css'

const TABS = [
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Phone' },
  { id: 'google', label: 'Google' },
] as const

type TabId = (typeof TABS)[number]['id']

export function AuthSection() {
  const router = useRouter()
  const [tab, setTab] = useState<TabId>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [phoneStep, setPhoneStep] = useState<'send' | 'confirm'>('send')
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null)
  const [loading, setLoading] = useState(false)

  const { user, loading: authLoading, error, setError, signInWithGoogle, signInWithEmail, signInWithPhone } =
    useAuth()

  useEffect(() => {
    if (authLoading || !user) return
    if (mustVerifyEmailBeforeConsole(user)) {
      router.replace('/verify-email/')
    }
  }, [authLoading, user, router])

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signInWithEmail(email, password)
    } finally {
      setLoading(false)
    }
  }

  const handlePhoneSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (phoneStep === 'send') {
        const result = await signInWithPhone(phone)
        setConfirmationResult(result)
        setPhoneStep('confirm')
      } else if (confirmationResult) {
        await confirmationResult.confirm(code)
        setConfirmationResult(null)
        setPhoneStep('send')
        setCode('')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setError(null)
    setLoading(true)
    try {
      await signInWithGoogle()
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className={styles.section}>
      <a href="https://chronogrove.com" className={styles.siteLink} rel="noopener noreferrer">
        ← Visit chronogrove.com
      </a>
      <div className={styles.card}>
        <h2 className={styles.heading}>Sign in</h2>
        <p className={styles.adminNote}>Chronogrove console access.</p>
        <p className={styles.subheading}>Sign in to access session helpers, endpoint testing, and manual sync tools.</p>

        <div className={styles.tabs} role="tablist" aria-label="Sign-in methods">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`auth-panel-${t.id}`}
              id={`auth-tab-${t.id}`}
              onClick={() => {
                setTab(t.id)
                setError(null)
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className={styles.messageError} role="alert">
            {error}
          </div>
        )}

        {tab === 'email' && (
          <div role="tabpanel" id="auth-panel-email" aria-labelledby="auth-tab-email">
            <form onSubmit={handleEmailSubmit} className={styles.form}>
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
                  placeholder="Password"
                  required
                  autoComplete="current-password"
                />
              </label>
              <button type="submit" className={styles.btnPrimary} disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
            <div className={styles.divider}>or</div>
            <button
              type="button"
              className={styles.btnGoogle}
              onClick={handleGoogle}
              disabled={loading}
            >
              <GoogleIcon />
              Continue with Google
            </button>
          </div>
        )}

        {tab === 'phone' && (
          <div role="tabpanel" id="auth-panel-phone" aria-labelledby="auth-tab-phone">
            <div id="phone-recaptcha" />
            <form onSubmit={handlePhoneSubmit} className={styles.form}>
              <label className={styles.label}>
                Phone number
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={styles.input}
                  placeholder="+1 555 123 4567"
                  required={phoneStep === 'send'}
                  disabled={phoneStep === 'confirm'}
                />
              </label>
              {phoneStep === 'confirm' && (
                <label className={styles.label}>
                  Verification code
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className={styles.input}
                    placeholder="6-digit code"
                    maxLength={6}
                    required
                  />
                </label>
              )}
              <button type="submit" className={styles.btnPrimary} disabled={loading}>
                {loading ? '…' : phoneStep === 'send' ? 'Send code' : 'Verify'}
              </button>
            </form>
            <div className={styles.divider}>or</div>
            <button
              type="button"
              className={styles.btnGoogle}
              onClick={handleGoogle}
              disabled={loading}
            >
              <GoogleIcon />
              Continue with Google
            </button>
          </div>
        )}

        {tab === 'google' && (
          <div
            className={styles.googleOnly}
            role="tabpanel"
            id="auth-panel-google"
            aria-labelledby="auth-tab-google"
          >
            <p className={styles.googleText}>Sign in with your Google account.</p>
            <button
              type="button"
              className={styles.btnGoogle}
              onClick={handleGoogle}
              disabled={loading}
            >
              <GoogleIcon />
              Continue with Google
            </button>
          </div>
        )}
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
