import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { getServerWidgetFetchOrigin } from '@/lib/server-widget-fetch-origin'
import { primaryHostLineFromHeaders } from '@/lib/request-host-headers'
import { tenantStatusSlugForHost } from '@/lib/tenant-api-root-map'
import {
  WIDGET_STATUS_PROVIDERS,
  fetchWidgetStatusRow,
  formatSyncedDisplay,
} from '@/lib/widget-status'
import styles from './PublicTenantStatus.module.css'

type PageProps = Readonly<{
  params: Promise<{ username: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}>

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params
  return {
    title: `@${username} · status`,
    description: `Public widget API status for ${username} on Chronogrove.`,
    robots: { index: true, follow: true },
  }
}

export default async function PublicTenantStatusPage({ params, searchParams }: PageProps) {
  const { username } = await params
  const sp = searchParams != null ? await searchParams : {}
  const debugRaw = sp.status_debug
  const statusDebug =
    debugRaw === '1' ||
    debugRaw === 'true' ||
    (Array.isArray(debugRaw) && debugRaw.some((v) => v === '1' || v === 'true'))

  const origin = await getServerWidgetFetchOrigin()
  const h = await headers()
  const tenantPublicHost = primaryHostLineFromHeaders(h)
  const slugForHost = tenantStatusSlugForHost(tenantPublicHost)
  /** Match `/widgets/:provider` (hostname user id), not `?username=` (claim slug → uid), when this host is single-tenant for this slug. */
  const resolveUserLikePublicWidgets = Boolean(slugForHost && slugForHost === username)

  const rows = await Promise.all(
    WIDGET_STATUS_PROVIDERS.map((p) =>
      fetchWidgetStatusRow(origin, username, p.id, p.label, {
        tenantPublicHost,
        resolveUserLikePublicWidgets,
        debug: statusDebug,
      }),
    ),
  )

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>@{username}</h1>
        <p className={styles.subtitle}>
          Public widget routes for this profile. Latency and{' '}
          <code className={styles.inlineCode}>meta.synced</code> come from each{' '}
          <code className={styles.inlineCode}>GET /api/widgets/:provider</code> response.
          {resolveUserLikePublicWidgets ? (
            <>
              {' '}
              On this host, checks use the same user resolution as{' '}
              <code className={styles.inlineCode}>/widgets/:provider</code> (hostname map), not{' '}
              <code className={styles.inlineCode}>?username=</code>.
            </>
          ) : null}
        </p>
        {statusDebug ? (
          <p className={styles.debugBanner} data-testid="status-debug-banner">
            Debug mode (<code className={styles.inlineCode}>status_debug=1</code>): failed responses show
            server error snippets below.
          </p>
        ) : null}
      </header>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Route</th>
              <th>Status</th>
              <th>Latency</th>
              <th>Last synced</th>
              {statusDebug ? <th>Debug</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const statusLabel = r.error ? 'Error' : String(r.httpStatus || '—')
              const okClass = r.ok ? styles.cellOk : styles.cellBad
              return (
                <tr key={r.path}>
                  <td>
                    <div>{r.label}</div>
                    <code className={styles.path}>{r.path}</code>
                  </td>
                  <td className={okClass}>
                    {r.error ? (
                      <span title={r.error}>—</span>
                    ) : (
                      statusLabel
                    )}
                  </td>
                  <td>{r.ms > 0 ? `${r.ms}ms` : '—'}</td>
                  <td className={styles.syncedCell}>{formatSyncedDisplay(r.lastSynced)}</td>
                  {statusDebug ? (
                    <td className={styles.debugCell}>
                      <pre className={styles.debugPre}>{r.debugDetail ?? '—'}</pre>
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <footer className={styles.footer}>
        Powered by{' '}
        <Link href="https://chronogrove.com" rel="noopener noreferrer">
          Chronogrove
        </Link>
      </footer>
    </div>
  )
}
