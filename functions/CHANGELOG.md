# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.31.1] - 2026-05-12

### Changed

- **Quality / maintainability** — Refactors driven by static analysis (Sonar): replace **`void`**-discarded promises with explicit promise handling in the operator console; improve accessibility (**`OverviewSection`** status dot uses **`<img alt>`**); **`Readonly`** component props where appropriate; tighten **Goodreads** / **Instagram** type unions; reorder widget **`get*WidgetContent(documentStore, userId?)`** signatures so default parameters are last; **`registerFirebaseHttpFunction`** handlers use Express **`Request` / `Response`** (removes redundant casts in **`index.ts`**); shared helpers for **Goodreads** sync retries and error formatting; **onboarding wizard** Firestore transaction split into smaller functions; **GitHub** credential refresh extracted; **DNS CNAME** / **rate limiter** / **local disk media** hardening and clearer error strings; **`formatUnknownFailureMessage`** uses a fixed label when **`JSON.stringify`** throws (circular structures).

### Tests

- **Unit coverage** — **`fetch-book`** (`maxRetries === 0`); **`buildReleaseFetchUrl`** missing API key; **`stringifyUnknown` / `rejectAsError`** (local disk); **`errorMessageFromUnknown` / `parseGotHttpErrorBody`** (Goodreads sync); **Steam** persist failure with a non-serializable rejection; **`formatUnknownFailureMessage`** circular-reference expectation updated.
- **Vitest coverage** — Project **line and statement coverage at 100%** with branch coverage above configured thresholds (Codecov **patch** target remains **99%**).

## [0.31.0] - 2026-05-11

### Added

- **Spotify + Discogs AI summaries** — On successful sync, **`generate-spotify-summary`** and **`generate-discogs-summary`** (Anthropic **`claude-sonnet-4-6`**, same JSON → HTML `<p>` contract as Goodreads/Steam) populate **`aiSummary`** on **`widget-content`** and save **`last-response_ai-summary`**. Spotify prompts use profile, metrics, **top tracks**, and playlist metadata; Discogs prompts use rollups (genres, styles, decades) plus the newest **72** releases (compact), derived from **`buildDiscogsSummaryInput`**.

### Tests

- **`generate-spotify-summary.test.ts`** / **`generate-discogs-summary.test.ts`** — Mirrors **`generate-steam-summary`**: API failures, unparseable assistant text (including **`head`** / **`tail`** logging), non-string **`response`**, and **`messageFromUnknownError`** branches; Discogs builder tests for large collections, invalid years/dates, and loose artist/format parsing.
- **`sync-spotify-data.test.ts`** / **`sync-discogs-data.test.ts`** — Sync **continues** when AI generation throws; progress phases include **`spotify.ai`** and **`discogs.ai`**.

## [0.30.10] - 2026-05-12

### Fixed

- **Goodreads + Google Books** — Title/author fallback volume search uses **`simplifyTitleForGoogleBooksQuery`** so Goodreads-style series/volume suffixes (e.g. `(The Book of Dust, #2)`) are stripped before building **`intitle:`** / **`inauthor:`** queries. The Books API often returns **400 Bad Request** for those characters in **`q`**, even when the web UI accepts the same title. Wired from **`fetch-recently-read-books`** and **`sync-goodreads-data`**.

### Tests

- **`simplify-title-for-google-books-query.test.ts`** — Parenthetical strip, **`#n`** suffix, length cap, whitespace.
- **`fetch-recently-read-books.test.ts`** / **`sync-goodreads-data.test.ts`** — Assert **`intitle:`** uses simplified titles and **`||`** fallback when simplification yields an empty string (Codecov patch coverage).

## [0.30.9] - 2026-05-11

### Changed

- **Goodreads / Steam AI summaries** — Prompts request **first person** (Chris Vogt’s voice, aligned with chrisvogt.me editorial tone) while keeping **two or three** `<p>` paragraphs and existing JSON / HTML constraints.
- **Steam AI summary** — When **`extractJsonFromAiResponse`** cannot parse the assistant reply, **`logger.error`** logs structured fields (**`charLength`**, **`trimmedLength`**, **`firstCurlyIndex`** / **`lastCurlyIndex`**, **`hasMarkdownFence`**, **`head`**, optional **`tail`** for long text) before throwing, to debug production-only parse failures.

### Tests

- **`generate-steam-summary.test.ts`** — Covers parse-failure log payload and **`tail`** when assistant text exceeds the head + tail threshold.

## [0.30.8] - 2026-05-11

### Changed

- **Spotify widget sync** — **`api/spotify/get-top-tracks`** passes **`limit: 24`** (was **12**) to **`GET me/top/tracks`** with **`time_range: short_term`**, so **`collections.topTracks`** can persist up to 24 tracks per successful sync (Spotify allows up to **50** per request). Unit test expectations and **`top-tracks.mock.json`** pagination metadata updated.

## [0.30.7] - 2026-05-10

### Fixed

- **Steam AI summary** — **`generate-steam-summary`** prompt requests only **`{ "response" }`** (no **`debug`** echo of game lists) so Anthropic completions fit the default **`max_tokens` (1024)** in production and no longer truncate to invalid JSON. **`functions/.env.template`** documents the real default for **`ANTHROPIC_MAX_OUTPUT_TOKENS`** (1024 unless overridden).
- **AI summaries** — **`extract-json-from-ai-response`** uses a greedy **` ```json `** fence capture (avoids truncating when the model echoes fence-like characters) and **`jsonrepair`** after strict **`JSON.parse`** so common LLM JSON defects in **`response`** HTML (unescaped quotes, raw newlines in strings) still parse. Steam and Goodreads prompts add explicit JSON string-safety rules.

### Security

- **CORS (`/api`)** — **`*.chrisvogt.me`** origins are still allowed for personal-site and tenant API hosts, but the **`metrics`** label on **`chrisvogt.me`** is excluded (sunset operator hostname). Allowlist logic lives in **`app/api-cors-allowlist.ts`** with unit tests; integration tests use **`https://console.chronogrove.com`** as a sample allowed Origin.

### Changed

- **Local emulators** — **`pnpm start`** in **`functions/`** runs **`prestart` → `build`** so **`lib/`** matches TypeScript before **`firebase emulators:start`**. Root **`pnpm run dev:full`** builds functions once before starting emulators. **`firebase emulators:start` alone** still does not compile; **`ENVIRONMENT_SETUP.md`** documents the stale-**`lib/`** pitfall.

### Removed

- **AI summaries** — Dropped **`logger.warn`** + model **`textPreview`** on JSON parse failure (avoid logging user-facing summary text to Cloud Logging; **`logger.error`** on the thrown error remains).

## [0.30.6] - 2026-05-09

### Fixed

- **AI summaries (Anthropic)** — **`extractJsonFromAiResponse`** parses the full markdown JSON fence so nested objects (e.g. Steam **`debug`**) no longer break extraction; the previous non-greedy inner-brace regex truncated valid model output. Added fallbacks: generic fenced blocks, whole-string JSON, and outermost JSON object extraction when the model adds a short preamble.

### Security

- **Auth logging** — Successful session and Bearer verification no longer log **`uid`**, **`email`**, or **`emailVerified`**. Bearer success logs **`path`** only; session/Bearer uid mismatch logs **`sessionUidPrefix`** / **`bearerUidPrefix`** (first 8 characters) instead of full UIDs.

### Changed

