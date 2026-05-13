# Chronogrove functions (backend)

Provider-neutral backend for Chronogrove: an Express app that serves widget and auth endpoints, plus scheduled jobs that sync data from external APIs (Spotify, Steam, Goodreads, Instagram, Discogs, Flickr). Firebase remains the current runtime/auth/document reference provider.

## Directory layout

- **`lib/`** – Shared helpers and config: widget content getters, constants, exported-config mapping, utilities.
- **`api/`** – External API clients (Goodreads, Spotify, Steam, Discogs, Instagram, Flickr, Google Books, AI summary helpers, Cloud Storage).
- **`adapters/`** – Concrete implementations for backend seams such as document storage and media storage.
- **`bootstrap/`** – Provider selection and backend composition wiring.
- **`jobs/`** – Sync jobs (e.g. `sync-spotify-data`, `sync-goodreads-data`) and user lifecycle (create-user, delete-user).
- **`ports/`** – Provider-neutral interfaces for backend seams.
- **`transformers/`** – Data shaping for storage and widgets (e.g. Discogs releases, Instagram media).
- **`middleware/`** – Express middleware (e.g. rate limiter).
- **`selectors/`** – Config selectors.
- **`scripts/`** – Standalone scripts (e.g. env setup).
- **`queries/`** – GraphQL query files (e.g. GitHub widget).

Entry point is **`index.js`**: it composes the backend through the bootstrap layer, then registers the HTTP function, scheduled functions, and auth triggers on the selected runtime platform.

**Public widgets:** `GET /api/widgets/:provider` is unauthenticated and cache-friendly. Callers on a **shared** API host may pass **`?uid=`** or **`?username=`** to select the Firestore user; **dedicated** tenant API hostnames can map to a user via runtime config (**`WIDGET_USER_ID_BY_HOSTNAME`**). SSR status checks may send **`x-chronogrove-public-host`**. See the root [README](../README.md#api-surface-high-level) and [docs/APP_HOSTING.md](../docs/APP_HOSTING.md).

## Setup, run, deploy

- **Environment:** See [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) for `.env` (local) and production secret (`FUNCTIONS_CONFIG_EXPORT`).
- **Install, build, deploy:** Use the **repo root**. See the root [README](../README.md#monorepo) for all commands (`pnpm install`, `pnpm run build`, `pnpm run deploy:all`, etc.). Do not run `pnpm install` inside `functions/`; use the root.

## Tests and lint

From the **repo root**:

- **Tests (single run):** `pnpm run test`
- **Tests (watch):** `pnpm --filter chronogrove-functions run test:watch`
- **Tests (coverage):** `pnpm run test:coverage`
- **Lint:** `pnpm run lint`

### Vitest paths that touch disk

Avoid hardcoded **`/tmp/...`** in tests (predictable world-writable paths are security hotspots for static analysis). Prefer **`os.tmpdir()`** with **`path.join`** or **`fs.mkdtempSync`**, and remove created dirs in **`afterAll`** when tests write through **`LocalDiskMediaStore`** or similar. For **`vi.mock(…)`** factories that run before ESM imports finish initializing, build those paths inside **`vi.hoisted(() => { … })`** using **`require('node:path')`** / **`require('node:os')`** so Vitest hoisting does not hit temporal-dead-zone errors. Reuse **`syncJobDiskMediaTarget`** from **`jobs/test-support/sync-job-disk-media-target.ts`** for sync-job disk mocks.
