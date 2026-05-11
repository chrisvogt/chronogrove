# Changelog

All notable changes to **chronogrove-console** (the Next.js admin UI on Firebase App Hosting) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.27] - 2026-05-10

### Fixed

- **`SettingsProfileIdentity`** — Onboarding **`load()`** no longer forces the full-page loading state when **`progressRef`** already holds a payload, so overlapping or Strict Mode effect runs do not unmount the username block and wipe in-flight edits (flaky **`/is available`** assertions under **`test:coverage`**).

### Tests

- **`baseUrl`** / **`tenant-api-root-map`** — Production-like hostname stubs use **`console.chronogrove.com`** and **`operator.unmapped.example`** instead of a private deploy host.
- **`SettingsProfileIdentity`** — **`mockUser()`** includes a stable **`uid`**; username-save flows wait for **`Save username`** to become enabled instead of matching availability hint text. Clearing the username (advanced) uses **`userEvent.clear`**, **`waitFor`** an empty input, and **`waitUntilSaveUsernameEnabled`** before **`Save username`** so **`fireEvent.change` + `user.click`** cannot race on slow CI.

## [0.6.26] - 2026-05-09

### Changed

- **Dependencies** — **Next.js** `16.2.6`, **React** / **React DOM** `^19.2.6`, **Firebase** client `^12.13.0`, **three** `^0.184.0`, **@types/three** `^0.184.1`.

## [0.6.25] - 2026-05-04

### Fixed

- **Firebase App Hosting** — Pin **Next.js** to exact **`16.2.4`** in **`package.json`** (not a **`^`** range). The **`@apphosting/adapter-nextjs`** CVE gate passes that string to **`semver.satisfies(version, …)`**, which treats **`^16.2.4`** as an invalid version and blocks deploy with a false “vulnerable Next” error even though **16.2.4** satisfies the patched **`>=16.1.0`** allowlist.

### Documentation

- **`docs/APP_HOSTING.md`** — “Next.js version string” note for the App Hosting buildpack; **`README.md`** (this app) links to it from the build section.

## [0.6.24] - 2026-05-03

### Security

- **Dependencies** — **Next.js** `^16.2.4` (replaces exact **16.2.2**; includes **≥16.2.3** Server Components DoS fix), **React** `^19.2.5`, **Firebase** client `^12.12.1`, **Vitest** / **`@vitest/coverage-v8`** `^4.1.5`, **jsdom** `^29.1.1`, **@types/node** `^24.12.2`; workspace **`vite`** override (via root `pnpm.overrides`) clears **Vitest 8.0.x** dev-server advisories for local `vitest` / `next dev` tooling.

## [0.6.23] - 2026-05-03

### Changed

- **Schema / docs** — Goodreads widget example **`collections.recentlyReadBooks`** entries include **`readAt`** to match the Functions sync payload.

## [0.6.22] - 2026-04-10

### Added

- **Onboarding username gate** — Verified users who have not chosen a public slug (no persisted **`username`** and **`username`** not in **`completedSteps`**) are redirected to **`/onboarding/`** after the API session is ready. Marketing and auth routes are excluded (**`/about`**, **`/docs`**, **`/privacy`**, **`/verify-email`**, **`/signup`**, **`/auth`**, public **`/u/*`**).
- **Tests** — **`src/lib/overviewQuickLinks.test.ts`** (dashboard quick-link URLs for signed-in vs signed-out); **`src/lib/tenantDisplay.test.ts`** (**`resolveDashboardTenantHostname`**); **`src/lib/onboardingUsernameCompletion.test.ts`** (**`hasCompletedUsernameSelection`**).

### Changed

- **Auth / session** — Clear stale HttpOnly **`session`** cookies when switching Firebase accounts (**`POST /api/auth/clear-session-cookie`**, **`apiClient.clearStaleSessionCookie`**, **`AuthContext`** on uid change and before email sign-up). Session creation uses a **force-refreshed** ID token (**`getIdToken(true)`**) so **`email_verified`** matches the server after verification links.
- **Dashboard quick links** — Overview card links are **Settings**, **Docs**, **Public status page** (when a public **username** exists) or **Account setup**, and **GitHub**; signed-out visitors see **Docs**, **About**, and **Sign in**. Implemented as **`buildOverviewQuickLinks`** in **`src/lib/overviewQuickLinks.ts`** (used by **`OverviewSection`**).

