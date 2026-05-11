'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/auth/apiClient'
import { useAuth } from '@/auth/AuthContext'
import {
  DELETE_ACCOUNT_CONFIRM_PHRASE,
  isDeleteAccountPhraseConfirmed,
} from '@/lib/deleteAccountConfirm'
import settingsStyles from '@/sections/UserSettingsSection.module.css'

export { DELETE_ACCOUNT_CONFIRM_PHRASE }

export function SettingsDeleteAccount({ apiSessionReady }: Readonly<{ apiSessionReady: boolean }>) {
  const router = useRouter()
  const { user, logout } = useAuth()
  const [phrase, setPhrase] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirmed = isDeleteAccountPhraseConfirmed(phrase)
  const canDelete = Boolean(user && apiSessionReady && confirmed && !deleting)

  const handleDelete = async () => {
    if (!user || !canDelete) return
    setDeleting(true)
    setError(null)
    try {
      const idToken = await user.getIdToken()
      const res = await apiClient.deleteJson('/api/user/account', { idToken })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || data.ok === false) {
        setError(data.error ?? `Could not delete account (${res.status}).`)
        setDeleting(false)
        return
      }
      try {
        await logout()
      } catch {
        /* Server account is gone; clear local session best-effort. */
      }
      router.replace('/auth/')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.')
      setDeleting(false)
    }
  }

  if (!user) {
    return null
  }

  return (
    <div className={settingsStyles.dangerRegion}>
      <h2 className={settingsStyles.dangerTitle} id="delete-account-heading">
        Delete account
      </h2>
      <p className={settingsStyles.dangerLede}>
        This permanently removes your Chronogrove account: your Firestore profile (including
        integrations, widget data, and OAuth material), username and custom-domain claims, and your
        Firebase sign-in. This cannot be undone.
      </p>
      <p className={settingsStyles.dangerLede}>
        To confirm, type{' '}
        <strong className={settingsStyles.dangerPhrase}>{DELETE_ACCOUNT_CONFIRM_PHRASE}</strong>{' '}
        in the box below.
      </p>

      <label className={settingsStyles.dangerLabel} htmlFor="delete-account-confirm">
        <span>Confirmation</span>
        <input
          id="delete-account-confirm"
          type="text"
          className={settingsStyles.dangerInput}
          value={phrase}
          onChange={(e) => {
            setPhrase(e.target.value)
            setError(null)
          }}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={deleting || !apiSessionReady}
          aria-describedby="delete-account-heading"
          placeholder={DELETE_ACCOUNT_CONFIRM_PHRASE}
        />
      </label>

      <button
        type="button"
        className={settingsStyles.btnDanger}
        disabled={!canDelete}
        onClick={() => {
          handleDelete().catch(() => {})
        }}
      >
        {deleting ? 'Deleting…' : 'Delete my account permanently'}
      </button>

      {!apiSessionReady ? (
        <p className={settingsStyles.dangerHint}>Waiting for session…</p>
      ) : null}
      {error ? (
        <p className={settingsStyles.feedbackError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
