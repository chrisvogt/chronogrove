# Environment Setup for Firebase Functions

## Local Development

1. Copy `.env.template` to `.env.local`:
   ```bash
   cp .env.template .env.local
   ```
2. Fill in your actual values in the `.env.local` file.
3. The `.env.local` file is in `.gitignore` and is not committed.

When `NODE_ENV !== 'production'`, the app should load local config from `.env.local` (via dotenv). Avoid `functions/.env` for day-to-day development because Firebase deploys that file's values into Cloud Functions.

### Local media storage

For local development, media storage now defaults to disk unless you explicitly set `MEDIA_STORE_BACKEND=gcs`.

Useful local settings:

```bash
MEDIA_STORE_BACKEND=disk
LOCAL_MEDIA_ROOT=/absolute/path/to/metrics-local-media
MEDIA_PUBLIC_BASE_URL=/api/media/
```

With that setup, uploaded media is written under `LOCAL_MEDIA_ROOT` and served by the Functions app at `/api/media/*`.

`IMAGE_CDN_BASE_URL` still works as a backwards-compatible alias, but `MEDIA_PUBLIC_BASE_URL` is the provider-neutral setting to use going forward.

## Production

Production config is stored in **Google Cloud Secret Manager** as a single JSON secret:

- **Secret name:** `FUNCTIONS_CONFIG_EXPORT`
- **Location:** [Google Cloud Console → Secret Manager](https://console.cloud.google.com/security/secret-manager) (select your Firebase project).

The app binds this secret to the HTTP and scheduled functions and, on each cold start, reads the JSON and applies it to `process.env` using the mapping in `config/exported-config.ts`.

### Creating or updating the secret

**Option A: Export from existing Firebase config (one-time migration)**  
If you previously used `firebase functions:config:set`:

```bash
firebase functions:config:export
```

Follow the prompts; the CLI creates or updates the `FUNCTIONS_CONFIG_EXPORT` secret with your current runtime config.

**Option B: Edit in Secret Manager**  
1. Open Secret Manager in Cloud Console.  
2. Open the secret **FUNCTIONS_CONFIG_EXPORT**.  
3. **New version** → paste JSON that matches the shape expected by `config/exported-config.ts` (nested objects; dotted names in the mapping are paths, not literal JSON keys). Examples: `github.access_token` → `{ "github": { "access_token": "..." } }`, `anthropic.api_key` → `{ "anthropic": { "api_key": "..." } }` (not a top-level `"anthropic.api_key"` property).  
4. Save. New function instances will use the latest version.

For production deploys, do not set disk-only storage values such as `storage.local_media_root` or `storage.media_store_backend=disk`. Leave those local-only overrides in `.env.local`; production defaults to GCS and uses the secret-backed storage config for Firestore, bucket, and media URL settings.

### Updating a single value

Edit **FUNCTIONS_CONFIG_EXPORT** in Secret Manager and add a new version with the full JSON (only the key you change needs a new value; the rest can be unchanged). Redeploy or wait for instances to recycle so they load the new version.

## Environment variables reference

See `.env.template` for the full list of variable names. The same names are used in `.env.local` (local) and as the target of the mapping from the secret’s JSON paths in `config/exported-config.ts` (production).

## After setup

- **Deploy:** `firebase deploy --only functions` (runs **`predeploy` → `build`**; **`lib/`** is up to date).
- **Local testing:** The emulator loads compiled output from **`functions/lib/`** (see **`main`** in **`package.json`**), which is **gitignored**. After editing TypeScript, run **`pnpm --filter chronogrove-functions run build`** before **`firebase emulators:start`**, or start emulators via **`pnpm --filter chronogrove-functions start`** ( **`prestart`** runs **`build`** ), or use repo **`pnpm run dev:full`** (builds functions first). Plain **`firebase emulators:start`** does **not** run **`predeploy`**, so a stale **`lib/`** can mask fixes until you rebuild.
