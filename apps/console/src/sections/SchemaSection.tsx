'use client'

import { useState } from 'react'

import { useAuth } from '../auth/AuthContext'
import {
  authLogoutExample,
  authSessionExample,
  clientAuthConfigExample,
  csrfTokenExample,
  manualSyncResponseExample,
  manualSyncStreamSseExample,
  widgetResponseExamples,
} from './schemaExamples'
import { JsonCodeBlock } from '@/components/JsonCodeBlock'
import styles from './SchemaSection.module.css'

const WIDGETS = ['discogs', 'flickr', 'github', 'goodreads', 'instagram', 'spotify', 'steam'] as const
const SYNC = ['spotify', 'steam', 'goodreads', 'instagram', 'discogs', 'flickr'] as const

const userProfileExample = {
  ok: true,
  payload: {
    uid: 'firebaseUidExample00',
    email: 'user@chrisvogt.me',
    displayName: 'Example User',
    photoURL: null,
    emailVerified: true,
    creationTime: '2024-01-01T00:00:00.000Z',
    lastSignInTime: '2025-03-27T10:00:00.000Z',
  },
}

const accountDeleteExample = {
  ok: true,
  payload: { message: 'Account deleted' },
}

function SchemaResponseCell({
  example,
  errorHint,
}: Readonly<{
  example: unknown
  errorHint?: string
}>) {
  const [showHighlighted, setShowHighlighted] = useState(false)
  const compact = JSON.stringify(example)
  const preview = compact.length > 96 ? `${compact.slice(0, 93)}…` : compact
  const pretty = JSON.stringify(example, null, 2)
  return (
    <div className={styles.responseCell}>
      <code className={styles.responsePreview}>{preview}</code>
      <details
        className={styles.responseDetails}
        onToggle={(e) => {
          if (e.currentTarget.open) setShowHighlighted(true)
        }}
      >
        <summary className={styles.responseSummary}>Full example JSON</summary>
        {showHighlighted ? <JsonCodeBlock code={pretty} /> : null}
        {errorHint ? <p className={styles.responseHint}>{errorHint}</p> : null}
      </details>
    </div>
  )
}