- **Dependencies** — **express-rate-limit** `^8.5.1`, **firebase** `^12.13.0`, **firebase-admin** `^13.9.0`, **got** `^15.0.5`, **@typescript-eslint/eslint-plugin** / **parser** `^8.59.2`, **firebase-functions-test** `^3.5.0`.
- **Workspace** — Root **turbo** `^2.9.12`; console **next** `16.2.6`, **react** / **react-dom** `^19.2.6`, **firebase** `^12.13.0`, **three** `^0.184.0`, **@types/three** `^0.184.1`.

### Tests

- **`extract-json-from-ai-response`** — Nested **`debug`** inside a markdown **`json`** code fence; JSON object after a short preamble.
- **`create-express-app.onboarding`** — Uid mismatch warning expects **`sessionUidPrefix`** / **`bearerUidPrefix`**.

## [0.30.5] - 2026-05-08

### Changed

- **AI summary provider** — Replaced the `@google/generative-ai` SDK (Gemini) with a direct HTTP client targeting the **Anthropic Messages API** (`/v1/messages`). All Gemini-specific env vars, config keys, and file names are renamed to provider-neutral equivalents:
  - `GEMINI_API_KEY` → **`ANTHROPIC_API_KEY`**; exported-config key `gemini.api_key` → **`anthropic.api_key`**
  - `getGeminiApiKey` → **`getAiSummaryApiKey`** in `config/backend-config.ts`
  - `api/gemini/generate-steam-summary.ts` → **`api/ai-summary/generate-steam-summary.ts`**
  - `utils/extract-json-from-gemini-response.ts` → **`utils/extract-json-from-ai-response.ts`**
- **`utils/ai-summary-messages.ts`** — New `requestAiSummaryCompletion` helper: single-turn user-message POST to Anthropic, `assistantTextFromResponseBody` parser, `resolveMaxTokens` for env-driven token cap. Default model **`claude-sonnet-4-6`**; default `max_tokens` **1024** (sufficient for 2–3 `<p>` paragraph outputs). Both are overridable via **`ANTHROPIC_MODEL`** and **`ANTHROPIC_MAX_OUTPUT_TOKENS`** env vars, or as explicit call params.
- **Error handling** — `generate-goodreads-summary.ts` and `generate-steam-summary.ts` now type `catch` blocks as `error: unknown` and guard with `instanceof Error` before reading `.message`.
- **Dependencies** — Removed `@google/generative-ai` (`^0.24.1`); no new prod dependencies (uses Node `fetch`).

### Tests

- **`utils/ai-summary-messages.test.ts`** — 23 new tests: happy path, multi-block join, non-text block skip, request shape (URL / headers / body), model and `maxTokens` defaults and overrides (including invalid env values), structured and unstructured HTTP error bodies, non-JSON responses, and empty / non-array / missing `content`.
- **`api/ai-summary/generate-steam-summary.test.ts`** — Moved from `api/gemini/`; mocks updated from SDK constructor to `globalThis.fetch`.
- **`api/goodreads/generate-goodreads-summary.test.ts`** — Mocks updated from SDK constructor to `globalThis.fetch`; `lastUserPrompt()` helper extracts the user message from fetch call args.

## [0.30.4] - 2026-05-03

### Security

- **Dependencies** — **@google-cloud/firestore** `^8.5.0`, **firebase** `^12.12.1`, **firebase-admin** `^13.8.0`, **firebase-functions** `^7.2.5`, **got** `^15.0.3`, **dotenv** `^17.4.2`, **express-rate-limit** `^8.4.1`, **Vitest** / **`@vitest/coverage-v8`** `^4.1.5`, **ESLint** `^10.3.0`, **typescript-eslint** `^8.59.1`, **globals** `^17.6.0`, **@types/node** `^24.12.2`; workspace **`vite`** override (root `pnpm.overrides`) for patched **8.0.5** used by Vitest.

## [0.30.3] - 2026-05-03

### Added

- **Goodreads widget** — Each **`collections.recentlyReadBooks`** entry now includes **`readAt`** (Goodreads shelf **`read_at`** text) for ordering and client display.

### Changed

- **Goodreads sync** — **`fetch-recently-read-books`** carries **`readAt`** through **`transformBookData`**; **`sortGoodreadsRecentlyReadBooksByReadAtDesc`** (**`utils/sort-goodreads-recently-read-books.ts`**) orders by parsed date so the **most recently read** titles appear first before **`GOODREADS_BOOKS_TO_DISPLAY`** is applied. The same sort runs when assembling widget **`collections`** in **`sync-goodreads-data`**.

### Tests

- **`sort-goodreads-recently-read-books`** — Sort key, descending order, missing **`readAt`** at end, non-mutating copy.
- **`fetch-recently-read-books`** — Assertions for **`readAt`** on shelf rows and newest-first order when two reviews resolve.
- **`sync-goodreads-data`** — Persisted **`recentlyReadBooks`** order matches **`readAt`** descending when the fetch mock returns rows out of chronological order.

## [0.30.2] - 2026-04-10

### Changed

- **Authentication** — **`resolveSessionAndBearerClaims`** centralizes session-cookie and Bearer verification, uid-mismatch detection, warning log, and **`session`** cookie clearing; **`resolveChosenAuthClaims`** and **`resolveViewerUidForPublicOnboarding`** only apply their distinct post-processing (full **`AuthClaims`** vs allowlist-gated **`uid`**). Optional verbose verify logging remains for the authenticated API path only.

### Tests

- **`create-express-app`** — Coverage for mismatch branches (verified vs unverified Bearer after uid mismatch), **`authenticateUser`** outer **`catch`** ( **`email`** getter throws only after verbose logging reads it once), silent session-cookie verification failure on **`check-username`**, and onboarding mocks use **`emailVerified`** (Firebase **`AuthClaims`** shape).

## [0.30.1] - 2026-04-10

### Added

- **`POST /api/auth/clear-session-cookie`** — Clears the HttpOnly **`session`** cookie without Firebase sign-out (CSRF-protected; rate limited). Used when switching accounts so a previous login’s cookie cannot override the current Firebase user.

### Changed

- **Authentication** — **`authenticateUser`** resolves identity from both the **`session`** cookie and **`Authorization: Bearer`** (Firebase ID token). When both verify but refer to **different** users, the **Bearer** identity wins and the stale **`session`** cookie is cleared. **401** responses distinguish a present-but-invalid Bearer (**`Invalid or expired JWT token`**) from missing credentials (**`No valid authorization header found`**).
- **Public onboarding / widgets** — **`resolveViewerUidForPublicOnboarding`** again applies the allowlisted-email + verification gate to the session identity before the Bearer fallback (same-uid / different-claim edge cases), while still clearing the session cookie on uid mismatch.

### Removed

- **Tests** — Removed two brittle **`authenticateUser` “outer catch”** cases superseded by the refactored session/Bearer resolution.

## [0.30.0] - 2026-04-08

### Added

- **`GET /api/widgets/:provider`** — Optional query **`uid`** (Firebase user id) or **`username`** (public slug, `tenant_usernames` + legacy username lookup) selects the data owner before hostname resolution. Unknown slug / invalid **`uid`** → **404** (`Unknown user.`). Resolver in **`app/resolve-widget-data-user-id.ts`** with tests.

### Changed

- **Default widget hostname map** — Removed hard-coded **`api.chronogrove.com` → `chronogrove`** from **`DEFAULT_WIDGET_HOSTNAME_USER_MAP`** so the shared API host uses **`WIDGET_USER_ID_BY_HOSTNAME`** / query overrides / default user only.

