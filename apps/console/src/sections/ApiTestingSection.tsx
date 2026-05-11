'use client'

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { SectionId } from '../layout/Layout'
import { useAuth } from '../auth/AuthContext'
import { ApiClient } from '../auth/apiClient'
import { getAppBaseUrl, getManualSyncStreamUrl } from '../lib/baseUrl'
import { readDiscogsAuthModeFromSyncPayload } from '../lib/readDiscogsAuthModeFromSyncPayload'
import { readFlickrAuthModeFromSyncPayload } from '../lib/readFlickrAuthModeFromSyncPayload'
import { buildWidgetFetchHeaders } from '../lib/buildWidgetFetchHeaders'
import { readGitHubAuthModeFromWidgetResponse } from '../lib/readGitHubAuthModeFromWidgetResponse'
import styles from './ApiTestingSection.module.css'

const WIDGET_PROVIDERS = ['discogs', 'flickr', 'github', 'goodreads', 'instagram', 'spotify', 'steam'] as const
const SYNC_PROVIDERS = ['spotify', 'steam', 'goodreads', 'instagram', 'discogs', 'flickr'] as const

export interface ApiTestingSectionProps {
  activeSection: SectionId
}

interface FetchResult {
  ok: boolean
  status?: number
  time: number
  data?: unknown
  error?: string
}

interface LoadingState {
  widgets: boolean
  session: boolean
  sync: boolean
}

function handleSyncSseDataLine(
  raw: string,
  startMs: number,
  setSyncThinkingLine: (message: string | null) => void,
  setSyncResult: Dispatch<SetStateAction<FetchResult | null>>
): void {
  const line = raw.replace(/\r$/, '')
  if (!line.startsWith('data: ')) return
  let payload: {
    type?: string
    message?: string
    result?: unknown
  }
  try {
    payload = JSON.parse(line.slice(6)) as typeof payload
  } catch {
    return
  }
  if (payload.type === 'progress' && typeof payload.message === 'string') {
    setSyncThinkingLine(payload.message)
  }
  if (payload.type === 'done') {
    setSyncResult({
      ok: true,
      status: 200,
      time: Date.now() - startMs,
      data: payload.result,
    })
  }
  if (payload.type === 'error') {
    setSyncResult({
      ok: false,
      time: Date.now() - startMs,
      error: typeof payload.message === 'string' ? payload.message : 'Sync stream error',
    })
  }
}

async function consumeManualSyncStreamBody(
  body: ReadableStream<Uint8Array>,
  startMs: number,
  setSyncThinkingLine: (message: string | null) => void,
  setSyncResult: Dispatch<SetStateAction<FetchResult | null>>
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      handleSyncSseDataLine(part, startMs, setSyncThinkingLine, setSyncResult)
    }
  }
  if (buffer.trim()) {
    handleSyncSseDataLine(buffer, startMs, setSyncThinkingLine, setSyncResult)
  }
}