### Fixed

- **Dashboard hero** — Headline uses **`GET /api/onboarding/progress`**: configured **`customDomain`** (tenant API host) when set, else **`NEXT_PUBLIC_DEFAULT_PUBLIC_API_HOST`** (default **`api.chronogrove.com`**) when a public **username** exists, else **`NEXT_PUBLIC_TENANT_DISPLAY_HOST`**. **`resolveDashboardTenantHostname`** in **`src/lib/tenantDisplay.ts`**.
- **Dashboard hero typography** — Relaxed **`line-height`**, added slight **`padding-bottom`**, and set the hero to **`overflow: visible`** so gradient headline text does not clip descenders (e.g. “g”).

## [0.6.21] - 2026-04-08

### Changed

- **Console entry flow** — Signed-out visitors now land on **`/auth/`** instead of the old overview dashboard. The overview is now a signed-in **Dashboard** route in the left navigation alongside **Schema**, **Status**, **Try API**, and **Sync**.
- **Copy** — General console wording now refers to the **Chronogrove console** instead of a specific deployment or tenant, while leaving the real tenant/custom-domain public status surfaces unchanged.
- **Auth page** — The top link now points to **`https://chronogrove.com`**.

### Added

- **Tests** — Coverage for the protected main layout redirect flow, signed-in dashboard shell/navigation, and the updated page metadata/copy touched by this change set.

### Changed

- **`src/lib/request-host-headers.ts`** — Shared **`primaryHostLineFromHeaders`** / **`hostLabelFromHostLine`** for comma-safe **`Host`** / **`X-Forwarded-Host`** parsing used by **`src/proxy.ts`**, **`/u/[username]`**, **`getServerWidgetFetchOrigin`**, and **`fetchWidgetStatusRow`** (avoids drift vs Functions’ `resolveOriginalRequestHostname` pattern).

### Fixed

- **Vitest / RTL** — `configure({ asyncUtilTimeout: 8000 })` in **`vitest.setup.ts`** and **800ms** post-debounce wait in **`SettingsProfileIdentity.test.tsx`** so username availability assertions stay reliable under **`test:coverage`** on slower CI runners.
- **Coverage** — Tests for **`/u/[username]`** (`status_debug`, hostname-map copy, `x-forwarded-host`), **`fetchWidgetStatusRow`** debug / error branches, and **`isAuthlessPublicStatusSurface`** non-public paths so **`test:coverage`** per-file thresholds pass in CI.

## [0.6.20] - 2026-04-08

### Added

- **Public tenant status** — Route **`/u/[username]`** (SSR widget health table, Chronogrove footer). **`/widgets/:path*`** rewrites to Cloud Functions **`/api/widgets`** like **`/api`**. **`src/proxy.ts`** rewrites **`/`** → **`/u/{slug}`** when **`NEXT_PUBLIC_TENANT_API_ROOT_TO_USERNAME`** (or **`TENANT_API_ROOT_TO_USERNAME`**) maps the request host to a public username slug.
- **`.env.template`** — Documented optional console env vars (copy to **`.env.local`**).
- **Tests** — **`src/lib/tenant-api-root-map.test.ts`**, **`src/lib/server-widget-fetch-origin.test.ts`**.

### Changed

- **Onboarding / settings** — Public profile prefix in copy is **`api.chronogrove.com/u/`** (was **`chronogrove.com/u/`**).
- **Status section** — Shared provider list and **`meta.synced`** parsing live in **`src/lib/widget-status.ts`**.

### Fixed

- **`/u/[username]`** — In **`next dev`**, server-side widget checks call the **Functions emulator on `127.0.0.1:5001`** directly (optional **`INTERNAL_FUNCTIONS_EMULATOR_APP_ORIGIN`**) instead of looping back to **`http://{host}:5173`**, avoiding **`*.local` IPv6-first connection stalls** and mistaken **`https://`** defaults when **`x-forwarded-proto`** is absent.

## [0.6.19] - 2026-04-07

### Changed

