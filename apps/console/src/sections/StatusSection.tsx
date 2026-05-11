'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { getAppBaseUrl } from '../lib/baseUrl'
import {
  WIDGET_STATUS_PROVIDERS,
  extractLastSyncedFromWidgetResponse,
  formatSyncedDisplay,
} from '../lib/widget-status'
import styles from './StatusSection.module.css'

const WIDGET_ROUTES = WIDGET_STATUS_PROVIDERS

const CLIENT_AUTH_ROUTE = {
  id: 'client-auth-config',
  label: 'Client auth config',
  path: '/api/client-auth-config' as const,
} as const

type StatusRoute = (typeof WIDGET_ROUTES)[number] | typeof CLIENT_AUTH_ROUTE

export interface RowState {
  loading: boolean
  httpStatus: number | null
  ok: boolean | null
  ms: number | null
  lastSynced: string | null
  error: string | null
}

function pathForRow(row: StatusRoute): string {
  return 'path' in row ? row.path : `/api/widgets/${row.id}`
}

const initialRow = (): RowState => ({
  loading: true,
  httpStatus: null,
  ok: null,
  ms: null,
  lastSynced: null,
  error: null,
})

function statusLabelForRow(s: RowState): string {
  if (s.loading) {
    return '…'
  }
  if (s.error) {
    return 'Error'
  }
  if (s.httpStatus != null) {
    return String(s.httpStatus)
  }
  return '—'
}

function okClassForRow(s: RowState): string {
  if (s.loading) {
    return styles.pending ?? ''
  }
  if (s.ok) {
    return styles.cellOk ?? ''
  }
  if (s.error || s.ok === false) {
    return styles.cellBad ?? ''
  }
  return ''
}

function latencyLabelForRow(s: RowState): string {
  if (s.loading) {
    return '…'
  }
  if (s.ms != null) {
    return `${s.ms}ms`
  }
  return '—'
}

export function StatusSection() {
  const { user } = useAuth()
  const baseUrl = getAppBaseUrl()
  const activeRoutes = useMemo<readonly StatusRoute[]>(
    () => (user ? [...WIDGET_ROUTES, CLIENT_AUTH_ROUTE] : [...WIDGET_ROUTES]),
    [user]
  )
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [checking, setChecking] = useState(false)

  const runChecks = useCallback(async () => {
    setChecking(true)
    setRows(
      Object.fromEntries(activeRoutes.map((r) => [r.id, { ...initialRow(), loading: true }])) as Record<
        string,
        RowState
      >
    )

    await Promise.all(
      activeRoutes.map(async (r) => {
        const path = pathForRow(r)
        const start = performance.now()
        try {
          const res = await fetch(`${baseUrl}${path}`, {
            method: 'GET',
            credentials: 'omit',
            cache: 'no-store',
          })
          const ms = Math.round(performance.now() - start)
          let lastSynced: string | null = null
          if (res.ok) {
            const data = await res.json().catch(() => null)
            lastSynced =
              r.id === 'client-auth-config' ? null : extractLastSyncedFromWidgetResponse(data)
          }
          setRows((prev) => ({
            ...prev,
            [r.id]: {
              loading: false,
              httpStatus: res.status,
              ok: res.ok,
              ms,
              lastSynced,
              error: null,
            },
          }))
        } catch (err) {
          const ms = Math.round(performance.now() - start)
          setRows((prev) => ({
            ...prev,
            [r.id]: {
              loading: false,
              httpStatus: null,
              ok: false,
              ms,
              lastSynced: null,
              error: err instanceof Error ? err.message : String(err),
            },
          }))
        }
      })
    )
    setChecking(false)
  }, [baseUrl, activeRoutes])

  useEffect(() => {
    runChecks().catch(() => undefined)
  }, [runChecks])

  return (
    <>
      <div className={styles.hero}>
        <h1 className={styles.title}>Status</h1>
        <p className={styles.lead}>
          Lightweight <code className={styles.inlineCode}>GET</code> checks for the public data routes exposed by this
          console. When a payload includes <code className={styles.inlineCode}>meta.synced</code>, the table shows it
          so you can tell the difference between a healthy route and recently refreshed content. GitHub is fetched live
          and does not carry a stored sync timestamp.
          {user ? (
            <>
              {' '}
              Signed-in view also checks <code className={styles.inlineCode}>/api/client-auth-config</code>.
            </>
          ) : (
            <>
              {' '}
              <span className={styles.leadMuted}>
                Sign in to include the client auth config route in this table.
              </span>
            </>
          )}
        </p>
        <button
          type="button"
          className={styles.refresh}
          onClick={() => {
            runChecks().catch(() => undefined)
          }}
          disabled={checking}
        >
          {checking ? 'Checking…' : 'Refresh'}
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Route</th>
              <th>Status</th>
              <th>Latency</th>
              <th>Last synced (payload)</th>
            </tr>
          </thead>
          <tbody>
            {activeRoutes.map((r) => {
              const s = rows[r.id] ?? initialRow()
              const statusLabel = statusLabelForRow(s)
              const okClass = okClassForRow(s)
              return (
                <tr key={r.id}>
                  <td>
                    <div className={styles.routeLabel}>{r.label}</div>
                    <code className={styles.path}>{pathForRow(r)}</code>
                  </td>
                  <td className={okClass}>
                    {!s.loading && s.error ? (
                      <span className={styles.errText} title={s.error}>
                        —
                      </span>
                    ) : (
                      statusLabel
                    )}
                  </td>
                  <td>{latencyLabelForRow(s)}</td>
                  <td className={styles.syncedCell}>
                    {s.loading ? '…' : formatSyncedDisplay(s.lastSynced)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
