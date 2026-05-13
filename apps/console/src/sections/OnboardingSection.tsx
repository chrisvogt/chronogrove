'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '../auth/apiClient'
import { useAuth } from '../auth/AuthContext'
import { mustVerifyEmailBeforeConsole } from '../lib/emailVerificationGate'
import { getAppBaseUrl } from '../lib/baseUrl'
import { getOnboardingCnameTarget } from '../lib/onboardingCnameTarget'
import { ProviderConnectionGrid } from '@/components/onboarding/ProviderConnectionGrid'
import { ONBOARDING_USERNAME_PATTERN } from '@/lib/onboardingConstraints'
import styles from './OnboardingSection.module.css'

const STEPS = [
  { id: 'username', label: 'Username' },
  { id: 'connections', label: 'Connections' },
  { id: 'domain', label: 'Custom domain' },
] as const

type StepId = (typeof STEPS)[number]['id']
type FlowStepId = StepId | 'done'

interface OnboardingProgressPayload {
  currentStep: FlowStepId
  completedSteps: StepId[]
  username: string | null
  connectedProviderIds: string[]
  integrationStatuses?: Record<string, string>
  customDomain: string | null
  updatedAt: string
}

type UsernameStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'taken'
  | 'invalid'
  | 'error'
type DnsStatus = 'idle' | 'checking' | 'verified' | 'not-verified' | 'error'

function queueUsernameAvailabilityCheck(
  checkFn: (username: string) => Promise<unknown>,
  username: string,
) {
  queueMicrotask(() => {
    checkFn(username).catch(() => undefined)
  })
}

function oauthIntegrationLabel(id: string): 'Discogs' | 'GitHub' | 'Flickr' {
  if (id === 'discogs') return 'Discogs'
  if (id === 'github') return 'GitHub'
  return 'Flickr'
}

function isStepId(v: string): v is StepId {
  return STEPS.some((s) => s.id === v)
}

function isFlowStepId(v: string): v is FlowStepId {
  return v === 'done' || isStepId(v)
}