export function SchemaSection() {
  const { user } = useAuth()

  return (
    <>
      <div className={styles.hero}>
        <h1 className={styles.title}>API schema</h1>
        <p className={styles.lead}>
          {user ? (
            <>
              Explore the full Chronogrove surface here: public JSON feeds, authenticated sync controls, session
              helpers, and account routes. Every endpoint below is rooted at{' '}
              <code className={styles.inlineCode}>/api</code>.
            </>
          ) : (
            <>
              Explore the public JSON routes that power the metrics experience and can be reused by other frontends. All
              paths are rooted at{' '}
              <code className={styles.inlineCode}>/api</code>.{' '}
              <span className={styles.leadMuted}>Sign in to reveal sync, auth, and account routes.</span>
            </>
          )}
        </p>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Public feeds</h2>
        <p className={styles.sectionText}>
          Cached JSON responses intended for websites, embeds, and any client that wants a clean read-only data shape.
          Successful responses are wrapped as{' '}
          <code className={styles.inlineCode}>{`{ ok: true, payload }`}</code> on success.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Method</th>
                <th>Path</th>
                <th>Example response</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {WIDGETS.map((id) => (
                <tr key={id}>
                  <td>
                    <span className={styles.methodGet}>GET</span>
                  </td>
                  <td>
                    <code className={styles.path}>/api/widgets/{id}</code>
                  </td>
                  <td>
                    <SchemaResponseCell
                      example={widgetResponseExamples[id]}
                      errorHint="404 and 500 return { &quot;ok&quot;: false, &quot;error&quot;: string }."
                    />
                  </td>
                  <td className={styles.notes}>Public; CDN-friendly cache headers.</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {user ? (
        <>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Sync (manual trigger)</h2>
        <p className={styles.sectionText}>
          Run a provider sync from the operator console when you need a fresh pull on demand.{' '}
          <code className={styles.inlineCode}>GET …/sync/&#123;provider&#125;</code> returns JSON, while{' '}
          <code className={styles.inlineCode}>GET …/sync/&#123;provider&#125;/stream</code> streams live progress over
          Server-Sent Events and ends with a <code className={styles.inlineCode}>done</code> frame whose{' '}
          <code className={styles.inlineCode}>result</code> matches the JSON response.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Method</th>
                <th>Path</th>
                <th>Example response</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {SYNC.map((id) => (
                <tr key={id}>
                  <td>
                    <span className={styles.methodGet}>GET</span>
                  </td>
                  <td>
                    <code className={styles.path}>/api/widgets/sync/{id}</code>
                  </td>
                  <td>
                    <SchemaResponseCell
                      example={manualSyncResponseExample}
                      errorHint='400: plain text &quot;Unrecognized or unsupported provider.&quot; · 500: { &quot;error&quot;: … }'
                    />
                  </td>
                  <td className={styles.notes}>Runs queue-backed sync for the provider.</td>
                </tr>
              ))}
              <tr>
                <td>
                  <span className={styles.methodGet}>GET</span>
                </td>
                <td>
                  <code className={styles.path}>/api/widgets/sync/&#123;provider&#125;/stream</code>
                </td>
                <td>
                  <SchemaResponseCell
                    example={manualSyncStreamSseExample}
                    errorHint="Same rate limits as non-stream. Compression skipped for this path. Body is not JSON—parse SSE data lines."
                  />
                </td>
                <td className={styles.notes}>
                  Same sync as above with <code className={styles.inlineCode}>text/event-stream</code>; provider-specific{' '}
                  <code className={styles.inlineCode}>progress</code> steps, then <code className={styles.inlineCode}>done</code>{' '}
                  or <code className={styles.inlineCode}>error</code>.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Auth &amp; session</h2>
        <p className={styles.sectionText}>
          These routes support the current Firebase-based sign-in flow and turn ID tokens into admin-friendly session
          behavior for the console.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Method</th>
                <th>Path</th>
                <th>Example response</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <span className={styles.methodPost}>POST</span>
                </td>
                <td>
                  <code className={styles.path}>/api/auth/session</code>
                </td>
                <td>
                  <SchemaResponseCell
                    example={authSessionExample}
                    errorHint="401 / 403 / 500 return { &quot;ok&quot;: false, &quot;error&quot;: string }. Sets Set-Cookie: session on success."
                  />
                </td>
                <td className={styles.notes}>
                  <code className={styles.inlineCode}>Authorization: Bearer &lt;Firebase ID token&gt;</code>{' '}
                  — sets HTTP-only session cookie.
                </td>
              </tr>
              <tr>
                <td>
                  <span className={styles.methodPost}>POST</span>
                </td>
                <td>
                  <code className={styles.path}>/api/auth/logout</code>
                </td>
                <td>
                  <SchemaResponseCell
                    example={authLogoutExample}
                    errorHint="500 returns { &quot;ok&quot;: false, &quot;error&quot;: string }."
                  />
                </td>
                <td className={styles.notes}>Authenticated; revokes refresh tokens and clears session cookie.</td>
              </tr>
              <tr>
                <td>
                  <span className={styles.methodGet}>GET</span>
                </td>
                <td>
                  <code className={styles.path}>/api/client-auth-config</code>
                </td>
                <td>
                  <SchemaResponseCell example={clientAuthConfigExample} />
                </td>
                <td className={styles.notes}>Firebase web client config for the admin UI.</td>
              </tr>
              <tr>
                <td>
                  <span className={styles.methodGet}>GET</span>
                </td>
                <td>
                  <code className={styles.path}>/api/firebase-config</code>
                </td>
                <td>
                  <SchemaResponseCell example={clientAuthConfigExample} />
                </td>
                <td className={styles.notes}>Alias of client auth config.</td>
              </tr>
              <tr>
                <td>
                  <span className={styles.methodGet}>GET</span>
                </td>
                <td>
                  <code className={styles.path}>/api/csrf-token</code>
                </td>
                <td>
                  <SchemaResponseCell example={csrfTokenExample} />
                </td>
                <td className={styles.notes}>CSRF token for mutating requests that require it.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>User (authenticated)</h2>
        <p className={styles.sectionText}>
          Account routes that are only relevant after sign-in, including profile inspection and account deletion.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Method</th>
                <th>Path</th>
                <th>Example response</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <span className={styles.methodGet}>GET</span>
                </td>
                <td>
                  <code className={styles.path}>/api/user/profile</code>
                </td>
                <td>
                  <SchemaResponseCell
                    example={userProfileExample}
                    errorHint="401 / 500 may return { &quot;ok&quot;: false, &quot;error&quot;: string } (or 500 from rate limit JSON)."
                  />
                </td>
                <td className={styles.notes}>Session cookie or Bearer ID token.</td>
              </tr>
              <tr>
                <td>
                  <span className={styles.methodDel}>DELETE</span>
                </td>
                <td>
                  <code className={styles.path} style={{ whiteSpace: 'nowrap' }}>
                    /api/user/account
                  </code>
                </td>
                <td>
                  <SchemaResponseCell
                    example={accountDeleteExample}
                    errorHint="500 returns { &quot;ok&quot;: false, &quot;error&quot;: string }."
                  />
                </td>
                <td className={styles.notes}>Deletes Firebase user and related data.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
        </>
      ) : null}
    </>
  )
}
