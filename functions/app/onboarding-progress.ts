import { toStoredDateTime } from '../utils/time.js'

export const ONBOARDING_USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/

const WIZARD_STEPS = ['username', 'connections', 'domain'] as const
export type OnboardingWizardStep = (typeof WIZARD_STEPS)[number]

export const ONBOARDING_FLOW_STEPS = ['username', 'connections', 'domain', 'done'] as const
export type OnboardingFlowStep = (typeof ONBOARDING_FLOW_STEPS)[number]

export const ONBOARDING_OAUTH_PROVIDER_IDS = [
  'github',
  'discogs',
  'spotify',
  'goodreads',
  'steam',
  'flickr',
  'instagram',
] as const

/** API / UI aggregate (unchanged for the hosting client). */
export interface OnboardingProgressPayload {
  currentStep: OnboardingFlowStep
  completedSteps: OnboardingWizardStep[]
  username: string | null
  connectedProviderIds: string[]
  /** Firestore `users/{uid}/integrations/{id}.status` (server-derived; omit on PUT). */
  integrationStatuses?: Record<string, string>
  customDomain: string | null
  updatedAt: string
}

/**
 * Firestore: wizard position only. Custom API hostname lives in `users.{uid}.tenantHostname`
 * and `tenant_hosts/{hostname}`; the API still exposes it as `customDomain` in payloads.
 */
export interface UserOnboardingDoc {
  currentStep: OnboardingFlowStep
  completedSteps: OnboardingWizardStep[]
  updatedAt: string
}

const DOMAIN_FORMAT = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/

function isWizardStep(s: string): s is OnboardingWizardStep {
  return (WIZARD_STEPS as readonly string[]).includes(s)
}

function isFlowStep(s: string): s is OnboardingFlowStep {
  return (ONBOARDING_FLOW_STEPS as readonly string[]).includes(s)
}

export function defaultOnboardingProgress(): OnboardingProgressPayload {
  return {
    currentStep: 'username',
    completedSteps: [],
    username: null,
    connectedProviderIds: [],
    integrationStatuses: {},
    customDomain: null,
    updatedAt: toStoredDateTime(),
  }
}

function defaultUserOnboardingDoc(): UserOnboardingDoc {
  const t = toStoredDateTime()
  return {
    currentStep: 'username',
    completedSteps: [],
    updatedAt: t,
  }
}

function normalizeUserOnboarding(raw: unknown): UserOnboardingDoc {
  const base = defaultUserOnboardingDoc()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>
  const cs = o.currentStep
  const currentStep =
    typeof cs === 'string' && isFlowStep(cs) ? cs : base.currentStep
  const comp = o.completedSteps
  const completedSteps: OnboardingWizardStep[] = Array.isArray(comp)
    ? comp.filter((x): x is OnboardingWizardStep => typeof x === 'string' && isWizardStep(x))
    : []
  const ua = o.updatedAt
  const updatedAt = typeof ua === 'string' ? ua : base.updatedAt
  return {
    currentStep,
    completedSteps,
    updatedAt,
  }
}

/** Legacy blob stored under `onboardingProgress` before schema split. */
function normalizeLegacyOnboardingProgress(raw: unknown): Partial<OnboardingProgressPayload> {
  if (!raw || typeof raw !== 'object') return {}
  const o = raw as Record<string, unknown>
  const out: Partial<OnboardingProgressPayload> = {}
  const cs = o.currentStep
  if (typeof cs === 'string' && isFlowStep(cs)) out.currentStep = cs
  const comp = o.completedSteps
  if (Array.isArray(comp)) {
    out.completedSteps = comp.filter(
      (x): x is OnboardingWizardStep => typeof x === 'string' && isWizardStep(x),
    )
  }
  if (typeof o.username === 'string' && o.username.length > 0) {
    out.username = o.username.toLowerCase()
  }
  if (Array.isArray(o.connectedProviderIds)) {
    out.connectedProviderIds = o.connectedProviderIds.filter(
      (x): x is string =>
        typeof x === 'string' &&
        (ONBOARDING_OAUTH_PROVIDER_IDS as readonly string[]).includes(x),
    )
  }
  if (typeof o.customDomain === 'string' && o.customDomain.length > 0) {
    out.customDomain = o.customDomain.toLowerCase().trim()
  }
  if (typeof o.updatedAt === 'string') out.updatedAt = o.updatedAt
  return out
}

function tenantHostnameFromUserDoc(doc: Record<string, unknown> | null | undefined): string | null {
  if (!doc) return null
  const th = doc.tenantHostname
  if (typeof th !== 'string' || th.length === 0) return null
  return th.toLowerCase().trim()
}

