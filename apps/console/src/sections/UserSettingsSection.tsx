'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { ChronogroveThemeOptionList } from '@/components/ChronogroveThemeOptionList'
import type { ChronogroveThemeId } from '@/theme/chronogroveTheme'
import { useChronogroveThemePersist } from '@/theme/useChronogroveThemePersist'
import { SettingsProfileIdentity } from '@/components/user-settings/SettingsProfileIdentity'
import { SettingsDeleteAccount } from '@/components/user-settings/SettingsDeleteAccount'
import { mustVerifyEmailBeforeConsole } from '@/lib/emailVerificationGate'
import styles from './UserSettingsSection.module.css'

export function UserSettingsSection() {
  const router = useRouter()
  const { user, loading, apiSessionReady } = useAuth()
  const { activeTheme, persist } = useChronogroveThemePersist()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth/')
    }
  }, [loading, user, router])

  useEffect(() => {
    if (loading || !user) return
    if (mustVerifyEmailBeforeConsole(user)) {
      router.replace('/verify-email/')
    }
  }, [loading, user, router])

  const saveTheme = useCallback(
    async (next: ChronogroveThemeId) => {
      setSaving(true)
      setMessage(null)
      const r = await persist(next)
      if (r.serverOk) {
        setMessage(user && apiSessionReady ? 'Saved.' : 'Applied on this device.')
      } else {
        setMessage(r.error ?? 'Could not save theme.')
      }
      setSaving(false)
    },
    [persist, user, apiSessionReady]
  )

  if (loading) {
    return (
      <section className={styles.section}>
        <div className={styles.card}>
          <div className={styles.loadingState}>
            <span className="spinner" aria-hidden />
            <p>Loading…</p>
          </div>
        </div>
      </section>
    )
  }

  if (!user) {
    return null
  }

  return (
    <section className={styles.section}>
      <Link href="/" className={styles.backLink}>
        ← Dashboard
      </Link>
      <div className={styles.card}>
        <h1 className={styles.pageTitle}>Settings</h1>
        <p className={styles.pageLede}>
          The background behind this card updates when you pick a theme — same as onboarding and sign-in.
        </p>

        <h2 className={styles.h2} id="appearance-heading">
          Appearance
        </h2>
        <p className={styles.lede}>
          Your choice syncs to your account. You can also switch from the avatar menu or the sign-in screen.
        </p>

        <ChronogroveThemeOptionList
          value={activeTheme}
          disabled={saving}
          labelledBy="appearance-heading"
          onSelect={(id) => {
            saveTheme(id).catch(() => undefined)
          }}
        />

        {saving ? <p className={styles.hint}>Saving…</p> : null}
        {message && !saving ? <p className={styles.feedback}>{message}</p> : null}

        <div className={styles.profileRegion}>
          <h2 className={styles.h2} id="profile-heading">
            Profile &amp; API host
          </h2>
          <p className={styles.lede}>
            Update your public username and the custom domain for your widget API after you&rsquo;ve
            finished onboarding.
          </p>
          <SettingsProfileIdentity user={user} apiSessionReady={apiSessionReady} />
        </div>

        <SettingsDeleteAccount apiSessionReady={apiSessionReady} />
      </div>
    </section>
  )
}
