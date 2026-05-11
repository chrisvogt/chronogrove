# Changelog

All notable changes to the root repo (tooling, scripts, CI, and workspace layout) are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Package-specific changes:

- **Functions** – [functions/CHANGELOG.md](functions/CHANGELOG.md)
- **Console** (operator UI) – [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md)

---

## [Unreleased]

### Changed

- **Workspace** — **Functions 0.30.8**: Spotify **`me/top/tracks`** sync requests **`limit: 24`** instead of **12**, so the widget can surface more short-term top tracks after the next sync. See **[functions/CHANGELOG.md](functions/CHANGELOG.md)**.

- **Workspace** — **Functions 0.30.7** and **Console 0.6.27**: Steam AI summary prompt slimmed so default Anthropic **`max_tokens`** no longer truncates JSON in production; console **`SettingsProfileIdentity`** clear-username test hardened for CI; functions release also includes CORS allowlist tweak for **`chrisvogt.me`**, emulator **`prestart` → `build`**, and AI summary **`jsonrepair`** / logging adjustments documented in **[functions/CHANGELOG.md](functions/CHANGELOG.md)**. See [functions/CHANGELOG.md](functions/CHANGELOG.md) and [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md).

- **Workspace** — **Console 0.6.25**: **Next.js** pinned to exact **`16.2.4`** so Firebase App Hosting’s **`@apphosting/adapter-nextjs`** CVE version check receives a valid semver (ranges like **`^16.2.4`** were mis-rejected and blocked deploy). Documented in **[docs/APP_HOSTING.md](docs/APP_HOSTING.md)** and **[apps/console/README.md](apps/console/README.md)**. See [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md).

- **Workspace** — **Functions 0.30.5**: AI summary provider swapped from Gemini to **Anthropic** (`claude-sonnet-4-6`); `@google/generative-ai` removed; `GEMINI_API_KEY` / `gemini.api_key` renamed to `ANTHROPIC_API_KEY` / `anthropic.api_key`; new `utils/ai-summary-messages.ts` direct HTTP client with `resolveMaxTokens` and 23 new unit tests. See [functions/CHANGELOG.md](functions/CHANGELOG.md).

- **Workspace** — **Functions 0.30.4** and **Console 0.6.24**: dependency refresh (security-motivated **Next.js** `^16.2.4`, shared **Firebase** `^12.12.1`, **Vitest** `^4.1.5`, **Turbo** `^2.9.8`, and related bumps in `apps/console` and `functions`); root **`pnpm.overrides`** pins transitive **`vite@8.0.5`** so Vitest / `@vitejs/plugin-react` no longer pull the **8.0.0–8.0.4** dev-server advisories. See [functions/CHANGELOG.md](functions/CHANGELOG.md) and [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md).

- **Workspace** — **Functions 0.30.3** and **Console 0.6.23**: Goodreads **`readAt`** on each **`recentlyReadBooks`** row and stable **most-recent-first** ordering when saving widget content; **`utils/sort-goodreads-recently-read-books`**, expanded Vitest coverage, and schema examples updated. See [functions/CHANGELOG.md](functions/CHANGELOG.md) and [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md).

- **Workspace** — **Functions 0.30.2**: refactors dual session/Bearer verification into **`resolveSessionAndBearerClaims`** (shared mismatch handling and cookie clear); expanded Vitest coverage for mismatch and auth middleware paths. See [functions/CHANGELOG.md](functions/CHANGELOG.md).

- **Workspace** — **Console 0.6.22** and **Functions 0.30.1**: account-switching session handling (stale HttpOnly **`session`** vs Firebase ID token), **`POST /api/auth/clear-session-cookie`**, onboarding redirect until a public **username** is chosen, **`getIdToken(true)`** for session cookie minting, dashboard hero hostname resolution (**`resolveDashboardTenantHostname`**), and overview **quick links** (**`buildOverviewQuickLinks`**) with Vitest coverage for the new helpers. See [functions/CHANGELOG.md](functions/CHANGELOG.md) and [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md).