- **Next.js** — Upgraded **15.5.14 → 16.2.2** (Turbopack default for production build). Config is **`next.config.mjs`** (ESM) so `import.meta.url` works with Next 16’s config loader; same env defaults and **`beforeFiles`** `/api` rewrites as before.
- **Proxy** — **`src/middleware.ts`** renamed to **`src/proxy.ts`** with **`export function proxy`** per Next 16 ([middleware → proxy](https://nextjs.org/docs/messages/middleware-to-proxy)); scanner blocklist behavior unchanged.
- **TypeScript** — Next aligned **`tsconfig.json`** (**`jsx`: `react-jsx`**, include **`.next/dev/types/**/*.ts`** for typed routes in dev).

### Fixed

- **Vitest** — **`SettingsProfileIdentity`** username test mock allows two successful **`getIdToken`** resolutions so **React Strict Mode** double-invocation of the progress **`useEffect`** does not leave the screen in a load error before the debounced username check runs.

## [0.6.18] - 2026-04-05

### Fixed

- **`SettingsProfileIdentity`** — Concurrent **Save username** / **Save domain** could each submit a full onboarding payload built from stale props, so one save could undo the other on the server. Saves now share a single in-flight guard and read companion fields from a synced **`progressRef`** updated on load and after each successful **`PUT`**.

### Added

- **Tests** — Vitest **`SettingsProfileIdentity.test.tsx`** (session/load/error paths, merged PUT bodies, cross-block save lock, username/DNS edge cases, **`progressRef`** guards). **`vitest.setup.ts`** (`@testing-library/jest-dom`, RTL cleanup, real timers after each test). **`@vitejs/plugin-react`** for JSX in **`*.test.tsx`**; **`@testing-library/jest-dom`** / **`@testing-library/user-event`** dev dependencies.
- **Coverage** — **`SettingsProfileIdentity.tsx`** included in coverage; **`vitest.config.ts`** adds **`@`** → **`src`** alias, **`testTimeout`**, and per-file thresholds (**95%** lines/statements; **85%** branches / **92%** functions) so JSX-heavy settings UI can meet gates alongside library modules.

## [0.6.17] - 2026-04-04

### Changed

- **Custom domain (onboarding + settings)** — DNS instructions use a **CNAME** to **`NEXT_PUBLIC_ONBOARDING_CNAME_TARGET`** (default App Hosting **`personal-stats-chrisvogt.web.app`**) instead of two Fastly **A** records; aligns with **`GET /api/onboarding/check-domain`** (`requiredCname`).
- **`next.config.ts` / `apphosting.yaml`** — Public env **`NEXT_PUBLIC_ONBOARDING_CNAME_TARGET`** (default **`personal-stats-chrisvogt.web.app`**).
- **`middleware.ts`** — TODO note for future host-based routing so tenant API hostnames do not serve the full console.

### Added

- **`lib/onboardingCnameTarget.ts`** — Shared default for DNS copy; Vitest **`onboardingCnameTarget.test.ts`**. Coverage config includes this module (per-file **95%** thresholds unchanged).

## [0.6.16] - 2026-04-04

### Added

- **`auth/establishApiSession.ts`** — Shared helper for **`POST /api/auth/session`** plus **`localStorage`** Bearer fallback; covered by Vitest (jsdom).
- **`apphosting.yaml`** (at the console package root) — Firebase App Hosting run config and public env for the console (see root `firebase.json`).

### Changed

- **Next.js** — SSR App Hosting build (removed static `output: 'export'` / `trailingSlash`); production **`/api/:path*`** rewrites proxy to **`NEXT_PUBLIC_CLOUD_FUNCTIONS_APP_ORIGIN`**; dev uses **`beforeFiles`** rewrites to the Functions emulator (avoids App Router eating `/api` before proxy).
- **`getAppBaseUrl()`** — Same-origin **`/api`** only (no hardcoded metrics hostname); SSE unchanged (`getSyncStreamBaseUrl`).
- **Sign-up / Google** — Await **`establishApiSession`** before navigation; **`router.push('/onboarding/')`** instead of **`window.location`** so session `fetch` is not aborted mid-flight.
- **Onboarding** — Clear load error when retrying progress fetch; username field layout uses CSS grid and drops inner **`input:focus-visible`** outline in favor of the composite control ring.
- **Vitest** — Coverage includes **`establishApiSession`**; per-file thresholds **95%** (lines / statements / functions / branches). **`jsdom`** dev dependency for session tests.

### Fixed

- **Sign-up → onboarding** — “Could not load saved progress” on first paint when full navigation interrupted session cookie creation.

## [0.6.15] - 2026-04-03

### Added

- **Settings → Profile & API host** — Edit **username** and **custom API domain** after onboarding via **`SettingsProfileIdentity`** (**`components/user-settings/`**), same availability / DNS checks and **`PUT /api/onboarding/progress`** as the wizard. Layout uses **`profileRegion`** plus subsection spacing for parity with other settings blocks.

### Changed

- **`lib/onboardingConstraints.ts`** — Shared **`ONBOARDING_USERNAME_PATTERN`** for onboarding and settings.
- **Onboarding (username step)** — Copy now states the slug can be changed later in **Settings**.

**Deploy with Functions ≥ 0.29.0** for **`tenant_hosts`**, **`tenantHostname`**, and onboarding persistence behavior.

## [0.6.14] - 2026-04-04

### Fixed

- **Try API → Get widget data** — Each test now loads a **fresh Firebase ID token** via **`buildWidgetFetchHeaders`** instead of reusing async `idToken` state (which could still be empty on first click). Fixes production **cross-origin** console → operator-host requests that do not carry session cookies, so **GitHub** correctly reflects **OAuth** when linked instead of falling back to PAT and **`githubAuthMode: env`**.

## [0.6.13] - 2026-04-03

### Added

- **GitHub OAuth** — **Onboarding** and **Add providers** flyout: link/cancel flow (**`ProviderConnectionGrid`**), **`?oauth=github`** flash, same patterns as Flickr/Discogs.
- **Try API** — **Get widget data** sends **`Authorization: Bearer`** when an ID token is present; badge after a successful **github** request (**OAuth** vs **PAT / env**) via **`readGitHubAuthModeFromWidgetResponse`** and **`githubAuthMode`** on the widget JSON.

### Changed

- **Deploy with Functions ≥ 0.28.0** for GitHub OAuth routes, **`githubAuthMode`**, and authenticated widget reads.

## [0.6.12] - 2026-04-03

### Added

- **Discogs OAuth** — Same onboarding / flyout flow as Flickr (**`ProviderConnectionGrid`**, cancel pending, **`?oauth=discogs`** flash on **Onboarding** and **Overview**).
- **Sync page** — Badge after manual Discogs sync showing **OAuth (connected)** vs **legacy (env token)** via **`readDiscogsAuthModeFromSyncPayload`** and **`worker.discogsAuthMode`**.

### Changed

- **Deploy with Functions ≥ 0.27.0** for Discogs OAuth routes and sync **`discogsAuthMode`**.

## [0.6.11] - 2026-04-03

### Added

- **Onboarding** — **Flickr** link via OAuth (`ProviderConnectionGrid` / **`handleOAuthProviderConnect`**), optional cancel of a **pending** link, and flash copy for OAuth **success** or **error** query params.

### Fixed

- **Onboarding OAuth flash cleanup** — After reading **`oauth`**, **`status`**, **`reason`** (and **`providers`**), **`history.replaceState`** keeps unrelated query parameters, matching **Overview** behavior. **Deploy with Functions ≥ 0.26.0** for the Flickr API routes and **`PUT /api/onboarding/progress`** payload shape.

## [0.6.10] - 2026-03-31

### Changed

- **Dependencies** — Non-major bumps only: **Next.js** ^15.5.14, **firebase** ^12.11.0, **Vitest** / **@vitest/coverage-v8** ^4.1.2, **@types/node** ^22.19.15 (aligned with workspace **pnpm-lock.yaml**).

## [0.6.9] - 2026-04-01

### Fixed

- **Username availability on onboarding** — `check-username` requests now send **`Authorization: Bearer`** + Firebase ID token when signed in so the API can treat your **existing tenant claim** as available (same fix pattern as progress/sync). Prevents “taken by me” when the session cookie is not verified on that route. **Deploy with functions ≥ 0.25.7** so users who only have **`username` on `users/{uid}`** (no tenant claim yet) are also recognized as the owner.

## [0.6.8] - 2026-04-01

### Fixed

- **Onboarding progress API** — `GET`/`PUT` `/api/onboarding/progress` now sends **`Authorization: Bearer` + Firebase ID token** from `user.getIdToken()` (same pattern as manual sync SSE). The HttpOnly **`session` cookie** was present in the browser but **`verifySessionCookie` was failing** on the function; without `localStorage` fallback there was no Bearer, so the handler returned **`No valid authorization header found`**.

## [0.6.7] - 2026-04-01

### Security

- **Auth storage** — After a successful `createSession`, the Firebase ID token is no longer copied into `localStorage`. API auth relies on the **HttpOnly `session` cookie** plus **`apiSessionReady`** gating. `localStorage` is still used **only when session creation fails** (e.g. allowlist) so those clients can keep using Bearer fallback.

## [0.6.6] - 2026-04-01

### Fixed

- **Onboarding / API auth race** — `onAuthStateChanged` called `setUser` before `createSession` finished, so `GET /api/onboarding/progress` sometimes ran with no `session` cookie yet and no `Authorization` bearer (HttpOnly session is not readable from JS, and the success path did not set `localStorage`). That produced **`No valid authorization header found`**. The provider now exposes **`apiSessionReady`**, and onboarding waits for it before loading progress.

## [0.6.5] - 2026-03-31

### Fixed

- **CSRF on mutating API calls** — `ApiClient.putJson` now always fetches a fresh token from `GET /api/csrf-token` before `PUT`, so the `X-XSRF-TOKEN` header matches the current `_csrfSecret` cookie. Reusing a stale `XSRF-TOKEN` from `document.cookie` alone caused intermittent **“CSRF token mismatch”** in production (especially after strict cookie behavior or a desynced pair), including when saving onboarding progress.

## [0.6.4] - 2026-03-29

### Fixed

- **Build metadata SHA** — Local `pnpm run build`, `pnpm run dev`, `pnpm run dev:full:fresh`, and hosting deploys now pass the current short git SHA into the hosting build, and Turbo keys `chronogrove-console#build` on the SHA env vars used by `next.config.ts`. This prevents cached `hosting/out` bundles from reusing an older sidebar SHA across commits.

### Added

- **Tests** — `src/lib/buildSha.test.ts` covers the SHA env precedence, normalization, git fallback, and `unknown` fallback branches; coverage now includes `src/lib/buildSha.ts` alongside the existing per-file 100% checks.

## [0.6.3] - 2026-03-28

### Fixed

- **Firebase Hosting** — `firebase.json` sets `Cache-Control` so HTML and other documents revalidate (`public, max-age=0, must-revalidate`) while `/_next/static/**` remains long-lived (`immutable`), reducing post-deploy `ChunkLoadError` and odd client-side navigation when the CDN or browser kept an older shell.

## [0.6.2] - 2026-03-28

### Fixed

- **Overview (`/`)** — Provider cards read **`extractOverviewMetrics`** from `src/lib/overviewMetrics.ts`. **Discogs** stores `metrics` as a `Record` (e.g. “LPs Owned”), not a `WidgetMetricValue[]`, so the overview showed “Live — no stored metrics” despite a 200. **Goodreads** never emits `metrics`; counts now come from **`profile.readCount`** and **`collections.recentlyReadBooks.length`** when needed.

### Added

- **Tests** — `src/lib/overviewMetrics.test.ts`; Vitest coverage includes `overviewMetrics.ts` with `perFile` thresholds alongside `baseUrl.ts`.

## [0.6.1] - 2026-03-28

### Fixed

- **Manual sync SSE** — The sync test `fetch` now targets the Cloud Functions HTTPS origin (`NEXT_PUBLIC_CLOUD_FUNCTIONS_APP_ORIGIN`, default in `next.config.ts`) via `getManualSyncStreamUrl()`, so Firebase Hosting rewrites no longer buffer the entire `text/event-stream` response. Granular progress lines appear during the job.

### Added

- **Tests** — Vitest for the hosting package; `src/lib/baseUrl.test.ts` with 100% coverage of `src/lib/baseUrl.ts` (thresholds enforced in `vitest.config.ts`).

## [0.6.0] - 2026-03-28

### Added

- **Chronogrove** — Product naming and **Starry Night**–inspired palette (indigo sky, cerulean accents, gold highlights) across the main console shell, overview, and shared CSS tokens.
- **Overview (`/`)** — Deployment dashboard: provider health cards from widget endpoints, quick links to schema/status/sync, and **GroveScene** (Three.js fractal tree + provider “stem” state).
- **Tenant headline** — `NEXT_PUBLIC_TENANT_DISPLAY_HOST` (default in `next.config.ts`; override per deployment). Overview hero and metadata use the public site hostname instead of a fixed title.
- **Sign-in background** — Full-screen **StarryNightScene** (Three.js): layered brush-stroke bundles, starbursts, cypress, rolling hills, village silhouettes, moon, particles; elastic pop-in and mouse parallax. Replaces the earlier 2D canvas / line-only experiments.
- **Marketing shell** — Optional `footerCopy` prop; default footer text describes Chronogrove without implying link position. `hosting/.env.example` documents tenant display host.
- **Public pages** — `/docs/`, `/privacy/`, `/about/` with matter-of-fact copy (not marketing pitch).

### Changed

- **Framework** — **Vite → Next.js 15** (App Router, `output: 'export'` → `hosting/out`). Routes include `/`, `/schema/`, `/status/`, `/auth/`, `/endpoints/`, `/sync/`, plus static marketing routes. Build metadata: `NEXT_PUBLIC_GIT_SHA` via `next.config.ts`.
- **Dev proxy** — `next.config.ts` rewrites forward `/api` to the Functions emulator in development only (static export does not ship those rewrites; production uses `firebase.json`).
- **Layout** — Chronogrove sidebar branding; overview section kicker includes tenant host when on home.
- **Status** — Table column label **Status** (response code), not “HTTP”, to avoid implying cleartext-only APIs.
- **Copy** — Privacy/docs wording for HTTPS vs public endpoints; overview uses **stems** for live providers.

### Removed

- **Vite** — `vite.config.ts`, SPA entry (`main.tsx` / `App.tsx`), and unused `react-router-dom` wrapper.
- **Hosting SPA catch-all** — Dropped `firebase.json` rewrite `**` → `/index.html` so unknown paths use Firebase’s **`404.html`** from `hosting/out` instead of always loading the home shell.

## [0.5.0] - 2026-03-27

### Added

- **Schema** — Row and sample payload for manual sync **SSE** `GET /api/widgets/sync/{provider}/stream` (`text/event-stream`: `progress` / `done` / `error`).
- **JsonCodeBlock** — Lowlight-based JSON examples on the schema page (reuses shared example objects).
- **Sync** — Consumes the SSE stream during manual sync for live status (same session as the JSON route).

### Changed

- **Schema** — Sync section intro contrasts queue-backed JSON `GET …/sync/{provider}` vs streaming `…/stream`.

## [0.4.0] - 2026-03-26

### Added

- **Schema** — API reference page: public widget `GET` routes always visible; sync, auth/session, and account routes only when signed in.
- **Status** — Table of lightweight `GET` checks (widgets + optional `/api/client-auth-config` when signed in), latency, and `meta.synced` when present.
- **`getAppBaseUrl()`** — Shared base URL helper for dev vs production API calls.
- **Build metadata** — Short Git commit SHA under the sidebar title via Vite `define` (env fallbacks: `VITE_GIT_SHA`, `GITHUB_SHA`, etc., then `git rev-parse`).

### Changed

- **Layout** — METRICS API branding; minimal top bar (sign-in / avatar + sign-out); removed duplicate header title and sidebar “Main” group; **Schema** and **Status** in nav for everyone; **API** and **Sync** when signed in.
- **Sign-in** — Moved from sidebar to header; sign-in view keeps FloatingLines + existing auth forms.
- **Status** — `meta.synced` at Unix epoch (`Date(0)`) displays as **—**, consistent with missing sync timestamps.

## [0.3.0] - 2026-03-06

### Added

- **Local workflow** — This package is the Vite app started by root `pnpm run dev:full` alongside Auth and Functions emulators.

### Fixed

- **API testing** — Bypass browser cache for widget, session, and sync test requests so developer tests see fresh responses.
- **Vite proxy** — When the backend is not running, `/api` requests return 503 with JSON instead of raw connection errors.