## [0.29.2] - 2026-04-04

### Changed

- **`GET /api/onboarding/check-domain`** — Verifies a **CNAME** chain to a configurable target (`ONBOARDING_REQUIRED_CNAME_TARGET`, default **`personal-stats-chrisvogt.web.app`**) instead of hardcoded Fastly **A** records. Response field **`requiredRecords`** is replaced by **`requiredCname`**.

### Added

- **`utils/dns-cname-verify.ts`** — **`hostnameCnameChainsTo`** (CNAME chain walk for DNS verification). Unit tests in **`dns-cname-verify.test.ts`**.

## [0.29.1] - 2026-04-04

### Security

- **got** — Upgraded to **15.x** (addresses known vulnerabilities in older majors). Removed **graphql-got** (it pinned an outdated **got**); GitHub GraphQL uses **`got.post`** with standard **`{ data, errors }`** handling in **`get-github-widget-content`**.

### Tests

- **get-github-widget-content** — GraphQL **`errors`**, missing **`data`**, and empty error-message fallback.

## [0.29.0] - 2026-04-03

### Added

- **`tenant_hosts/{hostname}`** — On **`PUT /api/onboarding/progress`**, a non-empty **`customDomain`** claims **`tenant_hosts`** with **`{ uid, claimedAt }`** (transactional; **`hostname_taken`** → **409**). Changing or clearing the domain releases the prior doc when still owned by the same uid. **`users.{uid}.tenantHostname`** stores the canonical hostname for fast reads.
- **`readStoredTenantHostnameFromUserDoc`** — **`utils/read-stored-tenant-hostname.ts`** (priority: **`tenantHostname`**, then legacy **`onboardingProgress.customDomain`**); used by onboarding persistence and account delete.
- **`PUT /api/onboarding/progress`** — **`403`** when **`entitlements.customDomain === false`** and the body sets a domain (**`custom_domain_not_entitled`**).

### Changed

- **Onboarding Firestore shape** — Wizard **`onboarding`** map no longer stores **`draftCustomDomain`**; each save merges **`draftCustomDomain: FieldValue.delete()`** to drop legacy fields. API **`customDomain`** in **`GET`** payloads is derived from **`tenantHostname`** first (then legacy blob).
- **`persistOnboardingWizardState`** — Hostname claims mirror username-claim patterns; **`create-user`** defaults **`entitlements.customDomain`** to **`true`** for new users.
- **`delete-user`** — Removes **`tenant_hosts/{hostname}`** when the stored claim’s **`uid`** matches the deleted account (warns and continues on failure).

### Tests

- **`onboarding-wizard-persistence`**, **`delete-user`**, **`read-stored-tenant-hostname`**, **`create-express-app.onboarding`** — Hostname entitlement and conflict paths.

## [0.28.0] - 2026-04-03

### Added

- **GitHub App OAuth 2.0** — `POST /api/oauth/github/start`, `GET /api/oauth/github/callback`, `DELETE /api/oauth/github`. Pending bridge **`oauth_github_pending/{state}`**. Config: **`GITHUB_APP_CLIENT_ID`**, **`GITHUB_APP_CLIENT_SECRET`**, **`GITHUB_OAUTH_CALLBACK_URL`**, optional **`GITHUB_OAUTH_SUCCESS_REDIRECT`** (see **`.env.template`** and **`exported-config`**).
- **`github-oauth2`** — Authorization URL builder, authorization-code exchange, refresh grant, **`GET /api/user`** for GitHub login after connect.
- **`github-integration-credentials`** — **`loadGitHubAuthForUser`** with optional access-token refresh when **`mergeDocument`** is available.
- **`GET /api/widgets/github`** — Response may include **`githubAuthMode`** (`oauth` \| `env`) for operator tooling. Public **`payload`** shape unchanged; extra field is additive.
- **Tests** — **`oauth-github.test.ts`**, **`github-integration-credentials.test.ts`**, **`github-oauth2`** coverage via integration paths; index test for **`githubAuthMode`** on widget JSON.

### Changed

- **`get-github-widget-content`** — Resolves tokens via **`loadGitHubAuthForUser`** (Firebase uid from **`integrationLookupUserId`** or hostname storage id), then env PAT fallback; returns **`{ payload, authMode }`**.
- **`getWidgetContent`** — Returns **`WidgetFetchResult`** (`payload` + optional **`meta.githubAuthMode`** for GitHub only).
- **`GET /api/widgets/:provider`** — Uses **`resolveViewerUidForPublicOnboarding`** (session cookie or Bearer) and passes **`integrationLookupUserId`** into widget load so signed-in operators hit **`users/{uid}/integrations/github`**.
- **`withGitHubOAuthFlash`** — Query params for **`?oauth=github`** onboarding redirects.

## [0.27.0] - 2026-04-03

### Added

- **Discogs OAuth 1.0a** — `POST /api/oauth/discogs/start`, `GET /api/oauth/discogs/callback`, `DELETE /api/oauth/discogs`. Pending bridge collection **`oauth_discogs_pending/{requestToken}`** (server-only). **`DISCOGS_CONSUMER_KEY`**, **`DISCOGS_CONSUMER_SECRET`**, **`DISCOGS_OAUTH_CALLBACK_URL`**, optional **`DISCOGS_OAUTH_SUCCESS_REDIRECT`** (see **`.env.template`** and **`exported-config`**).
- **`discogs-oauth1a`** — PLAINTEXT token exchange per Discogs docs; **HMAC-SHA1** signed API GETs; **`/oauth/identity`** after access token for username.
- **Sync** — **`discogsAuthMode`** (`env` \| `oauth`) on successful Discogs sync jobs (manual queue worker), same pattern as Flickr.

### Changed

- **`fetchDiscogsReleases` / `fetchReleaseDetails` / batch** — Accept per-user OAuth auth when present; legacy **`DISCOGS_API_KEY`** + **`DISCOGS_USERNAME`** unchanged.
- **`sync-discogs-data`** — Loads **`integrations/discogs`** via **`loadDiscogsAuthForUser`**; profile URL uses linked username when OAuth is active.
- **CSRF** — **`/api/oauth/discogs/callback`** excluded from CSRF (GET redirect).
- **Tests** — **`oauth-discogs.test.ts`**, **`discogs-oauth1a.test`**, **`discogs-integration-credentials.test`**, OAuth branches for Discogs fetch helpers; **`oauth-discogs.helpers`** for redirect resolution.

## [0.26.0] - 2026-04-03

### Added

- **Flickr OAuth 1.0a** — `POST /api/oauth/flickr/start` (session + Bearer), `GET /api/oauth/flickr/callback` (Flickr redirect; rate-limited), `DELETE /api/oauth/flickr` to cancel or disconnect. Short-lived pending bridge docs under `oauth_flickr_pending/{requestToken}` (**Admin SDK** only; Firestore rules **deny** client SDK access). User tokens stored with **`encryptJsonEnvelope`** and **`INTEGRATION_TOKEN_MASTER_KEY`** (see `.env.template` and runtime config).
- **`fetchPhotos({ oauth })`** — OAuth-signed `flickr.people.getPhotos` when a resolved per-user auth payload is passed; legacy **API key + `FLICKR_USER_ID`** path unchanged. Shared HTTP timeout (**`FLICKR_HTTP_TIMEOUT_MS`**); Flickr **`stat: fail`** surfaced as errors for both paths.
- **Configuration** — **`FLICKR_API_SECRET`**, **`FLICKR_OAUTH_CALLBACK_URL`**, optional **`FLICKR_OAUTH_SUCCESS_REDIRECT`**, **`PUBLIC_APP_ORIGIN`**, and **`INTEGRATION_TOKEN_MASTER_KEY`** documented in **`.env.template`**.