export function buildClientPayloadFromFirestore(params: {
  userDoc: Record<string, unknown> | null
  integrationProviderIds: string[]
  integrationStatuses?: Record<string, string>
}): OnboardingProgressPayload {
  const base = defaultOnboardingProgress()
  const doc = params.userDoc
  const rawOnboarding = doc?.onboarding

  const userOnboarding = normalizeUserOnboarding(rawOnboarding)
  const legacy = normalizeLegacyOnboardingProgress(doc?.onboardingProgress)

  const noOnboardingDoc =
    doc == null ||
    !Object.hasOwn(doc as object, 'onboarding') ||
    rawOnboarding === null ||
    typeof rawOnboarding !== 'object'

  const username =
    (typeof doc?.username === 'string' && doc.username.length > 0
      ? doc.username.toLowerCase()
      : null) ??
    legacy.username ??
    null

  const connectedProviderIds =
    params.integrationProviderIds.length > 0
      ? params.integrationProviderIds
      : legacy.connectedProviderIds ?? base.connectedProviderIds

  const currentStep = noOnboardingDoc
    ? (legacy.currentStep ?? userOnboarding.currentStep)
    : userOnboarding.currentStep

  let completedSteps: OnboardingWizardStep[]
  if (noOnboardingDoc) {
    completedSteps = legacy.completedSteps ?? userOnboarding.completedSteps
  } else if (userOnboarding.completedSteps.length > 0) {
    completedSteps = userOnboarding.completedSteps
  } else {
    completedSteps = legacy.completedSteps ?? base.completedSteps
  }

  const customDomain =
    tenantHostnameFromUserDoc(doc) ?? legacy.customDomain ?? base.customDomain

  const updatedAt = noOnboardingDoc
    ? legacy.updatedAt ?? userOnboarding.updatedAt
    : userOnboarding.updatedAt

  return {
    currentStep,
    completedSteps,
    username,
    connectedProviderIds,
    integrationStatuses: params.integrationStatuses ?? {},
    customDomain,
    updatedAt,
  }
}

/** @deprecated Prefer `loadOnboardingStateForApi` / `buildClientPayloadFromFirestore`. Kept for tests and single-blob callers. */
export function normalizeOnboardingProgress(
  legacyBlob: unknown
): OnboardingProgressPayload {
  return buildClientPayloadFromFirestore({
    userDoc:
      legacyBlob === undefined || legacyBlob === null
        ? null
        : { onboardingProgress: legacyBlob },
    integrationProviderIds: [],
    integrationStatuses: {},
  })
}

function parseOptionalUsername(
  un: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  let username: string | null = null
  if (un !== null && un !== undefined) {
    if (typeof un !== 'string') {
      return { ok: false, error: 'Invalid username' }
    }
    if (un.length > 0) {
      const lowered = un.toLowerCase()
      if (!ONBOARDING_USERNAME_PATTERN.test(lowered)) {
        return { ok: false, error: 'Invalid username format' }
      }
      username = lowered
    }
  }
  return { ok: true, value: username }
}

function parseOptionalCustomDomain(
  cd: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  let customDomain: string | null = null
  if (cd !== null && cd !== undefined) {
    if (typeof cd !== 'string') {
      return { ok: false, error: 'Invalid customDomain' }
    }
    const t = cd.toLowerCase().trim()
    if (t.length > 0) {
      if (t.length > 253 || !DOMAIN_FORMAT.test(t)) {
        return { ok: false, error: 'Invalid domain' }
      }
      customDomain = t
    }
  }
  return { ok: true, value: customDomain }
}

export function parseOnboardingProgressBody(
  body: unknown
): { ok: true; value: OnboardingProgressPayload } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid body' }
  }
  const o = body as Record<string, unknown>
  const currentStepRaw = o.currentStep
  if (typeof currentStepRaw !== 'string' || !isFlowStep(currentStepRaw)) {
    return { ok: false, error: 'Invalid currentStep' }
  }
  const compRaw = o.completedSteps
  if (!Array.isArray(compRaw)) {
    return { ok: false, error: 'completedSteps must be an array' }
  }
  const completedSteps = compRaw.filter(
    (x): x is OnboardingWizardStep => typeof x === 'string' && isWizardStep(x),
  )
  const usernameResult = parseOptionalUsername(o.username)
  if (usernameResult.ok === false) {
    return { ok: false, error: usernameResult.error }
  }
  const cp = o.connectedProviderIds
  if (!Array.isArray(cp)) {
    return { ok: false, error: 'connectedProviderIds must be an array' }
  }
  const connectedProviderIds = cp.filter(
    (x): x is string =>
      typeof x === 'string' &&
      (ONBOARDING_OAUTH_PROVIDER_IDS as readonly string[]).includes(x),
  )
  const customDomainResult = parseOptionalCustomDomain(o.customDomain)
  if (customDomainResult.ok === false) {
    return { ok: false, error: customDomainResult.error }
  }
  return {
    ok: true,
    value: {
      currentStep: currentStepRaw,
      completedSteps,
      username: usernameResult.value,
      connectedProviderIds,
      customDomain: customDomainResult.value,
      updatedAt: toStoredDateTime(),
    },
  }
}