export function OnboardingSection() {
  const router = useRouter()
  const { user, apiSessionReady, loading: authLoading } = useAuth()

  useEffect(() => {
    if (authLoading || !user) return
    if (mustVerifyEmailBeforeConsole(user)) {
      router.replace('/verify-email/')
    }
  }, [authLoading, user, router])
  const [currentStep, setCurrentStep] = useState<FlowStepId>('username')
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(new Set())
  const [hydrated, setHydrated] = useState(false)
  const [progressLoading, setProgressLoading] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const suppressDraftSaveRef = useRef(true)

  const [username, setUsername] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle')
  const usernameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [connectedProviders, setConnectedProviders] = useState<Set<string>>(new Set())
  const [integrationStatuses, setIntegrationStatuses] = useState<Record<string, string>>({})
  const [oauthFlash, setOauthFlash] = useState<string | null>(null)

  const [domain, setDomain] = useState('')
  const [dnsStatus, setDnsStatus] = useState<DnsStatus>('idle')
  const dnsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dnsPollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const baseUrl = getAppBaseUrl()

  const checkUsername = useCallback(async (value: string) => {
    if (!value || !ONBOARDING_USERNAME_PATTERN.test(value)) {
      setUsernameStatus(value.length > 0 ? 'invalid' : 'idle')
      return
    }

    setUsernameStatus('checking')
    try {
      const headers: Record<string, string> = {}
      if (user) {
        try {
          headers.Authorization = `Bearer ${await user.getIdToken()}`
        } catch {
          /* anonymous check — server may not recognize “same owner” without auth */
        }
      }
      const res = await fetch(
        `${baseUrl}/api/onboarding/check-username?username=${encodeURIComponent(value)}`,
        { credentials: 'include', headers }
      )
      if (!res.ok) throw new Error('Check failed')
      const data = await res.json() as { available?: boolean }
      setUsernameStatus(data.available ? 'available' : 'taken')
    } catch {
      setUsernameStatus('error')
    }
  }, [baseUrl, user])

  const buildSnapshot = useCallback(
    (overrides?: Partial<Pick<OnboardingProgressPayload, 'currentStep' | 'completedSteps'>>) => {
      const completedArr = overrides?.completedSteps ?? Array.from(completedSteps)
      const step = overrides?.currentStep ?? currentStep
      return {
        currentStep: step,
        completedSteps: completedArr,
        username: username.length > 0 ? username.toLowerCase() : null,
        connectedProviderIds: Array.from(connectedProviders),
        customDomain: domain.length > 0 ? domain : null,
      }
    },
    [completedSteps, connectedProviders, currentStep, domain, username]
  )

  const persistProgress = useCallback(
    async (snapshot: ReturnType<typeof buildSnapshot>) => {
      setSaving(true)
      setSaveError(null)
      try {
        if (!user) return false
        const idToken = await user.getIdToken()
        const res = await apiClient.putJson('/api/onboarding/progress', snapshot, { idToken })
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({} as { error?: string }))
          throw new Error(errBody.error ?? `Save failed (${res.status})`)
        }
        const saved = await res.json().catch(() => ({} as { payload?: OnboardingProgressPayload }))
        if (saved.payload?.integrationStatuses) {
          setIntegrationStatuses(saved.payload.integrationStatuses)
        }
        return true
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Could not save progress.')
        return false
      } finally {
        setSaving(false)
      }
    },
    [user]
  )

  useEffect(() => {
    if (!user) {
      setProgressLoading(false)
      setHydrated(true)
      return
    }

    if (!apiSessionReady) {
      setProgressLoading(true)
      return
    }

    let cancelled = false
    ;(async () => {
      setProgressLoading(true)
      setSaveError(null)
      try {
        const idToken = await user.getIdToken()
        const res = await apiClient.getJson('/api/onboarding/progress', { idToken })
        if (!res.ok) throw new Error('Load failed')
        const data = await res.json() as {
          ok: boolean
          payload?: OnboardingProgressPayload
        }
        const p = data.payload
        if (cancelled || !p) return
        if (!isFlowStepId(p.currentStep)) {
          setCurrentStep('username')
        } else {
          setCurrentStep(p.currentStep)
        }
        setCompletedSteps(new Set(p.completedSteps.filter(isStepId)))
        const savedUsername = p.username ?? ''
        setUsername(savedUsername)
        setConnectedProviders(new Set(p.connectedProviderIds ?? []))
        setIntegrationStatuses(p.integrationStatuses ?? {})
        setDomain(p.customDomain ?? '')
        setDnsStatus('idle')
        if (savedUsername.length >= 3) {
          queueUsernameAvailabilityCheck(checkUsername, savedUsername)
        }
      } catch {
        if (!cancelled) setSaveError('Could not load saved progress. You can still continue.')
      } finally {
        if (!cancelled) {
          setProgressLoading(false)
          setHydrated(true)
          suppressDraftSaveRef.current = true
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user, apiSessionReady, checkUsername])

  useEffect(() => {
    if (typeof window === 'undefined' || !hydrated) return
    const params = new URLSearchParams(window.location.search)
    const oauthProvider = params.get('oauth')
    if (oauthProvider !== 'flickr' && oauthProvider !== 'discogs' && oauthProvider !== 'github') return
    const status = params.get('status')
    const reason = params.get('reason')
    const label = oauthIntegrationLabel(oauthProvider)
    if (status === 'success') {
      setOauthFlash(`${label} is now linked to your account.`)
    } else if (status === 'error') {
      setOauthFlash(
        reason
          ? `Could not complete ${label} authorization (${reason.replace(/_/g, ' ')}).`
          : `Could not complete ${label} authorization.`
      )
    }
    params.delete('providers')
    params.delete('oauth')
    params.delete('status')
    params.delete('reason')
    const rest = params.toString()
    const query = rest.length > 0 ? `?${rest}` : ''
    const clean = `${window.location.pathname}${query}`
    window.history.replaceState(null, '', clean)
  }, [hydrated])

  const reloadProgressFromServer = useCallback(async () => {
    if (!user || !apiSessionReady) return
    const idToken = await user.getIdToken()
    const res = await apiClient.getJson('/api/onboarding/progress', { idToken })
    if (!res.ok) return
    const data = await res.json().catch(() => ({} as { payload?: OnboardingProgressPayload }))
    const p = data.payload
    if (!p) return
    if (!isFlowStepId(p.currentStep)) setCurrentStep('username')
    else setCurrentStep(p.currentStep)
    setCompletedSteps(new Set(p.completedSteps.filter(isStepId)))
    setUsername(p.username ?? '')
    setConnectedProviders(new Set(p.connectedProviderIds ?? []))
    setIntegrationStatuses(p.integrationStatuses ?? {})
    setDomain(p.customDomain ?? '')
  }, [user, apiSessionReady])

  const cancelOAuthPending = async (providerId: 'flickr' | 'discogs' | 'github') => {
    if (!user) return
    setSaveError(null)
    try {
      const idToken = await user.getIdToken()
      const res = await apiClient.deleteJson(`/api/oauth/${providerId}`, { idToken })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(errBody.error ?? `Cancel failed (${res.status})`)
      }
      await reloadProgressFromServer()
    } catch (e) {
      const label = oauthIntegrationLabel(providerId)
      setSaveError(e instanceof Error ? e.message : `Could not cancel ${label} link.`)
    }
  }

  const handleOAuthProviderConnect = async (providerId: string) => {
    if ((providerId !== 'flickr' && providerId !== 'discogs' && providerId !== 'github') || !user)
      return
    setSaveError(null)
    setOauthFlash(null)
    try {
      await persistProgress(buildSnapshot())
      const returnTo =
        typeof window !== 'undefined'
          ? `${window.location.pathname}${window.location.search}`
          : '/onboarding'
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
      setSaveError(e instanceof Error ? e.message : `${providerId} link failed.`)
    }
  }

  const handleUsernameChange = (value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9_-]/g, '')
    setUsername(sanitized)
    setUsernameStatus('idle')
    if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current)
    if (sanitized.length >= 3) {
      usernameTimerRef.current = setTimeout(() => {
        checkUsername(sanitized).catch(() => {})
      }, 500)
    }
  }

  const checkDns = useCallback(async (domainValue: string) => {
    if (!domainValue) return
    setDnsStatus('checking')
    try {
      const res = await fetch(
        `${baseUrl}/api/onboarding/check-domain?domain=${encodeURIComponent(domainValue)}`,
        { method: 'GET', credentials: 'include' }
      )
      if (!res.ok) throw new Error('Check failed')
      const data = await res.json() as { verified?: boolean }
      setDnsStatus(data.verified ? 'verified' : 'not-verified')
    } catch {
      setDnsStatus('error')
    }
  }, [baseUrl])

  const handleDomainChange = (value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9.-]/g, '')
    setDomain(sanitized)
    setDnsStatus('idle')
    if (dnsTimerRef.current) clearTimeout(dnsTimerRef.current)
    if (dnsPollingRef.current) clearInterval(dnsPollingRef.current)
  }

  const startDnsCheck = () => {
    if (!domain) return
    checkDns(domain).catch(() => {})
    if (dnsPollingRef.current) clearInterval(dnsPollingRef.current)
    dnsPollingRef.current = setInterval(() => {
      checkDns(domain).catch(() => {})
    }, 15000)
  }

  useEffect(() => {
    return () => {
      if (dnsPollingRef.current) clearInterval(dnsPollingRef.current)
    }
  }, [])

  const handleStepComplete = async (step: StepId) => {
    setSaveError(null)
    const nextCompleted = new Set([...completedSteps, step])
    let nextFlow: FlowStepId = 'done'
    if (step !== 'domain') {
      const idx = STEPS.findIndex((s) => s.id === step)
      const next = STEPS[idx + 1]
      if (next) nextFlow = next.id
    }
    const snapshot = buildSnapshot({
      currentStep: nextFlow,
      completedSteps: Array.from(nextCompleted) as StepId[],
    })
    const ok = await persistProgress(snapshot)
    if (!ok) return
    setCompletedSteps(nextCompleted)
    setCurrentStep(nextFlow)
  }

  const navigateToStep = async (target: StepId) => {
    if (target === currentStep) return
    setSaveError(null)
    const snapshot = buildSnapshot({ currentStep: target })
    const ok = await persistProgress(snapshot)
    if (!ok) return
    setCurrentStep(target)
  }

  useEffect(() => {
    if (!user || !hydrated) return
    if (currentStep !== 'connections' && currentStep !== 'domain') return
    // Custom domain is persisted when the user completes the step (or navigates), not on every
    // keystroke — avoids partial hostnames claiming tenant_hosts and avoids noisy PUTs.
    if (currentStep === 'domain') return
    if (suppressDraftSaveRef.current) {
      suppressDraftSaveRef.current = false
      return
    }
    const t = setTimeout(() => {
      persistProgress(buildSnapshot()).catch(() => {})
    }, 650)
    return () => clearTimeout(t)
  }, [user, hydrated, currentStep, connectedProviders, buildSnapshot, persistProgress])

  const handleConnectProvider = (providerId: string) => {
    setConnectedProviders((prev) => {
      const next = new Set(prev)
      if (next.has(providerId)) next.delete(providerId)
      else next.add(providerId)
      return next
    })
  }

  const visualStepIndex =
    currentStep === 'done' ? STEPS.length - 1 : STEPS.findIndex((s) => s.id === currentStep)
  const safeVisualIndex = visualStepIndex >= 0 ? visualStepIndex : 0
  const stepMetaLabel = STEPS[safeVisualIndex]?.label ?? ''

  if (authLoading) {
    return (
      <section className={styles.section}>
        <div className={styles.card}>
          <div className={styles.progressLoading}>
            <span className="spinner" aria-hidden />
            <p>Restoring your session…</p>
          </div>
        </div>
      </section>
    )
  }

  if (!user) {
    return (
      <section className={styles.section}>
        <div className={styles.card}>
          <h2 className={styles.heading}>Sign in required</h2>
          <p className={styles.subheading}>You need to be signed in to complete onboarding.</p>
        </div>
      </section>
    )
  }

  if (progressLoading) {
    return (
      <section className={styles.section}>
        <div className={styles.card}>
          <div className={styles.progressLoading}>
            <span className="spinner" aria-hidden />
            <p>Loading your progress…</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className={styles.section}>
      <div className={`${styles.card} ${currentStep === 'done' ? styles.cardComplete : ''}`}>
        {currentStep === 'done' ? (
          <div className={styles.donePanel}>
            <span className={styles.doneEmoji} aria-hidden>
              🎉
            </span>
            <h2 className={styles.heading}>You&rsquo;re all set!</h2>
            <p className={styles.subheading}>
              Your Chronogrove account is ready. Head to the dashboard to start exploring your
              data.
            </p>
            <a href="/" className={styles.btnPrimary}>
              Go to dashboard
            </a>
          </div>
        ) : (
          <>
            <div className={styles.stepPosition} aria-live="polite">
              <span className={styles.stepPositionText}>
                <strong>Step {safeVisualIndex + 1}</strong> of {STEPS.length}
                <span className={styles.stepPositionSep}>·</span>
                {stepMetaLabel}
              </span>
              {saving && <span className={styles.savingBadge}>Saving…</span>}
            </div>

            <progress
              className={styles.progressBarTrack}
              max={STEPS.length}
              value={safeVisualIndex + 1}
              aria-label="Onboarding steps completed"
            />

            <div className={styles.stepIndicator}>
              {STEPS.map((step, i) => (
                <div key={step.id} className={styles.stepRow}>
                  <button
                    type="button"
                    className={`${styles.stepDot} ${
                      currentStep === step.id ? styles.stepDotActive : ''
                    } ${completedSteps.has(step.id) ? styles.stepDotDone : ''}`}
                    onClick={() => {
                      navigateToStep(step.id).catch(() => {})
                    }}
                    aria-current={currentStep === step.id ? 'step' : undefined}
                  >
                    {completedSteps.has(step.id) ? <CheckIcon /> : <span>{i + 1}</span>}
                  </button>
                  <span
                    className={`${styles.stepLabel} ${
                      currentStep === step.id ? styles.stepLabelActive : ''
                    }`}
                  >
                    {step.label}
                  </span>
                  {i < STEPS.length - 1 && <div className={styles.stepConnector} />}
                </div>
              ))}
            </div>

            {saveError && (
              <div className={styles.saveError} role="alert">
                {saveError}
              </div>
            )}

            {oauthFlash && (
              <output className={styles.oauthFlash} aria-live="polite">
                {oauthFlash}
              </output>
            )}

            {currentStep === 'username' && (
              <div className={styles.stepContent}>
            <h2 className={styles.heading}>Choose your username</h2>
            <p className={styles.subheading}>
              This will be your unique profile URL. You can change it later in Settings.
            </p>

            <div className={styles.usernameField}>
              <div className={styles.usernameInputWrap}>
                <span className={styles.usernamePrefix}>api.chronogrove.com/u/</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  className={styles.usernameInput}
                  placeholder="your-username"
                  maxLength={30}
                  autoFocus
                />
                <span className={styles.usernameIndicator}>
                  {usernameStatus === 'checking' && <span className="spinner" aria-label="Checking…" />}
                  {usernameStatus === 'available' && <span className={styles.statusOk}>✓</span>}
                  {usernameStatus === 'taken' && <span className={styles.statusBad}>✕</span>}
                  {usernameStatus === 'invalid' && <span className={styles.statusBad}>✕</span>}
                  {usernameStatus === 'error' && <span className={styles.statusWarn}>!</span>}
                </span>
              </div>
              <div className={styles.usernameHint}>
                {usernameStatus === 'idle' && username.length < 3 && (
                  <span>3–30 characters. Letters, numbers, hyphens, and underscores.</span>
                )}
                {usernameStatus === 'checking' && <span>Checking availability…</span>}
                {usernameStatus === 'available' && (
                  <span className={styles.hintOk}>
                    <strong>{username}</strong> is available
                  </span>
                )}
                {usernameStatus === 'taken' && (
                  <span className={styles.hintBad}>
                    <strong>{username}</strong> is already taken
                  </span>
                )}
                {usernameStatus === 'invalid' && (
                  <span className={styles.hintBad}>
                    Must start and end with a letter or number.
                  </span>
                )}
                {usernameStatus === 'error' && (
                  <span className={styles.hintWarn}>
                    Could not check availability. Check your connection and try again.
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              className={styles.btnPrimary}
              disabled={usernameStatus !== 'available' || saving}
              onClick={() => {
                handleStepComplete('username').catch(() => {})
              }}
            >
              Continue
            </button>
            </div>
            )}

            {currentStep === 'connections' && (
          <div className={styles.stepContent}>
            <h2 className={styles.heading}>Connect your accounts</h2>
            <p className={styles.subheading}>
              Link the services you want to sync data from. You can always add more later from
              the dashboard.
            </p>

            <ProviderConnectionGrid
              connectedIds={connectedProviders}
              integrationStatuses={integrationStatuses}
              onToggle={handleConnectProvider}
              onOAuthProviderConnect={handleOAuthProviderConnect}
            />

            {integrationStatuses.flickr === 'pending_oauth' && (
              <p className={styles.oauthCancelRow}>
                <button
                  type="button"
                  className={styles.oauthCancelBtn}
                  onClick={() => {
                    cancelOAuthPending('flickr').catch(() => {})
                  }}
                >
                  Cancel Flickr link
                </button>
              </p>
            )}
            {integrationStatuses.discogs === 'pending_oauth' && (
              <p className={styles.oauthCancelRow}>
                <button
                  type="button"
                  className={styles.oauthCancelBtn}
                  onClick={() => {
                    cancelOAuthPending('discogs').catch(() => {})
                  }}
                >
                  Cancel Discogs link
                </button>
              </p>
            )}
            {integrationStatuses.github === 'pending_oauth' && (
              <p className={styles.oauthCancelRow}>
                <button
                  type="button"
                  className={styles.oauthCancelBtn}
                  onClick={() => {
                    cancelOAuthPending('github').catch(() => {})
                  }}
                >
                  Cancel GitHub link
                </button>
              </p>
            )}

            <div className={styles.stepActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                disabled={saving}
                onClick={() => {
                  handleStepComplete('connections').catch(() => {})
                }}
              >
                Skip for now
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={saving}
                onClick={() => {
                  handleStepComplete('connections').catch(() => {})
                }}
              >
                Continue
                {connectedProviders.size > 0 && (
                  <span className={styles.btnCount}>{connectedProviders.size}</span>
                )}
              </button>
            </div>
            </div>
            )}

            {currentStep === 'domain' && (
              <div className={styles.stepContent}>
            <h2 className={styles.heading}>Custom domain</h2>
            <p className={styles.subheading}>
              Point your own domain to Chronogrove for a branded API endpoint. This step is
              entirely optional — you can set this up anytime.
            </p>

            <label className={styles.label}>
              <span>Domain name</span>
              <input
                type="text"
                value={domain}
                onChange={(e) => handleDomainChange(e.target.value)}
                className={styles.domainInput}
                placeholder="api.yourdomain.com"
              />
            </label>

            {domain && (
              <div className={styles.dnsInstructions}>
                <p className={styles.dnsTitle}>
                  Add a CNAME record pointing your hostname to the Chronogrove target:
                </p>
                <div className={styles.dnsRecords}>
                  <div className={styles.dnsRecord}>
                    <span className={styles.dnsType}>CNAME</span>
                    <span className={styles.dnsHost}>{domain}</span>
                    <span className={styles.dnsArrow}>→</span>
                    <code className={styles.dnsValue}>{getOnboardingCnameTarget()}</code>
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.btnVerify}
                  onClick={startDnsCheck}
                  disabled={dnsStatus === 'checking'}
                >
                  {dnsStatus === 'checking' ? (
                    <>
                      <span className="spinner" aria-hidden />
                      {' '}
                      <span>Verifying…</span>
                    </>
                  ) : (
                    'Verify DNS'
                  )}
                </button>

                {dnsStatus === 'verified' && (
                  <div className={styles.dnsResult}>
                    <span className={styles.statusOk}>✓</span>
                    <div>
                      <strong>DNS verified!</strong>
                      <p className={styles.dnsResultSub}>
                        Your CNAME points to {getOnboardingCnameTarget()}.
                      </p>
                    </div>
                  </div>
                )}

                {dnsStatus === 'not-verified' && (
                  <div className={styles.dnsResult}>
                    <span className={styles.statusPending}>⏳</span>
                    <div>
                      <strong>Not verified yet</strong>
                      <p className={styles.dnsResultSub}>
                        DNS changes can take up to 48 hours to propagate.
                        We&rsquo;ll keep checking every 15 seconds.
                      </p>
                    </div>
                  </div>
                )}

                {dnsStatus === 'error' && (
                  <div className={styles.dnsResult}>
                    <span className={styles.statusBad}>✕</span>
                    <div>
                      <strong>Verification failed</strong>
                      <p className={styles.dnsResultSub}>
                        Could not look up DNS records. Check the domain name and try again.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className={styles.stepActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                disabled={saving}
                onClick={() => {
                  handleStepComplete('domain').catch(() => {})
                }}
              >
                Skip for now
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={saving}
                onClick={() => {
                  handleStepComplete('domain').catch(() => {})
                }}
              >
                Finish setup
              </button>
            </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