### Changed

- **`PUT /api/onboarding/progress`** — Response **`payload`** is the same normalized progress as **`GET`** (**`loadOnboardingStateForApi`**) so clients immediately see fields such as **`integrationStatuses`** (for example **`pending_oauth`**) after save.
- **Rate limiting** — Handlers apply **`rateLimit()` from `express-rate-limit`** at route registration (not a small wrapper) so **CodeQL `js/missing-rate-limiting`** recognizes guards. **`GET /api/widgets/:provider`** is rate-limited.
- **CSRF** — **`/api/oauth/flickr/callback`** added to the CSRF exclude list so Flickr’s GET redirect succeeds without an XSRF header.

### Security

- **OAuth callback** — Callback query parsed only for **`oauth_token`** / **`oauth_verifier`** via **`readFlickrOAuthCallbackQuery`**; avoids logging OAuth material.
- **Express 5** — **`GET /api/widgets/:provider`** normalizes **`req.params.provider`** from **`string | string[]`** before use.

## [0.25.9] - 2026-03-31

### Changed

- **Dependencies** — Non-major bumps only: **firebase** ^12.11.0, **express-rate-limit** ^8.3.2, **eslint** ^10.1.0, **typescript-eslint** ^8.58.0, **Vitest** / **@vitest/coverage-v8** ^4.1.2, **@types/node** ^24.12.0 (workspace **pnpm-lock.yaml**).

## [0.25.8] - 2026-04-02

### Security

- **Firestore rules** — Default **deny all** client SDK reads and writes. Explicit backend-only matches for `tenant_usernames`, `tenant_hosts`, and `users/{uid}/integrations/{integrationId}`; public widget data is served only via the **`app`** Cloud Function (Admin SDK), not from the browser.
- **Onboarding `GET /api/onboarding/check-username` and `check-domain`** — Stricter per-window rate limits; custom **429** handler logs `rate_limit_exceeded` with a label for monitoring. **`check-domain`** JSON no longer includes **`resolvedRecords`**. Error logs avoid raw **username** / **domain** values (length only).

### Developer experience

- **`getClientAuthConfig`** — JSDoc: only web-safe fields belong in the payload returned by **`/api/client-auth-config`** / **`/api/firebase-config`**.
- **`ALLOWED_EMAIL_DOMAINS`** — Comment reminder to revisit allowlist, MFA, and Firebase Auth settings before a general-audience launch.
- **`future-tenant-collections.ts`** — Rollout note aligned with default-deny rules and post-OAuth HTTPS APIs.

### Repository

- **Dependabot** — Weekly **`npm`** updates at repository root for the **pnpm** workspace lockfile (see root `.github/dependabot.yml`).

## [0.25.7] - 2026-04-01

### Fixed

- **Onboarding `GET /api/onboarding/check-username`** — Legacy users with **`username` on their `users/{uid}` doc** but **no `tenant_usernames` claim** were blocked as “taken” when re-running onboarding. The handler now resolves **`legacyUsernameOwnerUid`** and returns **available** when the signed-in user owns that document (same as an owned tenant claim). `FirestoreDocumentStore.legacyUsernameClaimed` delegates to **`legacyUsernameOwnerUid`** to avoid duplicate queries.

## [0.25.6] - 2026-03-31

### Changed

- **Widget API caching** — `GET /api/widgets/:provider` now uses revalidation-first caching (`max-age=0, must-revalidate`) with short shared-cache freshness (`s-maxage=300`, `stale-while-revalidate=60`) so synced widget data is refreshed quickly across providers without long-lived stale responses.

## [0.25.5] - 2026-03-30

### Changed

- **Spotify HTTP client** — Replaced `requestretry` calls in Spotify profile/top-tracks reads with the existing `got` stack and centralized shared Spotify retry/JSON defaults in `api/spotify/spotify-client.ts`.

### Developer experience

- **Dependency cleanup** — Removed `requestretry` from runtime dependencies and its local module declaration.
- **Tests** — Added `spotify-client.test.ts` for shared got client configuration and updated Spotify API unit tests to mock the centralized client.

## [0.25.4] - 2026-03-30

### Changed

- **Goodreads widget** — `GOODREADS_BOOKS_TO_FETCH` is **35** (30 displayed titles plus a **five-book** buffer) so ISBN/Google Books misses do not routinely leave the widget short of 30 books. Relationship documented in `goodreads-config.ts`.

### Developer experience

- **Tests** — `goodreads-config.test.ts` asserts fetch vs display and AI shelf caps; `fetch-recently-read-books.test.ts` expects Goodreads `per_page=35`.

## [0.25.3] - 2026-03-29

### Fixed

- **Firebase deploy warning** — Functions no longer call `STORAGE_FIRESTORE_DATABASE_URL.value()` while the deploy tooling is discovering exports. `index.ts` now lazily creates the backend bootstrap and Express app on first invocation, so Firebase Admin init and param reads happen at runtime instead of module-load time.

### Developer experience

- **Tests** — Updated `index.test.ts` to assert lazy Firebase Admin initialization on first request and kept the HTTP wrapper coverage aligned with the new bootstrap timing.

## [0.25.2] - 2026-03-28

### Changed

- **Goodreads AI summary** – The LLM prompt asks for **two or three** `<p>` paragraphs (replacing “exactly two”). `normalizeParagraphSummary` keeps **all** returned `<p>` blocks; the homepage UI collapses extra paragraphs behind “Read more,” so the backend no longer truncates a third paragraph.

### Developer experience

- **Tests** – `generate-goodreads-summary` asserts full multi-paragraph HTML and updated prompt copy.

## [0.25.1] - 2026-03-28

### Fixed

- **CORS** – Apply `cors` once for all `/api` routes **before** CSRF so **OPTIONS** preflight succeeds. Cross-origin `fetch` to `*.cloudfunctions.net` with `Authorization` (manual sync SSE from Firebase Hosting) only runs `cors()` on `app.get()`, so preflight previously missed CORS and the browser blocked the stream.

### Developer experience

- **Tests** – Supertest `OPTIONS` preflight for `GET /api/widgets/sync/:provider/stream`.

## [0.25.0] - 2026-03-27

### Added

- **Manual sync SSE** – Authenticated `GET /api/widgets/sync/:provider/stream` returns **`text/event-stream`** (`progress`, then `done` or `error`) using the same enqueue → claim → inline `processSyncJob` path as the JSON route.
- **Progress hooks** – `SyncProgressReporter` / optional `onProgress` on `SyncJobExecutionOptions`; sync jobs for Spotify, Steam, Goodreads, Instagram, Discogs, and Flickr emit step updates for the stream.

### Changed

- **Compression** – `compression` middleware skips widget sync paths ending in **`/stream`** so SSE is not buffered.
- **Discogs** – `fetch-releases-batch` accepts `onProgress` and reports batch-level progress for richer SSE updates.

### Developer experience

- **Tests** – Route coverage for SSE manual sync (`create-express-app.route-coverage.test.ts`).

