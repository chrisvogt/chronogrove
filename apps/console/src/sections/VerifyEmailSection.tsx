'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { applyActionCode, reload } from 'firebase/auth'
import { useAuth } from '../auth/AuthContext'
import { mustVerifyEmailBeforeConsole } from '../lib/emailVerificationGate'
import styles from './VerifyEmailSection.module.css'

function applyActionCodeErrorMessage(e: { code?: string; message?: string }): string {
  if (e.code === 'auth/expired-action-code') {
    return 'This link has expired. Sign in and use “Resend verification email” below.'
  }
  if (e.code === 'auth/invalid-action-code') {
    return 'This verification link is invalid or was already used.'
  }
  return e.message ?? 'Could not verify your email.'
}

export function VerifyEmailSection() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading, auth, error, setError, resendVerificationEmail, logout } = useAuth()
  const [actionLoading, setActionLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [codeHandled, setCodeHandled] = useState(false)

  const oobCode = searchParams.get('oobCode')
  const mode = searchParams.get('mode')

  useEffect(() => {
    if (loading || !auth || codeHandled) return
    if (mode !== 'verifyEmail' || !oobCode) return

    let cancelled = false
    setActionLoading(true)
    setError(null)
    applyActionCode(auth, oobCode)
      .then(async () => {
        if (cancelled) return
        const cu = auth.currentUser
        if (cu) await reload(cu)
        setActionMessage('Your email is verified. Redirecting…')
        setCodeHandled(true)
        router.replace('/verify-email/')
      })
      .catch((e: { code?: string; message?: string }) => {
        if (cancelled) return
        setError(applyActionCodeErrorMessage(e))
        setCodeHandled(true)
      })
      .finally(() => {
        if (!cancelled) setActionLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [loading, auth, mode, oobCode, codeHandled, router, setError])

  const onResend = useCallback(async () => {
    setError(null)
    setActionMessage(null)
    setActionLoading(true)
    try {
      await resendVerificationEmail()
      setActionMessage('Verification email sent. Check your inbox.')
    } catch (e) {
      const err = e as { code?: string; message?: string }
      setError(
        err.code === 'auth/too-many-requests'
          ? 'Too many requests. Wait a few minutes and try again.'
          : err.message ?? 'Could not send email.'
      )
    } finally {
      setActionLoading(false)
    }
  }, [resendVerificationEmail, setError])

  if (loading || (mode === 'verifyEmail' && oobCode && !codeHandled && actionLoading)) {
    return (
      <section className={styles.section}>
        <div className={styles.card}>
          <p className={styles.lead}>Verifying your email…</p>
          <div className="spinner" aria-hidden />
        </div>
      </section>
    )
  }

  if (!user) {
    return (
      <section className={styles.section}>
        <div className={styles.card}>
          <h1 className={styles.heading}>Verify your email</h1>
          <p className={styles.lead}>
            Sign in with your email and password to resend a verification link or complete verification.
          </p>
          <Link href="/auth/" className={styles.button}>
            Sign in
          </Link>
        </div>
      </section>
    )
  }

  if (!mustVerifyEmailBeforeConsole(user)) {
    return (
      <section className={styles.section}>
        <div className={styles.card}>
          <h1 className={styles.heading}>You&apos;re verified</h1>
          <p className={styles.lead}>Your email is confirmed. Continue to the console or onboarding.</p>
          <div className={styles.actions}>
            <Link href="/schema/" className={styles.button}>
              Open console
            </Link>
            <Link href="/onboarding/" className={styles.link}>
              Onboarding
            </Link>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className={styles.section}>
      <a href="https://www.chrisvogt.me" className={styles.siteLink} rel="noopener noreferrer">
        ← Visit chrisvogt.me
      </a>
      <div className={styles.card}>
        <h1 className={styles.heading}>Verify your email</h1>
        <p className={styles.lead}>
          We sent a link to your address. Open it to confirm your account and unlock the console. You can
          resend the email if it expired or never arrived.
        </p>
        {user.email && <p className={styles.email}>{user.email}</p>}
        {error && (
          <div className={styles.messageError} role="alert">
            {error}
          </div>
        )}
        {actionMessage && <div className={styles.messageOk}>{actionMessage}</div>}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            disabled={actionLoading}
            onClick={() => {
              onResend().catch(() => undefined)
            }}
          >
            Resend verification email
          </button>
        </div>
        <p className={styles.linkMuted}>
          <button
            type="button"
            className={styles.link}
            onClick={() => {
              logout().catch(() => undefined)
            }}
          >
            Sign out
          </button>
        </p>
      </div>
    </section>
  )
}
