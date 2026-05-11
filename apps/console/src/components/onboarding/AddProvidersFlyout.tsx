'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { apiClient } from '@/auth/apiClient'
import { useAuth } from '@/auth/AuthContext'
import { ProviderConnectionGrid } from '@/components/onboarding/ProviderConnectionGrid'
import obStyles from '@/sections/OnboardingSection.module.css'
import styles from './AddProvidersFlyout.module.css'

interface OnboardingProgressPayload {
  currentStep: string
  completedSteps: string[]
  username: string | null
  connectedProviderIds: string[]
  integrationStatuses?: Record<string, string>
  customDomain: string | null
}

export function AddProvidersFlyout({
  open,
  onClose,
  onSaved,
}: Readonly<{
  open: boolean
  onClose: () => void
  onSaved?: () => void
}>) {
  const { user, apiSessionReady } = useAuth()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState<Set<string>>(new Set())
  const [integrationStatuses, setIntegrationStatuses] = useState<Record<string, string>>({})
  const [progressReady, setProgressReady] = useState(false)
  const baselineRef = useRef<OnboardingProgressPayload | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    if (!user || !apiSessionReady) return
    setLoading(true)
    setError(null)
    try {
      const idToken = await user.getIdToken()
      const res = await apiClient.getJson('/api/onboarding/progress', { idToken })
      if (!res.ok) throw new Error('Could not load saved connections.')
      const data = (await res.json()) as { ok?: boolean; payload?: OnboardingProgressPayload }
      const p = data.payload
      if (!p) throw new Error('No onboarding data returned.')
      baselineRef.current = p
      setConnected(new Set(p.connectedProviderIds ?? []))
      setIntegrationStatuses(p.integrationStatuses ?? {})
      setProgressReady(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed.')
      baselineRef.current = null
      setConnected(new Set())
      setIntegrationStatuses({})
      setProgressReady(false)
    } finally {
      setLoading(false)
    }
  }, [user, apiSessionReady])

  useEffect(() => {
    if (!open) {
      setProgressReady(false)
      return
    }
    load().catch(() => {})
  }, [open, load])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => panelRef.current?.focus(), 50)
    return () => window.clearTimeout(id)
  }, [open])

  const toggle = (id: string) => {
    setConnected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const cancelOAuthPending = async (providerId: 'flickr' | 'discogs' | 'github') => {
    if (!user) return
    setError(null)
    try {
      const idToken = await user.getIdToken()
      const res = await apiClient.deleteJson(`/api/oauth/${providerId}`, { idToken })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(errBody.error ?? `Cancel failed (${res.status})`)
      }
      await load()
    } catch (e) {
      let providerLabel = 'Flickr'
      if (providerId === 'discogs') providerLabel = 'Discogs'
      else if (providerId === 'github') providerLabel = 'GitHub'
      setError(e instanceof Error ? e.message : `Could not cancel ${providerLabel} link.`)
    }
  }

  const handleOAuthProviderConnect = async (providerId: string) => {
    if ((providerId !== 'flickr' && providerId !== 'discogs' && providerId !== 'github') || !user)
      return
    setError(null)
    try {
      const returnTo =
        typeof window !== 'undefined'
          ? (() => {
              const u = new URL(window.location.href)
              u.searchParams.set('providers', 'open')
              return `${u.pathname}${u.search}`
            })()
          : '/?providers=open'
      const idToken = await user.getIdToken()
      const res = await apiClient.postJson(`/api/oauth/${providerId}/start`, { returnTo }, { idToken })
      const data = (await res.json()) as {
        ok?: boolean
        authorizeUrl?: string
        error?: string
      }
      if (!res.ok || !data.ok || !data.authorizeUrl) {
        throw new Error(data.error ?? `Could not start ${providerId} link (${res.status}).`)
      }
      window.location.assign(data.authorizeUrl)
    } catch (e) {
      setError(e instanceof Error ? e.message : `${providerId} link failed.`)
    }
  }

  const handleSave = async () => {
    if (!user) return
    const baseline = baselineRef.current
    if (!baseline) {
      setError('Progress not loaded yet.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const idToken = await user.getIdToken()
      const body = {
        currentStep: baseline.currentStep,
        completedSteps: baseline.completedSteps,
        username: baseline.username,
        connectedProviderIds: Array.from(connected),
        customDomain: baseline.customDomain,
      }
      const res = await apiClient.putJson('/api/onboarding/progress', body, { idToken })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(errBody.error ?? `Save failed (${res.status})`)
      }
      const saved = (await res.json()) as { payload?: OnboardingProgressPayload }
      const p = saved.payload
      if (p) {
        baselineRef.current = p
        setConnected(new Set(p.connectedProviderIds ?? []))
        setIntegrationStatuses(p.integrationStatuses ?? {})
      } else {
        baselineRef.current = { ...baseline, connectedProviderIds: Array.from(connected) }
      }
      onSaved?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <>
      <button
        type="button"
        className={styles.backdrop}
        aria-label="Close panel"
        onClick={onClose}
      />
      <aside
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-providers-title"
        ref={panelRef}
        tabIndex={-1}
      >
        <header className={styles.panelHeader}>
          <div>
            <h2 id="add-providers-title" className={styles.panelTitle}>
              Add a provider
            </h2>
            <p className={styles.panelSub}>
              Same connection picker as onboarding. Changes sync to your account—open full setup{' '}
              <Link href="/onboarding/" className={styles.linkOnboarding} onClick={onClose}>
                onboarding
              </Link>{' '}
              anytime.
            </p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M4 4l8 8M12 4L4 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className={styles.panelBody}>
          {!user && (
            <p className={styles.signInHint}>
              Sign in to save provider choices, or continue in{' '}
              <Link href="/onboarding/" className={styles.linkOnboarding} onClick={onClose}>
                onboarding
              </Link>
              .
            </p>
          )}
          {user && loading && (
            <div className={styles.loading}>
              <span className="spinner" aria-hidden />
              Loading your connections…
            </div>
          )}
          {user && !loading && (
            <ProviderConnectionGrid
              connectedIds={connected}
              integrationStatuses={integrationStatuses}
              onToggle={toggle}
              onOAuthProviderConnect={handleOAuthProviderConnect}
            />
          )}
          {user && !loading && integrationStatuses.flickr === 'pending_oauth' && (
            <p className={styles.cancelFlickr}>
              <button type="button" className={styles.cancelFlickrBtn} onClick={() => void cancelOAuthPending('flickr')}>
                Cancel Flickr link
              </button>
            </p>
          )}
          {user && !loading && integrationStatuses.discogs === 'pending_oauth' && (
            <p className={styles.cancelFlickr}>
              <button type="button" className={styles.cancelFlickrBtn} onClick={() => void cancelOAuthPending('discogs')}>
                Cancel Discogs link
              </button>
            </p>
          )}
          {user && !loading && integrationStatuses.github === 'pending_oauth' && (
            <p className={styles.cancelFlickr}>
              <button type="button" className={styles.cancelFlickrBtn} onClick={() => void cancelOAuthPending('github')}>
                Cancel GitHub link
              </button>
            </p>
          )}
          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}
        </div>

        <footer className={styles.panelFooter}>
          <div className={styles.actions}>
            <button type="button" className={obStyles.btnSecondary} disabled={saving} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={obStyles.btnPrimary}
              disabled={saving || !user || loading || !progressReady}
              onClick={() => void handleSave()}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </footer>
      </aside>
    </>
  )
}