## [0.24.0] - 2026-03-26

### Added

- **Goodreads AI reading context** – Paginated fetch of the full “read” shelf from Goodreads XML only (`fetch-full-read-shelf-for-ai`), passed into the AI summary step without enriching extra titles via Google Books or cover downloads. Widget `recentlyReadBooks` and display pipeline are unchanged.
- **Config** – `GOODREADS_AI_READ_SHELF_PER_PAGE` (200) and `GOODREADS_AI_READ_SHELF_MAX_PAGES` (10) in `goodreads-config.ts`.

### Changed

- **Goodreads AI summary prompt** – Homepage-oriented copy for chrisvogt.me: exactly **two** third-person `<p>` blocks; uses `completeReadShelf` plus `recentlyReadBooksForWidget` in the prompt. `ensureTwoParagraphSummary` keeps the first two paragraphs if the model returns more.
- **Sync resilience** – If full-shelf pagination throws, the job logs a warning and the summary still runs using widget books only.

### Developer experience

- **Tests** – Coverage for shelf parsing edge cases, summary fallbacks, and `sync-goodreads-data` branches (mixed CDN vs fetch, non-`Error` rejections, staggered fetches).

## [0.23.0] - 2026-03-21

### BREAKING

- **Manual widget sync HTTP response** – `GET /api/widgets/sync/:provider` no longer returns `{ result, provider }`. It now returns a queue-backed payload (`enqueue`, `beforeJob`, `afterJob`, `worker`) from `runSyncForProvider`. Clients must parse the new shape.
- **Instagram configuration** – `INSTAGRAM_USER_ID` is required (see `.env.template`). `fetchInstagramMedia` throws if it is missing. Instagram Graph calls use separate profile and media requests (`v25.0`), merged into the previous top-level response shape with a `media` field.

### Added

- **Firestore sync job queue** – Widget syncs are enqueued in the `sync_jobs` collection (`FirestoreSyncJobQueue`), claimed by a scheduled worker (`runSyncWorker`, every 15 minutes), and planned by `runSyncPlanner` (daily). Manual sync enqueues then claims the same job id and runs inline so the HTTP response includes queue state. See [docs/SYNC_JOB_QUEUE.md](../docs/SYNC_JOB_QUEUE.md).
- **Queue port and types** – `SyncJobQueue` (`ports/sync-job-queue.ts`), pipeline types (`types/sync-pipeline.ts`), and adapter tests (`adapters/sync/firestore-sync-job-queue.test.ts`).

### Changed

- **Sync queue metrics** – Optional **`metrics`** on successful `SyncJobResult` (`types/sync-job.ts`) are merged into the Firestore job **`summary`** by `processSyncJob` (`services/sync-worker.ts`). Provider jobs own the numbers (e.g. Steam’s `ownedGamesCount` / `recentlyPlayedGamesCount` from `sync-steam-data.ts`); the worker does not parse provider-specific `data` for metrics.
- **Instagram Graph fetch** – Uses `prefixUrl` and `searchParams` for `got` instead of embedding the access token in a URL string literal. Caps top-level media at 24 items via a dedicated `{userId}/media` request.
- **Build output** – `functions/lib/` is gitignored; compile with `pnpm run build` before deploy (aligned with the existing TypeScript layout).

### Fixed