async function runManualSyncStreamRequest(
  syncProvider: string,
  idToken: string,
  startMs: number,
  setSyncThinkingLine: (message: string | null) => void,
  setSyncResult: Dispatch<SetStateAction<FetchResult | null>>
): Promise<void> {
  const res = await fetch(getManualSyncStreamUrl(syncProvider), {
    headers: { Authorization: `Bearer ${idToken}` },
    credentials: 'include',
    cache: 'no-store',
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    setSyncResult({
      ok: false,
      status: res.status,
      time: Date.now() - startMs,
      error: errText || `HTTP ${res.status}`,
    })
    setSyncThinkingLine(null)
    return
  }

  if (!res.body) {
    setSyncResult({
      ok: false,
      time: Date.now() - startMs,
      error: 'No response body (streaming not supported?)',
    })
    setSyncThinkingLine(null)
    return
  }

  await consumeManualSyncStreamBody(res.body, startMs, setSyncThinkingLine, setSyncResult)
}

interface ResultBoxProps {
  result: FetchResult
}

function ResultBox({ result }: Readonly<ResultBoxProps>) {
  const isOk = result.ok
  const status = result.status != null ? `${result.status}` : ''
  const time = result.time != null ? `${result.time}ms` : ''
  const body = result.data ?? result.error

  return (
    <div className={`${styles.result} ${isOk ? styles.resultOk : styles.resultError}`}>
      <div className={styles.resultHeader}>
        <span className={styles.resultStatus}>
          {isOk ? '✓' : '✗'} {status} {time}
        </span>
      </div>
      <pre className={styles.resultBody}>
        {typeof body === 'string' ? body : JSON.stringify(body, null, 2)}
      </pre>
    </div>
  )
}

interface TryApiPanelProps {
  idToken: string | null
  tokenLoading: boolean
  widgetProvider: string
  setWidgetProvider: (v: string) => void
  widgetResult: FetchResult | null
  sessionResult: FetchResult | null
  loading: LoadingState
  widgetGitHubAuthMode: string | undefined
  onFetchToken: () => void
  onTestSession: () => void
  onTestWidgets: () => void
}

function TryApiPanel({
  idToken,
  tokenLoading,
  widgetProvider,
  setWidgetProvider,
  widgetResult,
  sessionResult,
  loading,
  widgetGitHubAuthMode,
  onFetchToken,
  onTestSession,
  onTestWidgets,
}: Readonly<TryApiPanelProps>) {
  return (
    <>
      <div className={styles.block}>
        <h2 className={styles.sectionTitle}>Try API</h2>
        <p className={styles.sectionSubtitle}>
          Test the authenticated and public route surface from one place. Widget feeds are public; session and sync flows
          require sign-in.
        </p>
      </div>
      <div className={styles.block}>
        <h3 className={styles.blockTitle}>Auth token</h3>
        <p className={styles.blockText}>Refresh the current Firebase ID token before calling protected routes.</p>
        <div className={styles.row}>
          <button type="button" className={styles.btnPrimary} onClick={onFetchToken} disabled={tokenLoading}>
            {tokenLoading ? 'Getting token…' : 'Get fresh ID token'}
          </button>
          {idToken && (
            <span className={styles.tokenPreview}>
              Token: <code>{idToken.slice(0, 40)}…</code>
            </span>
          )}
        </div>
      </div>
      <div className={styles.block}>
        <h3 className={styles.blockTitle}>Session</h3>
        <div className={styles.endpoint}>
          <span className={styles.methodPost}>POST</span>
          <code className={styles.path}>/api/auth/session</code>
          <div className={styles.controls}>
            <button type="button" className={styles.btnSecondary} onClick={onTestSession} disabled={!idToken || loading.session}>
              {loading.session ? 'Testing…' : 'Test'}
            </button>
          </div>
          {sessionResult && <ResultBox result={sessionResult} />}
        </div>
      </div>
      <div className={styles.block}>
        <h3 className={styles.blockTitle}>Get widget data</h3>
        <p className={styles.sectionSubtitle}>
          When you are signed in, each test sends your current Firebase ID token so GitHub can use your linked account
          (OAuth) instead of the server PAT. On production the console origin is usually cross-site to the API, so session
          cookies are not relied on here; the token is attached automatically.
        </p>
        <div className={styles.endpoint}>
          <span className={styles.methodGet}>GET</span>
          <code className={styles.path}>/api/widgets/&#123;provider&#125;</code>
          <div className={styles.controls}>
            <select value={widgetProvider} onChange={(e) => setWidgetProvider(e.target.value)} className={styles.select}>
              {WIDGET_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <button type="button" className={styles.btnSecondary} onClick={onTestWidgets} disabled={loading.widgets}>
              {loading.widgets ? 'Testing…' : 'Test'}
            </button>
          </div>
          {widgetGitHubAuthMode ? (
            <output
              className={`${styles.flickrAuthBadge} ${
                widgetGitHubAuthMode === 'oauth' ? styles.flickrAuthBadgeOAuth : styles.flickrAuthBadgeLegacy
              }`}
            >
              {widgetGitHubAuthMode === 'oauth'
                ? 'GitHub credentials: OAuth (connected account)'
                : 'GitHub credentials: PAT (server env / legacy)'}
            </output>
          ) : null}
          {widgetResult && <ResultBox result={widgetResult} />}
        </div>
      </div>
    </>
  )
}

interface SyncPanelProps {
  syncProvider: string
  setSyncProvider: (v: string) => void
  idToken: string | null
  loading: LoadingState
  syncThinkingLine: string | null
  syncFlickrAuthMode: string | undefined
  syncDiscogsAuthMode: string | undefined
  syncResult: FetchResult | null
  onTestSync: () => void
}

function SyncPanel({
  syncProvider,
  setSyncProvider,
  idToken,
  loading,
  syncThinkingLine,
  syncFlickrAuthMode,
  syncDiscogsAuthMode,
  syncResult,
  onTestSync,
}: Readonly<SyncPanelProps>) {
  return (
    <>
      <div className={styles.block}>
        <h2 className={styles.sectionTitle}>Sync</h2>
        <p className={styles.sectionSubtitle}>
          Trigger a provider sync from the console. Your ID token loads automatically after sign-in, and the API page can
          refresh it or create a session cookie when needed.
        </p>
      </div>
      <div className={styles.block}>
        <h3 className={styles.blockTitle}>Sync provider</h3>
        <p className={styles.blockText}>
          Run the queue-backed sync via{' '}
          <code className={styles.inlineCode}>GET /api/widgets/sync/&#123;provider&#125;/stream</code> so you can watch live
          steps and inspect the same final payload returned by the JSON endpoint.
          {syncProvider === 'flickr' || syncProvider === 'discogs'
            ? ' Flickr and Discogs manual sync load OAuth from your signed-in user when that provider is linked; otherwise the job uses server env credentials. Widget data still updates the default site owner path.'
            : ''}
        </p>
        <div className={styles.endpoint}>
          <span className={styles.methodGet}>GET</span>
          <code className={styles.path}>/api/widgets/sync/&#123;provider&#125;/stream</code>
          <div className={styles.controls}>
            <select value={syncProvider} onChange={(e) => setSyncProvider(e.target.value)} className={styles.select}>
              {SYNC_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <button type="button" className={styles.btnSecondary} onClick={onTestSync} disabled={!idToken || loading.sync}>
              {loading.sync ? 'Testing…' : 'Test'}
            </button>
          </div>
          {loading.sync && syncThinkingLine !== null ? (
            <output className={styles.thinkingShell} aria-live="polite">
              <div className={styles.thinkingHeader}>
                <span className={styles.thinkingPulse} aria-hidden />
                <span className={styles.thinkingTitle}>Sync progress</span>
                <span className={styles.thinkingDots} aria-hidden>
                  <span />
                  <span />
                  <span />
                </span>
              </div>
              <p key={syncThinkingLine} className={styles.thinkingLine}>
                {syncThinkingLine}
              </p>
            </output>
          ) : null}
          {syncFlickrAuthMode ? (
            <output
              className={`${styles.flickrAuthBadge} ${
                syncFlickrAuthMode === 'oauth' ? styles.flickrAuthBadgeOAuth : styles.flickrAuthBadgeLegacy
              }`}
            >
              {syncFlickrAuthMode === 'oauth'
                ? 'Flickr credentials: OAuth (connected account)'
                : 'Flickr credentials: legacy (server API key)'}
            </output>
          ) : null}
          {syncDiscogsAuthMode ? (
            <output
              className={`${styles.flickrAuthBadge} ${
                syncDiscogsAuthMode === 'oauth' ? styles.flickrAuthBadgeOAuth : styles.flickrAuthBadgeLegacy
              }`}
            >
              {syncDiscogsAuthMode === 'oauth'
                ? 'Discogs credentials: OAuth (connected account)'
                : 'Discogs credentials: legacy (personal token + username in env)'}
            </output>
          ) : null}
          {syncResult && <ResultBox result={syncResult} />}
        </div>
      </div>
    </>
  )
}

export function ApiTestingSection({ activeSection }: Readonly<ApiTestingSectionProps>) {
  const { user } = useAuth()
  const [idToken, setIdToken] = useState<string | null>(null)
  const [tokenLoading, setTokenLoading] = useState(false)
  const [widgetProvider, setWidgetProvider] = useState<string>(WIDGET_PROVIDERS[0])
  const [syncProvider, setSyncProvider] = useState<string>(SYNC_PROVIDERS[0])
  const [widgetResult, setWidgetResult] = useState<FetchResult | null>(null)
  const [sessionResult, setSessionResult] = useState<FetchResult | null>(null)
  const [syncResult, setSyncResult] = useState<FetchResult | null>(null)
  const [syncThinkingLine, setSyncThinkingLine] = useState<string | null>(null)
  const [loading, setLoading] = useState<LoadingState>({
    widgets: false,
    session: false,
    sync: false,
  })
  const baseUrl = getAppBaseUrl()
  const apiClient = new ApiClient(baseUrl)

  useEffect(() => {
    if (!user) {
      setIdToken(null)
      return
    }
    let cancelled = false
    user
      .getIdToken()
      .then((token) => {
        if (!cancelled) setIdToken(token)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [user])

  const showApi = activeSection === 'api'
  const showSync = activeSection === 'sync'
  const syncFlickrAuthMode =
    showSync && syncProvider === 'flickr' && syncResult?.ok
      ? readFlickrAuthModeFromSyncPayload(syncResult.data)
      : undefined
  const syncDiscogsAuthMode =
    showSync && syncProvider === 'discogs' && syncResult?.ok
      ? readDiscogsAuthModeFromSyncPayload(syncResult.data)
      : undefined
  const widgetGitHubAuthMode =
    showApi && widgetProvider === 'github' && widgetResult?.ok
      ? readGitHubAuthModeFromWidgetResponse(widgetResult.data)
      : undefined

  const fetchToken = async () => {
    if (!user) return
    setTokenLoading(true)
    try {
      const token = await user.getIdToken(true)
      setIdToken(token)
    } finally {
      setTokenLoading(false)
    }
  }

  const testWidgets = async () => {
    setLoading((l) => ({ ...l, widgets: true }))
    setWidgetResult(null)
    const start = Date.now()
    try {
      const headers: HeadersInit = await buildWidgetFetchHeaders(user)
      const res = await fetch(`${baseUrl}/api/widgets/${widgetProvider}`, {
        credentials: 'include',
        cache: 'no-store',
        headers,
      })
      const data = await res.json().catch(() => ({}))
      setWidgetResult({
        ok: res.ok,
        status: res.status,
        time: Date.now() - start,
        data,
      })
    } catch (err) {
      setWidgetResult({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        time: Date.now() - start,
      })
    } finally {
      setLoading((l) => ({ ...l, widgets: false }))
    }
  }

  const testSession = async () => {
    if (!idToken) return
    setLoading((l) => ({ ...l, session: true }))
    setSessionResult(null)
    const start = Date.now()
    try {
      setSessionResult({
        ok: true,
        status: 200,
        time: Date.now() - start,
        data: await apiClient.createSession(idToken),
      })
    } catch (err) {
      setSessionResult({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        time: Date.now() - start,
      })
    } finally {
      setLoading((l) => ({ ...l, session: false }))
    }
  }

  const testSync = async () => {
    if (!idToken) return
    setLoading((l) => ({ ...l, sync: true }))
    setSyncResult(null)
    setSyncThinkingLine('Starting sync…')
    const start = Date.now()

    try {
      await runManualSyncStreamRequest(syncProvider, idToken, start, setSyncThinkingLine, setSyncResult)
    } catch (err) {
      setSyncResult({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        time: Date.now() - start,
      })
    } finally {
      setSyncThinkingLine(null)
      setLoading((l) => ({ ...l, sync: false }))
    }
  }

  return (
    <>
      {showApi && (
        <TryApiPanel
          idToken={idToken}
          tokenLoading={tokenLoading}
          widgetProvider={widgetProvider}
          setWidgetProvider={setWidgetProvider}
          widgetResult={widgetResult}
          sessionResult={sessionResult}
          loading={loading}
          widgetGitHubAuthMode={widgetGitHubAuthMode}
          onFetchToken={fetchToken}
          onTestSession={testSession}
          onTestWidgets={testWidgets}
        />
      )}
      {showSync && (
        <SyncPanel
          syncProvider={syncProvider}
          setSyncProvider={setSyncProvider}
          idToken={idToken}
          loading={loading}
          syncThinkingLine={syncThinkingLine}
          syncFlickrAuthMode={syncFlickrAuthMode}
          syncDiscogsAuthMode={syncDiscogsAuthMode}
          syncResult={syncResult}
          onTestSync={testSync}
        />
      )}
    </>
  )
}