- **Workspace** — **Console 0.6.20** and **Functions 0.30.0**: public tenant API and status routing ([GitHub #256](https://github.com/chrisvogt/chronogrove/issues/256)): optional widget **`uid`** / **`username`** query params; removed default **`api.chronogrove.com → chronogrove`** hostname map; console **`/u/[username]`**, **`/widgets/*`** rewrite, **`src/proxy.ts`** **`/`** → **`/u/{slug}`**, **`apps/console/.env.template`**, dev SSR widget fetches via **`127.0.0.1:5001`** emulator. See [functions/CHANGELOG.md](functions/CHANGELOG.md), [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md), [docs/APP_HOSTING.md](docs/APP_HOSTING.md).

- **Workspace** — **Console 0.6.19**: **Next.js 16.2.x** (from 15.5.x), **`next.config.mjs`**, **`src/proxy.ts`** (replaces deprecated middleware convention), **`tsconfig`** updates from Next; Vitest mock fix for Strict Mode in settings username check. See [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md).
- **Workspace** — **Console 0.6.18**: **`SettingsProfileIdentity`** fixes a race where concurrent username/domain saves could revert the other field; adds Vitest coverage and test tooling for that screen. See [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md).
- **Workspace** — **Functions 0.29.2** and **Console 0.6.17**: onboarding **`GET /api/onboarding/check-domain`** verifies a **CNAME** to a configurable target (default App Hosting **`personal-stats-chrisvogt.web.app`**); operator UI DNS instructions and env **`NEXT_PUBLIC_ONBOARDING_CNAME_TARGET`** / **`ONBOARDING_REQUIRED_CNAME_TARGET`** align. See [functions/CHANGELOG.md](functions/CHANGELOG.md) and [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md).
- **Workspace** — Operator console sources moved from **`hosting/`** to **`apps/console/`**; pnpm workspace package **`chronogrove-console`** (formerly **`chronogrove-hosting`**); **`firebase.json`** `apphosting.rootDir` is **`./apps/console`**; Turbo **`chronogrove-console#build`**. Deploy script name **`pnpm run deploy:hosting`** unchanged. See [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md).
- **Workspace** — **Functions 0.29.1**: **got** **15.x** (security); **graphql-got** removed in favor of inline GitHub GraphQL via **`got.post`**. See [functions/CHANGELOG.md](functions/CHANGELOG.md).
- **Documentation** — App Hosting operations guide [docs/APP_HOSTING.md](docs/APP_HOSTING.md); README architecture diagram 0 (production edge), **App Hosting backends** table, CI vs Firebase GitHub deploy, and **Additional docs** link; [apps/console/README.md](apps/console/README.md) backends subsection; [.agents/README.md](.agents/README.md) distinguishes **App Hosting** vs classic **Hosting** skills.
- **Workspace** — **Hosting 0.6.16**: Firebase **App Hosting** for the operator console (`apphosting.yaml`, `firebase.json` backends **`chronogrove-console`** / **`chronogrove-console-pr`**); Next SSR + same-origin **`/api`** proxy; production deploy **`firebase deploy --only apphosting:…`** (manual from repo root); **`pnpm dev:full`** starts emulators **without** the App Hosting emulator to avoid a second **`next dev`** on port 5173; CI runs lint, tests, and **`pnpm run build`**. See [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md).
- **Workspace** — **Hosting 0.6.15** and **Functions 0.29.0**: Firestore **`tenant_hosts`** + **`users.tenantHostname`** when onboarding (or settings) saves a **custom domain**; settings page **Profile & API host** to edit username and domain after onboarding; onboarding schema drops **`draftCustomDomain`** in favor of **`tenantHostname`**; new users default **`entitlements.customDomain`** to **true**; account delete clears hostname claims. See [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md) and [functions/CHANGELOG.md](functions/CHANGELOG.md).
- **Workspace** — **Hosting 0.6.14**: Try API widget tests send a **fresh ID token** on every click so GitHub **OAuth** vs PAT matches the signed-in operator on production (cross-origin API). See [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md).
- **Workspace** — **Hosting 0.6.13** and **Functions 0.28.0**: **GitHub App** user-to-server OAuth (`oauth_github_pending`, encrypted `integrations/github`), live widget + Try API uses linked token when the viewer is signed in (session or Bearer), optional **`githubAuthMode`** on **`GET /api/widgets/github`**, and operator-console badges (onboarding + Try API). Env PAT/username remains the anonymous fallback. See [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md) and [functions/CHANGELOG.md](functions/CHANGELOG.md).
- **Workspace** — **Hosting 0.6.12** and **Functions 0.27.0**: **Discogs OAuth 1.0a** (parallel to Flickr), `oauth_discogs_pending`, onboarding/provider flyout + sync-console auth-mode badge, signed collection fetches, and expanded unit tests. **Codecov** patch coverage target raised to **95%**. See [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md) and [functions/CHANGELOG.md](functions/CHANGELOG.md).
- **Workspace** — **Hosting 0.6.11** and **Functions 0.26.0**: **Flickr OAuth 1.0a** (per-user widget auth), encrypted integration credentials, `oauth_flickr_pending` Firestore deny rule, onboarding + overview OAuth flash handling, CodeQL-friendly **express-rate-limit** usage, and stricter widget route typing. See [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md) and [functions/CHANGELOG.md](functions/CHANGELOG.md).
- **Repository** — Relicensed from **MIT** to [**Apache License 2.0**](LICENSE). Earlier revisions remain available under their original license; new contributions and the default license for the tree as checked in follow Apache 2.0. Root **`package.json`** and workspace packages now declare **`Apache-2.0`** (SPDX). See [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md) and [functions/CHANGELOG.md](functions/CHANGELOG.md).
- **Workspace** — **Hosting 0.6.10** and **Functions 0.25.9**: non-major dependency bumps only (Next.js stays on 15.x, TypeScript on 5.x, `@types/node` within existing major lines: ^22 hosting, ^24 functions). Root **Turbo** ^2.9.3; shared **Firebase** client **^12.11.0**; Vitest **4.1.2** stack; minor patch lines for ESLint, typescript-eslint, and `express-rate-limit`. See [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md) and [functions/CHANGELOG.md](functions/CHANGELOG.md).
- **Repository** — Weekly **Dependabot** **`npm`** updates at the workspace root (one entry for the shared **`pnpm-lock.yaml`**; covers `functions/` and `apps/console/`).
- **Firestore** — **Default-deny** security rules for the client SDK (`firestore.rules`); widget reads remain public via **`GET /api/widgets/*`** (Admin SDK). Deploy rules with **Functions 0.26.0**. See [functions/CHANGELOG.md](functions/CHANGELOG.md).
- **Repository** — GitHub project renamed to [chrisvogt/chronogrove](https://github.com/chrisvogt/chronogrove) (formerly `metrics`). Workspace package names are now `chronogrove`, `chronogrove-console`, and `chronogrove-functions`; README, operator UI links, and changelogs updated. If you use Codecov, reconnect the repo under the new name so badges keep working.
- **Functions 0.25.6** — Widget API caching now favors revalidation across all providers: browser responses revalidate (`max-age=0, must-revalidate`) while shared caches keep a short TTL (`s-maxage=300`, `stale-while-revalidate=60`) to reduce stale widget payloads after sync. See [functions/CHANGELOG.md](functions/CHANGELOG.md).
- **Functions 0.25.5** — Removed `requestretry` from Spotify profile/top-tracks requests, standardized on a shared `got` Spotify client (retry + JSON defaults), and added unit coverage for that shared client. See [functions/CHANGELOG.md](functions/CHANGELOG.md).
- **Functions 0.25.4** — Goodreads widget requests **35** shelf rows (30 display + **5** buffer) so failed lookups are less likely to shrink the grid below 30 titles. See [functions/CHANGELOG.md](functions/CHANGELOG.md).
- **Functions 0.25.3** — Lazy backend bootstrap in the Firebase entrypoint so deploy-time export discovery no longer reads `STORAGE_FIRESTORE_DATABASE_URL.value()` early; tests updated for first-request initialization. See [functions/CHANGELOG.md](functions/CHANGELOG.md).
- **Functions 0.25.2** — Goodreads AI summary: prompt allows two or three `<p>` blocks; stored HTML is no longer truncated to two paragraphs (homepage handles “Read more”). See [functions/CHANGELOG.md](functions/CHANGELOG.md).
- **Hosting 0.6.2** — Overview home cards show Discogs and Goodreads metrics (record-shaped `metrics` and Goodreads fallbacks). See [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md).
- **Functions 0.25.1** — Global `/api` CORS (before CSRF) so OPTIONS preflight works for cross-origin sync SSE to Cloud Functions. See [functions/CHANGELOG.md](functions/CHANGELOG.md).
- **Hosting 0.6.1** — Manual sync SSE requests use the Cloud Functions URL so streams are not buffered by Firebase Hosting; Vitest coverage for `baseUrl` helpers. See [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md).
- **Hosting** – Admin UI migrated from Vite to **Next.js 15** (App Router, static export to `hosting/out`); docs and changelogs updated. Firebase Hosting no longer uses an SPA catch-all rewrite (unknown URLs → `404.html`). See [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md).
- **Hosting 0.5.0** – Schema documents manual sync **SSE** (`/stream`); JsonCodeBlock examples; Sync page streams progress. See [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md).
- **Functions 0.25.0** – Manual sync **`GET /api/widgets/sync/:provider/stream`**, `onProgress` across provider sync jobs, compression bypass for SSE. See [functions/CHANGELOG.md](functions/CHANGELOG.md).
- **Hosting 0.4.0** – Admin UI: Schema and Status pages, layout and header auth, build-time git SHA. See [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md).
- **Functions 0.23.0** – Firestore-backed sync job queue, breaking change to `GET /api/widgets/sync/:provider` JSON, Instagram `INSTAGRAM_USER_ID` and Graph fetch updates. See [functions/CHANGELOG.md](functions/CHANGELOG.md) **0.23.0** (BREAKING).
- **Dependency updates** – Functions: axios, express-rate-limit 8.x, firebase, firebase-admin, firebase-functions, eslint, globals; @types/node kept at ^24 for Node 24. Hosting: Next.js 15, three 0.183.x, `@types/three` (Clock → Timer in FloatingLines; Vite and `react-router-dom` removed). See [functions/CHANGELOG.md](functions/CHANGELOG.md) and [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md).
- **Functions source layout** – Source previously under `functions/lib/` is now split by role into `config/`, `widgets/`, `utils/`, and `helpers/`. The `functions/lib/` directory is TypeScript build output only and is fully gitignored. See [functions/CHANGELOG.md](functions/CHANGELOG.md).
- **Functions test coverage** – New/expanded tests (CSRF validate, Google Books type guard, GCS errors, rate-limit forwarded-for, sync metrics, AI summary prompt branches, Express 5 error middleware, runtime-config non-Error catch); Vitest coverage thresholds and excludes for `scripts/**/*.cjs` and `list-stored-media` re-export; removed unreachable duplicate check after `getSessionAuthError` on `POST /api/auth/session`.

### Fixed

- **Hosting 0.6.9** — Onboarding **check-username** sends a **Bearer ID token** so “your” slug is not reported taken when you already hold the claim or legacy profile username. See [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md).
- **Functions 0.25.7** — **check-username** treats a legacy **`users` doc username** as **available** when **`legacyUsernameOwnerUid`** matches the viewer (pre-onboarding users). See [functions/CHANGELOG.md](functions/CHANGELOG.md).
- **Hosting 0.6.8** — Onboarding loads/saves progress with a **Bearer Firebase ID token** so auth works when **`session` cookie verification fails** through Hosting; matches manual sync. See [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md).
- **Hosting 0.6.7** — Do not mirror the ID token to **`localStorage`** after a successful session; rely on the HttpOnly **`session`** cookie and **`apiSessionReady`** instead. **`localStorage`** remains only when session creation fails (Bearer fallback). See [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md).
- **Hosting 0.6.6** — Auth + onboarding: wait for **`apiSessionReady`** after `createSession` before calling protected APIs. Fixes **`No valid authorization header found`** on `GET /api/onboarding/progress`. See [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md).
- **Hosting 0.6.5** — `putJson` refreshes the CSRF token before each `PUT` so production no longer hits spurious **“CSRF token mismatch”** when saving onboarding (or other) state. See [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md).
- **Hosting 0.6.4** — Local builds and deploys now stamp the hosting bundle with the current git SHA and include that SHA in the Turbo cache key, preventing stale sidebar SHAs from reused `hosting/out` artifacts. See [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md).
- **Hosting 0.6.3** — Firebase Hosting `Cache-Control` headers for the static export (revalidate HTML/shell, immutable `/_next/static` chunks) to avoid stale shells and post-deploy `ChunkLoadError`. See [apps/console/CHANGELOG.md](apps/console/CHANGELOG.md).
- **Widget API (functions)** – Public `GET /api/widgets/:provider` responses no longer emit CSRF cookies, so Firebase Hosting / CDN can cache them per `Cache-Control` again. See [functions/CHANGELOG.md](functions/CHANGELOG.md) **0.22.17**.
- **Auth routes (functions)** – `POST /api/auth/session` and `POST /api/auth/logout` are now rate-limited so all authorization routes satisfy CodeQL; session allows 20 req/15 min, logout 30 req/15 min.

## [1.0.0] - 2025-02-14

### Added

- **pnpm workspaces** – Monorepo layout with `pnpm-workspace.yaml`; `apps/console` and `functions` are workspace packages. Single `pnpm install` at root installs all dependencies; lockfile is `pnpm-lock.yaml`.
- **Turborepo** – Task runner and caching for `build`, `dev`, `lint`, `test`, and `test:coverage`. Root scripts delegate to Turbo; only packages that define a script run it (e.g. only the console app has `build`).
- **Root scripts** – `pnpm run build`, `pnpm run dev`, `pnpm run lint`, `pnpm run test`, `pnpm run test:coverage`, plus `deploy:all`, `deploy:hosting`, `deploy:functions`.

### Changed

- **Package manager** – Switched from npm to pnpm (v9.15.0). Use `pnpm install` at root; do not run npm in `apps/console/` or `functions/`.
- **CI/CD** – All workflows use `pnpm/action-setup`, `cache: "pnpm"`, and `pnpm install --frozen-lockfile`. CI runs `pnpm run lint` and `pnpm run test:coverage`; deploy workflows run `pnpm run build`.
- **Lockfiles** – Removed `apps/console/package-lock.json` and `functions/package-lock.json` in favor of a single root `pnpm-lock.yaml`.

### Developer experience

- **`.turbo`** – Added to `.gitignore` (Turborepo local cache).
- **Node** – Engines remain `>=24`; CI uses Node 24.