- **Goodreads sync optimization** – Previously fetched 100 books from Goodreads, then called Google Books API and downloaded thumbnails for all of them, but only stored 18. Now fetches 30 books (per_page), processes only those 30 (early slice before pMap), and stores 24 for display. Reduces Google Books API usage and rate limiting. See [#175](https://github.com/chrisvogt/chronogrove/issues/175).

## [0.22.18] - 2026-03-19

### Fixed

- **GCS bucket config timing** – `GcsMediaStore` previously read `CLOUD_STORAGE_IMAGES_BUCKET` from constants at module load time, before `FUNCTIONS_CONFIG_EXPORT` was applied. In production, the bucket was always undefined, causing "Bucket name not specified or invalid" on sync jobs. Now reads from `getStorageConfig()` at runtime (after the secret is loaded). If the bucket is still missing, throws a clearer error pointing to the secret. See [#177](https://github.com/chrisvogt/chronogrove/issues/177).

## [0.22.17] - 2026-03-19

### Fixed

- **Widget GET CDN caching** – Global `lusca` CSRF was calling `setToken` on every request, so `GET /api/widgets/:provider` responses included `Set-Cookie` (`_csrfSecret`, `XSRF-TOKEN`). Shared caches then refused to store them (`x-cache: MISS`) despite `Cache-Control: public, s-maxage`. Public widget reads are now excluded from CSRF (exact `/api/widgets/<id>` for each `widgetId`); `/api/widgets/sync/*` is unchanged. Tests assert no `set-cookie` on successful widget reads.

## [0.22.16] - 2026-03-18

### Changed
- **Shared Goodreads XML parsing utility** – Extracted common xml2js text-node extraction into `utils/goodreads-xml.ts` and reused it across Goodreads recently-read and sync flows to reduce duplicated parsing logic.
- **CI strict typecheck** – CI now runs `pnpm run typecheck` (strict core) so Goodreads shape/type issues are caught earlier.

## [0.22.15] - 2026-03-17

### Fixed

- **Functions deploy config isolation** – Local development now prefers `functions/.env.local`, deploys fail fast when `functions/.env` is present, and direct Firebase CLI deploys run the same guard during predeploy so local disk-backed settings do not leak into production runtime config.
- **Node 24 runtime startup** – Moved `dotenv` into runtime dependencies so newly deployed Cloud Functions revisions can import the shared config bootstrap successfully during startup.

### Developer experience

- **Firebase param handoff** – Documented the split between local-only env files, Firebase deploy-time parameter files, and the `FUNCTIONS_CONFIG_EXPORT` Secret Manager payload so local disk storage remains available without interfering with production Firestore/GCS deploys.

## [0.22.14] - 2026-03-15

### Developer experience

- **Service-boundary integration coverage** – Added focused seam tests for default `FirestoreDocumentStore` wiring in the Flickr sync wrapper and Spotify widget reader, so the provider-neutral service boundaries are protected without depending on broad runtime-level tests.

## [0.22.13] - 2026-03-15

### Changed

- **Provider-neutral auth boundary** – Auth and session operations now flow through a dedicated `AuthService` port instead of calling Firebase Admin Auth directly from the Express app, keeping non-auth app logic isolated from the Firebase-specific implementation.
- **Firebase auth adapter** – Added a Firebase-backed auth adapter that owns session-cookie verification, ID-token verification, session creation, user lookup, logout token revocation, and auth-user deletion behind a single provider-specific implementation.

### Developer experience

- **Focused auth-boundary coverage** – Added adapter-level tests for the Firebase auth mapping layer and updated app tests to mock the provider-neutral auth boundary directly, making the migration seam easier to evolve safely.

### Changed

- **Source layout (config / widgets / utils / helpers)** – Source that lived under `lib/` has been moved into role-based directories so that `lib/` is build output only and can be fully gitignored:
  - **config/** – `constants.ts`, `exported-config.ts` (and tests)
  - **widgets/** – `get-widget-content.ts`, all provider-specific widget getters, `queries/github-widget-content.gql`, and widget tests
  - **utils/** – `extract-json-from-ai-response.ts` (and test; previously named for an older provider)
  - **helpers/** – `get-user-status.ts`, `get-review.ts` (and get-user-status test)
  - **lib/** – Now contains only `tsc` output; added to `.gitignore`. Run `pnpm run build` before deploy.
  - Imports updated across `index`, `api/`, `jobs/`, `transformers/`, and tests. README and ENVIRONMENT_SETUP.md now reference `config/exported-config.ts`.
- **Dependency upgrades** – Bumped to latest majors: ESLint 10, Vitest 4, dotenv 17, globals 17, requestretry 8. Adjusted for ESLint 10 (preserve-caught-error, no-unassigned-vars), Vitest 4 constructor mocks (use `function` not arrow in mocks), and sync-spotify-data `uploadResult` scope.
- **Dependency updates** – axios 1.13.6, express-rate-limit 8.3.0 (IPv6 subnet grouping; no API changes), firebase 12.10.0, firebase-admin 13.7.0, firebase-functions 7.1.0, eslint 10.0.3, globals 17.4.0. @types/node kept at ^24 for Node 24.
- **Dependency cleanup** – Replaced deprecated packages: `lodash.get` → `lodash/get` (same API); Spotify token refresh now uses `got` instead of `request-promise` (and removed direct `request` / `request-promise` deps). No behavior change.

### Fixed

- **Auth routes** – `POST /api/auth/session` and `POST /api/auth/logout` now use the rate limiter (20 and 30 requests per 15 minutes respectively) so every route that performs authorization is rate-limited (CodeQL compliance).

## [0.22.12] - 2026-03-15

### Changed

- **Provider-neutral media service boundary** – Media-heavy sync flows now call a shared media service layer instead of importing GCP-named helper modules directly, keeping provider logic independent from the underlying blob storage implementation.
- **Provider-neutral public media config** – Added `MEDIA_PUBLIC_BASE_URL` as the preferred environment setting for generated media URLs while preserving `IMAGE_CDN_BASE_URL` as a compatibility alias for existing deployments.
- **Explicit backend selection** – Media store resolution now fails fast for unsupported backends instead of silently falling back to GCS, which makes future container- or S3-backed experiments safer.

### Developer experience

- **Disk-backed deployment docs** – Updated the env template and setup docs to document the disk-backed media path used for local or container-hosted deployments.
- **Focused media boundary coverage** – Refreshed sync-job, transformer, config, and Goodreads media tests around the new media service seam to keep the refactor well-covered.

## [0.22.11] - 2026-03-15

### Changed

- **Backend document writes on `DocumentStore`** – User creation/deletion flows plus the Discogs, Goodreads, Instagram, Spotify, and Steam sync jobs now persist through the shared `DocumentStore` boundary instead of calling Firestore directly.
- **Consistent document paths** – Remaining backend write paths now save user documents, raw provider responses, widget payloads, and generated summaries through the same provider-neutral path contract used by widget reads.

### Developer experience

- **Backend job coverage** – Reworked account-flow and sync-job tests to inject `DocumentStore` directly, and added focused Spotify and Steam sync coverage to keep the storage seam well-tested during the migration.

## [0.22.10] - 2026-03-15

### Changed

- **Widget reads on `DocumentStore`** – Discogs, Instagram, Spotify, and Steam widget readers now load their `widget-content` documents through the shared `DocumentStore` boundary instead of reaching into Firestore directly.
- **Consistent widget paths** – Provider widget reads now use the shared widget document path helpers so public widget loading follows the same provider-neutral storage contract across all supported providers.

### Developer experience

- **Widget reader coverage** – Replaced Firestore-specific widget reader tests with `DocumentStore`-backed coverage and added a dedicated Steam widget reader test to keep the provider read seam well-covered during the migration.

## [0.22.9] - 2026-03-15

### Added

- **CSRF protection** – Added cookie-backed CSRF protection to the functions app using `lusca`, plus a small `/api/csrf-token` helper endpoint so the hosting admin can fetch a token before state-changing requests.

### Changed

- **Admin client auth flow** – The hosting API client now fetches and forwards `X-XSRF-TOKEN` on session creation and logout calls, and the API testing screen now uses that same client path.
- **Protected route handling** – State-changing auth routes now return structured `403` JSON errors when the CSRF token is missing or invalid instead of falling through to generic error handling.

### Developer experience

- **Coverage and tests** – Updated route tests to exercise the CSRF-protected flows and kept the full `functions` suite green after the security hardening.

## [0.22.8] - 2026-03-15

### Added

- **Firebase runtime wrappers** – Added dedicated runtime adapters for Firebase Admin initialization and Firebase Functions registration so admin bootstrap, emulator wiring, and trigger registration are owned outside the service entrypoint.
- **App factory seam** – Added `app/create-express-app.ts` so the API surface can be composed from injected runtime dependencies instead of being defined inline in the Firebase bootstrap file.

### Changed

- **Thin entrypoint** – `index.ts` now acts as a composition layer that wires together runtime config, Firebase runtime adapters, the shared document store, and the Express app factory.
- **Trigger registration** – Scheduled jobs, the HTTP app wrapper, and the before-user-created trigger now register through shared Firebase runtime helpers instead of calling Firebase Functions APIs directly in the entrypoint.

### Developer experience

- **Runtime coverage** – Added focused tests for Firebase admin bootstrap and Firebase Functions registration wrappers while keeping the full `index` and `functions` suites green after the extraction.

## [0.22.7] - 2026-03-15

### Added

- **Runtime config boundary** – Added a provider-neutral runtime config loader in `config/runtime-config.ts` plus focused tests so runtime env/bootstrap behavior is owned by a dedicated seam instead of being embedded directly in the Firebase entrypoint.
- **Firebase runtime adapters** – Added Firebase-specific runtime adapters for exported config loading, Firestore database URL resolution, and emulator wiring under `runtime/` so platform-specific config concerns are isolated from the service layer.

### Changed

- **Entrypoint config loading** – `index.ts` now consumes the runtime config boundary and Firebase adapter modules instead of importing Firebase params and exported-config helpers directly.

### Developer experience

- **Test noise** – Tightened index and sync-job tests to mock logger/console output more explicitly and added direct emulator helper coverage so Firebase-flavored bootstrap behavior is easier to reason about in unit tests.

## [0.22.6] - 2026-03-15

### Added

- **Backend path config overrides** – Added `DEFAULT_WIDGET_USER_ID` and `WIDGET_USER_ID_BY_HOSTNAME` support so the default widget user and hostname-to-user routing can be configured without code changes.

### Changed

- **Provider path resolution** – Replaced precomputed per-user collection and media path constants with runtime path builders so sync jobs, widget reads, and media destination helpers no longer treat one hardcoded username as a structural constant.
- **Provider sync persistence** – Discogs, Goodreads, Instagram, Spotify, Steam, and Flickr persistence paths now resolve through the shared backend path layer, preserving existing document layouts while making alternate deployments easier to configure.

### Developer experience

- **Coverage** – Added focused config/path override tests and updated transformer/widget coverage around the new runtime path resolution.

## [0.22.5] - 2026-03-15

### Added

- **Backend path helpers** – Added explicit user/provider path builders for Firestore collection paths, media prefixes, and widget host-to-user resolution so backend path generation is owned by a dedicated layer instead of scattered string literals.

### Changed

- **Path constants** – Reworked backend collection/media constants to derive from the shared path helpers while preserving the current `chrisvogt` and `chronogrove` behavior.
- **Widget reads** – Flickr and Goodreads widget readers now respect the passed `userId` when building widget-content document paths instead of implicitly reading from the default hardcoded user path.

### Developer experience

- **Coverage** – Added focused tests for the new backend path helpers and updated widget/helper coverage for user-aware widget document paths.

## [0.22.4] - 2026-03-14

### Added

- **Media storage seam** – Added a provider-neutral `MediaStore` abstraction with GCS and local-disk adapters so media-heavy sync flows can switch storage backends without changing provider logic.
- **Local media serving** – Added a local `/api/media/*` route for development so disk-backed uploads can be viewed through the same API surface used by widget media URLs.

### Changed

- **Media upload/list helpers** – Switched the shared cloud-storage helpers to delegate through the new media storage selector, preserving current GCS behavior in production while defaulting to disk in local development.
- **Runtime config mapping** – Added `MEDIA_STORE_BACKEND` and `LOCAL_MEDIA_ROOT` support to exported-config/env setup so storage backend selection is environment-driven.

### Fixed

- **Local dotenv loading** – Functions now load `functions/.env` synchronously from a stable path in development so browser-triggered emulator requests use the same local storage/media settings consistently.

### Developer experience

- **Coverage** – Added focused adapter, selector, helper, and sync-job coverage for the new media storage seam and local-disk flow.

## [0.22.3] - 2026-03-14

### Changed

- **Widget read seam** – Moved Flickr and Goodreads widget document reads onto the `DocumentStore` boundary while keeping the existing Firestore document layout and API payload shapes unchanged.
- **Widget loading path** – `getWidgetContent` now accepts an injected `DocumentStore` so the widget API route can pass the shared storage adapter through the read path instead of instantiating Firestore-specific readers.

### Fixed

- **Timestamp normalization** – Centralized widget read-side timestamp conversion for `meta.synced` values so Firestore timestamp-like objects and `toDate()` wrappers are handled consistently at the read boundary.

### Developer experience

- **Coverage** – Added focused tests for `DocumentStore`-backed widget readers and the shared widget document-store helper to keep the backend decoupling seam well covered.

## [0.22.2] - 2026-03-07

### Security

- **CORS** – Removed temporary domain `8ms.4a9.mytemp.website` from the production CORS allowlist. Unit test for that origin removed.

### Changed

- **Hosting (sign-in page)** – Clarified that the app is a personal admin, not a general login service:
  - Added line under “Sign in”: “Personal admin for the operator console / chrisvogt.me only.”
  - Added “← Part of chrisvogt.me” link to chrisvogt.me above the sign-in card.
  - Added meta description and Open Graph tags in `index.html`: “Personal Metrics API admin for chrisvogt.me. Not a general login service.”

## [0.22.1] - 2026-03-06

### Fixed

- **Build** – Copy `queries/` (e.g. `github-widget-content.gql`) into `lib/queries/` during build so the GitHub widget loader finds the file at runtime in emulator and production.

## [0.22.0] - 2025-02-14

### Added

- **Goodreads recently-read fallback** – When Google Books returns no result for an ISBN, the recently-read flow now tries a title/author search (same behavior as profile updates), so more books are recovered (e.g. *Culture of Desire*, *Purposeful*, *Outliers*). Title and author are read from the Goodreads review list XML.

### Changed

- **Google Books “not found” logging** – A missing ISBN result is now logged at **info** (“No result from Google Books for ISBN: …; title/author fallback may be used.”) instead of an error. A **warning** is logged only when a book is not found by either ISBN or the title/author fallback.

## [0.21.0] - 2025-02-14

### Added

- **React hosting app** – The metrics dashboard is now a Vite + React app in `hosting/`:
  - Sign-in (Google, email/password, phone) and API testing UI
  - Two pages when signed in: **API** (auth token, session, widget GET) and **Sync** (sync-by-provider)
  - Firebase config loaded at runtime from `/api/firebase-config`; no client-side keys
  - Dedicated `hosting/package.json` and build output in `hosting/dist`

### Changed

- **Firebase Hosting** – `firebase.json` now serves the built React app:
  - `hosting.public` set to `hosting/dist` (replaces legacy `public/` static files)
  - Rewrites: `/api/**` → Cloud Function `app`, `**` → `/index.html` (SPA fallback)
- **Root scripts** – From repo root (pnpm + Turborepo): `pnpm run build` builds the hosting app; `pnpm run deploy:all` builds then deploys; `pnpm run deploy:hosting` builds and deploys hosting only.

### Developer experience

- Local dev: from repo root run `pnpm run dev` with Functions + Auth emulators, or build and use `firebase emulators:start --only hosting,functions,auth`. See root [README](../README.md) and [apps/console/README.md](../apps/console/README.md).

**Update:** Hosting later moved from Vite to **Next.js** (static export to `hosting/out`), and the Hosting catch-all rewrite to `/index.html` was removed so unknown URLs use **`404.html`**. See [apps/console/CHANGELOG.md](../apps/console/CHANGELOG.md).

## [0.20.2] - 2025-02-14

### Fixed

- **AI summaries (Steam & Goodreads)** – Summaries were failing due to upstream API response-shape changes:
  - Parse both markdown-wrapped and raw JSON responses (shared `extractJsonFromAiResponse` helper)
  - Pin/update the configured flash model as needed for the provider
  - Removed debug logging from summary generators
- **Steam widget** – `getSteamWidgetContent` now returns a safe default when the `widget-content` doc is missing instead of throwing
- Log message typo: "Goodreadsn" → "Goodreads" in sync-goodreads-data

### Changed

- `.env.template`: Documented AI summary API keys must not be restricted to HTTP referrers when used from Firebase Functions

## [0.20.1] - 2025-02-14

### Changed

- **Express 5** – Upgraded from Express 4 to 5:
  - Catch-all 404 route updated to use named wildcard `/{*splat}` (Express 5 path syntax)
  - Rate limiter now uses `req.socket?.remoteAddress` instead of deprecated `req.connection.remoteAddress`
- Removed `packageManager` from `package.json` (project uses npm)

## [0.20.0] - 2025-02-14

### Changed

- **Node.js 24** – Upgraded the project to Node 24 everywhere to address Firebase deprecation warnings and align with Firebase's full Node 24 support:
  - Root `package.json` and `functions/package.json`: `engines.node` set to `>=24`
  - `firebase.json`: Cloud Functions runtime set to `nodejs24`
  - `.nvmrc`: set to `24` for local development
  - GitHub Actions CI (`.github/workflows/ci.yml`): `node-version` set to `24`

## [0.19.0] - 2025-02-13

### Added

- Book cover images for Goodreads activity updates (userstatus and review types)
- Automatic fetching of book metadata from Google Books API for updates without existing book data
- Fallback search by title/author when ISBN lookup fails
- Deduplication of book fetches for updates referencing the same book
- Rate limiting protection with exponential backoff for Google Books API requests
- Comprehensive test coverage for `processUpdatesWithMedia` function (97%+ coverage)

### Changed

- Enhanced `sync-goodreads-data` job to process updates and attach CDN media URLs
- Improved error handling for Google Books API quota exceeded errors

## [0.18.0] - 2024-12-XX

### Added

- GitHub contribution graph data to GitHub widget
- `contributionsCollection` with contribution calendar data for the last 365 days
- Comprehensive test coverage for GitHub widget content function (100% code coverage)
- GitHub widget option to API dashboard dropdown for testing
- Contribution data includes date, contribution count, and color for each day to enable flame graph visualization

### Changed

- GraphQL query now includes contribution calendar with total contributions, weeks, and daily contribution data

## [0.17.0] - 2024-XX-XX

### Added

- Comprehensive Firebase Authentication system with secure session management
- Firebase Auth integration with user creation/deletion triggers for automatic database management
- Secure session cookie support as primary authentication method (HTTP-only, secure, SameSite)
- Rate limiting middleware to prevent API abuse (10 sync requests per 15 minutes)
- Domain-based access control restricting access to @chrisvogt.me and @chronogrove.com users only
- Protected endpoints: `/api/user/profile`, `/api/auth/session`, `/api/auth/logout`
- Automatic token verification and refresh token management
- Comprehensive test coverage for all authentication flows (100% code coverage)
- Firebase emulator support for development and testing environments
- User management jobs for automatic database synchronization with Firebase Auth
- Enhanced logging and error handling throughout authentication system

### Changed

- Updated CORS configuration to support credentials for cross-origin cookie handling

### Security

- **BREAKING**: Sync endpoints now require authentication (JWT token or session cookie)

## [0.16.0] - 2024-XX-XX

### Added

- Comprehensive Discogs integration for vinyl record collection tracking
- Discogs API integration to fetch user's vinyl record collection and releases
- Discogs sync job to periodically update collection data from Discogs API
- Discogs widget content function to serve collection data to frontend
- Data transformers for Discogs releases and destination path handling
- Comprehensive test coverage for all Discogs functionality (100% code coverage)
- Discogs API configuration and environment variables
- Integration follows existing multi-tenant architecture patterns

## [0.15.0] - 2024-XX-XX

### Added

- AI-powered reading summary to Goodreads widget using an LLM backend
- Intelligent 2-3 paragraph summaries of reading activity and patterns
- AI analysis of recent books, genre preferences, and standout reads
- Comprehensive test coverage for new AI summary functionality (100% code coverage)
- Graceful fallback handling when AI summary generation fails
- AI summaries cached separately and can be regenerated independently of book data

### Changed

- Enhanced Goodreads sync job to generate and store AI summaries separately for widget consumption
- Increased Goodreads API fetch limit from 18 to 100 books for better reading pattern analysis

## [0.14.0] - 2024-XX-XX

### Added

- Multi-tenant support for Instagram widget
- Hostname-based user detection in API endpoints (chronogrove.com → chronogrove, others → chrisvogt)
- Comprehensive test coverage for Instagram widget (100% code coverage)

### Changed

- Instagram widget now supports dynamic user-based collection names (`users/{userId}/instagram`)

### Fixed

- Linter warnings and improved error handling in Instagram widget

## [0.13.0] - 2024-XX-XX

### Added

- `CURRENT_USERNAME` constant for future multi-tenant configuration
- Foundation ready for Firebase Auth and OAuth integration for multiple users

### Changed

- **BREAKING**: Migrated database structure to user-scoped collections for multi-tenant support
- All database collections now use `users/chrisvogt/` prefix (e.g., `users/chrisvogt/spotify/widget-content`)
- Storage paths updated to be user-scoped (e.g., `chrisvogt/spotify/playlists/`)
- Updated all sync jobs and widget content functions to use new user-scoped paths

## [0.12.0] - 2024-XX-XX

### Added

- AI summary to the Steam widget content via LLM backend

## [0.11.2] - [0.11.5] - 2024-XX-XX

### Changed

- Package dependency updates

## [0.11.1] - 2024-XX-XX

### Security

- Disabled all sync/* endpoints until auth is implemented

## [0.11.0] - 2024-XX-XX

### Changed

- **BREAKING**: Updated package from CommonJS to ESM

## [0.10.1] - 2024-XX-XX

### Changed

- Improved code coverage

## [0.10.0] - 2024-XX-XX

### Added

- Vitest testing framework
- First unit test spec file

## [0.9.1] - 2024-XX-XX

### Fixed

- Steam icon URL to use HTTPS instead of HTTP

## [0.9.0] - 2024-XX-XX

### Added

- `ownedGames` to the Steam widget API response

## [0.8.0] - 2024-XX-XX

### Added

- Additional fields from Instagram API: biography, followersCount
- Additional response information to the Instagram sync API response when no images were uploaded
- This changelog

---

_This changelog was started with v0.8.0._

[0.31.0]: https://github.com/chrisvogt/chronogrove/compare/v0.30.10...v0.31.0
[0.30.10]: https://github.com/chrisvogt/chronogrove/compare/v0.30.9...v0.30.10
[0.30.9]: https://github.com/chrisvogt/chronogrove/compare/v0.30.8...v0.30.9
[0.30.8]: https://github.com/chrisvogt/chronogrove/compare/v0.30.7...v0.30.8
[0.30.3]: https://github.com/chrisvogt/chronogrove/compare/v0.30.2...v0.30.3
[0.30.2]: https://github.com/chrisvogt/chronogrove/compare/v0.30.1...v0.30.2
[0.30.1]: https://github.com/chrisvogt/chronogrove/compare/v0.30.0...v0.30.1
[0.30.0]: https://github.com/chrisvogt/chronogrove/compare/v0.29.2...v0.30.0
[0.25.5]: https://github.com/chrisvogt/chronogrove/compare/v0.25.4...v0.25.5
[0.25.4]: https://github.com/chrisvogt/chronogrove/compare/v0.25.3...v0.25.4
[0.25.3]: https://github.com/chrisvogt/chronogrove/compare/v0.25.2...v0.25.3
[0.25.2]: https://github.com/chrisvogt/chronogrove/compare/v0.25.1...v0.25.2
[0.25.1]: https://github.com/chrisvogt/chronogrove/compare/v0.25.0...v0.25.1
[0.25.0]: https://github.com/chrisvogt/chronogrove/compare/v0.24.0...v0.25.0
[0.24.0]: https://github.com/chrisvogt/chronogrove/compare/v0.23.0...v0.24.0
[0.23.0]: https://github.com/chrisvogt/chronogrove/compare/v0.22.0...v0.23.0
[0.22.0]: https://github.com/chrisvogt/chronogrove/compare/v0.21.0...v0.22.0
[0.21.0]: https://github.com/chrisvogt/chronogrove/compare/v0.20.2...v0.21.0
[0.20.0]: https://github.com/chrisvogt/chronogrove/compare/v0.19.0...v0.20.0
[0.19.0]: https://github.com/chrisvogt/chronogrove/compare/v0.18.0...v0.19.0
[0.18.0]: https://github.com/chrisvogt/chronogrove/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/chrisvogt/chronogrove/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/chrisvogt/chronogrove/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/chrisvogt/chronogrove/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/chrisvogt/chronogrove/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/chrisvogt/chronogrove/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/chrisvogt/chronogrove/compare/v0.11.5...v0.12.0
[0.11.2]: https://github.com/chrisvogt/chronogrove/compare/v0.11.1...v0.11.2
[0.11.1]: https://github.com/chrisvogt/chronogrove/compare/v0.11.0...v0.11.1
[0.11.0]: https://github.com/chrisvogt/chronogrove/compare/v0.10.1...v0.11.0
[0.10.1]: https://github.com/chrisvogt/chronogrove/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/chrisvogt/chronogrove/compare/v0.9.1...v0.10.0
[0.9.1]: https://github.com/chrisvogt/chronogrove/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/chrisvogt/chronogrove/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/chrisvogt/chronogrove/releases/tag/v0.8.0
