import { describe, it, expect } from 'vitest'
import type { Request } from 'express'

import {
  formatUnknownFailureMessage,
  isInfrastructurePublicWidgetHostname,
  normalizeExpressPathParam,
  parseManualSyncProviderSegmentFromRequest,
  resolveManualSyncProvider,
} from './create-express-app.js'

describe('isInfrastructurePublicWidgetHostname', () => {
  it('treats empty host and IPv4-mapped loopback forms as infrastructure', () => {
    expect(isInfrastructurePublicWidgetHostname('')).toBe(true)
    expect(isInfrastructurePublicWidgetHostname('::1')).toBe(true)
    expect(isInfrastructurePublicWidgetHostname('[::1]')).toBe(true)
    expect(isInfrastructurePublicWidgetHostname('::ffff:127.0.0.1')).toBe(true)
    expect(isInfrastructurePublicWidgetHostname('[::ffff:127.0.0.1]')).toBe(true)
  })

  it('treats normal tenant hostnames as non-infrastructure', () => {
    expect(isInfrastructurePublicWidgetHostname('api.example.com')).toBe(false)
  })
})

describe('formatUnknownFailureMessage', () => {
  it('returns message for Error instances', () => {
    expect(formatUnknownFailureMessage(new Error('boom'))).toBe('boom')
  })

  it('returns string message field when present', () => {
    expect(formatUnknownFailureMessage({ message: 'from object' })).toBe('from object')
  })

  it('JSON-stringifies plain objects when message is absent or non-string', () => {
    expect(formatUnknownFailureMessage({ code: 418 })).toBe('{"code":418}')
    expect(formatUnknownFailureMessage({ message: 99 })).toBe('{"message":99}')
  })

  it('returns a fixed label when JSON.stringify fails (e.g. circular structure)', () => {
    const circular: Record<string, unknown> = { a: 1 }
    circular.self = circular
    expect(formatUnknownFailureMessage(circular)).toBe('Unserializable error')
  })

  it('redacts sensitive query params from Error messages', () => {
    expect(
      formatUnknownFailureMessage(
        new Error('GET https://graph.instagram.com/me?access_token=secret'),
      ),
    ).toBe('GET https://graph.instagram.com/me?access_token=[REDACTED]')
  })

  it('redacts sensitive query params from string message fields', () => {
    expect(formatUnknownFailureMessage({ message: 'failed?key=api-secret' })).toBe(
      'failed?key=[REDACTED]',
    )
  })

  it('redacts sensitive query params from JSON-stringified objects', () => {
    expect(formatUnknownFailureMessage({ detail: 'https://x?token=abc' })).toBe(
      '{"detail":"https://x?token=[REDACTED]"}',
    )
  })
})

describe('normalizeExpressPathParam', () => {
  it('accepts string params and first string array element', () => {
    expect(normalizeExpressPathParam('spotify')).toBe('spotify')
    expect(normalizeExpressPathParam(['flickr', 'extra'])).toBe('flickr')
  })

  it('returns undefined for non-string first array element or other shapes', () => {
    expect(normalizeExpressPathParam([123, 'x'])).toBeUndefined()
    expect(normalizeExpressPathParam({ x: 1 })).toBeUndefined()
    expect(normalizeExpressPathParam(null)).toBeUndefined()
  })
})

describe('parseManualSyncProviderSegmentFromRequest', () => {
  const req = (partial: Partial<Request>): Request => partial as Request

  it('reads provider from req.path for json and stream routes', () => {
    expect(
      parseManualSyncProviderSegmentFromRequest(
        req({ path: '/api/widgets/sync/steam' }),
        'json',
      ),
    ).toBe('steam')
    expect(
      parseManualSyncProviderSegmentFromRequest(
        req({ path: '/api/widgets/sync/goodreads/stream' }),
        'stream',
      ),
    ).toBe('goodreads')
  })

  it('falls back to originalUrl when path is empty or missing a match', () => {
    expect(
      parseManualSyncProviderSegmentFromRequest(
        req({
          path: '',
          originalUrl: '/prefix/api/widgets/sync/discogs/stream?x=1',
        }),
        'stream',
      ),
    ).toBe('discogs')
  })

  it('ignores malformed originalUrl and returns undefined', () => {
    expect(
      parseManualSyncProviderSegmentFromRequest(
        req({
          path: '',
          url: 'http://example.com:bad port/api/widgets/sync/steam/stream',
          originalUrl: undefined,
        }),
        'stream',
      ),
    ).toBeUndefined()
  })
})

describe('resolveManualSyncProvider', () => {
  const req = (partial: Partial<Request>): Request => partial as Request

  it('prefers a valid sync id from the URL over bogus params', () => {
    expect(
      resolveManualSyncProvider(
        req({
          params: { provider: 'stream' },
          path: '/api/widgets/sync/flickr/stream',
        }),
        'stream',
      ),
    ).toBe('flickr')
  })

  it('uses params when path segment is not a sync id but params are', () => {
    expect(
      resolveManualSyncProvider(
        req({
          params: { provider: 'spotify' },
          path: '/api/widgets/sync/not-a-provider/stream',
        }),
        'stream',
      ),
    ).toBe('spotify')
  })

  it('returns the param segment when neither side is a known sync provider', () => {
    expect(
      resolveManualSyncProvider(
        req({
          params: { provider: 'aaa' },
          path: '/api/widgets/sync/bbb/stream',
        }),
        'stream',
      ),
    ).toBe('aaa')
  })
})
