import { describe, expect, it } from 'vitest'

import { redactSecretsInText, safeErrorMessageFromUnknown } from './redact-secrets.js'

describe('redactSecretsInText', () => {
  it('redacts Instagram-style access_token query params', () => {
    const input =
      'Request failed with status code 400: GET https://graph.instagram.com/v25.0/123/media?access_token=IGAAsecret&fields=id'

    expect(redactSecretsInText(input)).toBe(
      'Request failed with status code 400: GET https://graph.instagram.com/v25.0/123/media?access_token=[REDACTED]&fields=id',
    )
  })

  it('redacts Steam, Discogs, Goodreads, and Flickr param names', () => {
    expect(redactSecretsInText('https://api.steampowered.com/?key=steam-secret&steamid=1')).toBe(
      'https://api.steampowered.com/?key=[REDACTED]&steamid=1',
    )
    expect(redactSecretsInText('https://api.discogs.com/releases/1?token=discogs-secret')).toBe(
      'https://api.discogs.com/releases/1?token=[REDACTED]',
    )
    expect(redactSecretsInText('https://www.goodreads.com/user/show/1?key=gr-secret')).toBe(
      'https://www.goodreads.com/user/show/1?key=[REDACTED]',
    )
    expect(redactSecretsInText('https://www.flickr.com/services/rest?api_key=flickr-secret')).toBe(
      'https://www.flickr.com/services/rest?api_key=[REDACTED]',
    )
  })

  it('redacts multiple sensitive params in one string', () => {
    expect(
      redactSecretsInText(
        'GET https://example.com?access_token=a&oauth_token=b&fields=id',
      ),
    ).toBe('GET https://example.com?access_token=[REDACTED]&oauth_token=[REDACTED]&fields=id')
  })

  it('is case-insensitive for param names', () => {
    expect(redactSecretsInText('https://example.com?ACCESS_TOKEN=secret')).toBe(
      'https://example.com?ACCESS_TOKEN=[REDACTED]',
    )
  })

  it('leaves strings without sensitive params unchanged', () => {
    const plain = 'Steam unavailable'
    expect(redactSecretsInText(plain)).toBe(plain)
  })

  it('redacts client_secret, refresh_token, and oauth_token_secret query params', () => {
    expect(
      redactSecretsInText(
        'https://example.com?client_secret=cs&refresh_token=rt&oauth_token_secret=ots',
      ),
    ).toBe(
      'https://example.com?client_secret=[REDACTED]&refresh_token=[REDACTED]&oauth_token_secret=[REDACTED]',
    )
  })

  it('handles empty strings', () => {
    expect(redactSecretsInText('')).toBe('')
  })
})

describe('safeErrorMessageFromUnknown', () => {
  it('redacts Error messages', () => {
    const error = new Error(
      'Request failed: GET https://graph.instagram.com/me?access_token=secret-token',
    )

    expect(safeErrorMessageFromUnknown(error)).toBe(
      'Request failed: GET https://graph.instagram.com/me?access_token=[REDACTED]',
    )
  })

  it('redacts plain strings and message-like objects', () => {
    expect(safeErrorMessageFromUnknown('failed?key=abc')).toBe('failed?key=[REDACTED]')
    expect(safeErrorMessageFromUnknown({ message: 'failed?token=xyz' })).toBe(
      'failed?token=[REDACTED]',
    )
  })

  it('stringifies objects with a non-string message property', () => {
    expect(safeErrorMessageFromUnknown({ message: 99 })).toBe('{"message":99}')
  })

  it('redacts sensitive params in JSON-stringified objects', () => {
    expect(safeErrorMessageFromUnknown({ url: 'https://x?key=secret', code: 418 })).toBe(
      '{"url":"https://x?key=[REDACTED]","code":418}',
    )
  })

  it('returns Unknown error when JSON.stringify throws', () => {
    const circular: Record<string, unknown> = { a: 1 }
    circular.self = circular

    expect(safeErrorMessageFromUnknown(circular)).toBe('Unknown error')
  })

  it('returns Unknown error for undefined and unstringifiable values', () => {
    expect(safeErrorMessageFromUnknown(undefined)).toBe('Unknown error')
    expect(safeErrorMessageFromUnknown(() => {})).toBe('Unknown error')
  })
})
