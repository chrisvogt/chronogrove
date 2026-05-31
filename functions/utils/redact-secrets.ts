const REDACTED = '[REDACTED]'

/** Query parameter names whose values must not appear in logs, APIs, or persisted errors. */
const SENSITIVE_QUERY_PARAM_NAMES = [
  'access_token',
  'api_key',
  'client_secret',
  'key',
  'oauth_token',
  'oauth_token_secret',
  'refresh_token',
  'token',
] as const

const sensitiveQueryParamPattern = new RegExp(
  String.raw`([?&](?:${SENSITIVE_QUERY_PARAM_NAMES.join('|')})=)([^&\s"']+)`,
  'gi',
)

/**
 * Replace secret values in URL query strings (e.g. got HTTPError messages) with a fixed placeholder.
 */
export const redactSecretsInText = (text: string): string => {
  if (text.length === 0) {
    return text
  }

  return text.replace(sensitiveQueryParamPattern, `$1${REDACTED}`)
}

const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message
    if (typeof message === 'string') {
      return message
    }
  }
  try {
    const serialized = JSON.stringify(error)
    // JSON.stringify returns undefined for undefined, functions, symbols, etc.
    return typeof serialized === 'string' ? serialized : 'Unknown error'
  } catch {
    return 'Unknown error'
  }
}

/** Normalize an unknown error to a string safe for logs, APIs, and Firestore job records. */
export const safeErrorMessageFromUnknown = (error: unknown): string =>
  redactSecretsInText(extractErrorMessage(error))
