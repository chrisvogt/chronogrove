import { describe, expect, it } from 'vitest'

import {
  OAUTH_RETURN_TO_MAX_LEN,
  validateReturnTo,
  withDiscogsOAuthFlash,
  withFlickrOAuthFlash,
  withGitHubOAuthFlash,
} from './oauth-return-path.js'

describe('oauth-return-path', () => {
  it('validateReturnTo accepts safe relative paths', () => {
    expect(validateReturnTo('/')).toBe('/')
    expect(validateReturnTo('/onboarding')).toBe('/onboarding')
    expect(validateReturnTo('/?providers=open')).toBe('/?providers=open')
    expect(validateReturnTo('/onboarding?step=connections')).toBe('/onboarding?step=connections')
    expect(validateReturnTo('  /trimmed-path  ')).toBe('/trimmed-path')
    expect(validateReturnTo('/path?x=1#pane')).toBe('/path?x=1#pane')
  })

  it('validateReturnTo rejects nullish and non-strings', () => {
    expect(validateReturnTo(null)).toBeNull()
    expect(validateReturnTo(undefined)).toBeNull()
    expect(validateReturnTo(123 as unknown as string)).toBeNull()
  })

  it('validateReturnTo rejects scheme-like segments and backslash prefixes', () => {
    expect(validateReturnTo('/foo/https://still-relative')).toBeNull()
    expect(validateReturnTo('/\\evil')).toBeNull()
  })

  it('validateReturnTo rejects open redirects and junk', () => {
    expect(validateReturnTo('//evil.com')).toBeNull()
    expect(validateReturnTo('https://evil.com/foo')).toBeNull()
    expect(validateReturnTo('')).toBeNull()
    expect(validateReturnTo('/foo/../bar')).toBeNull()
    expect(validateReturnTo('/pa\nth')).toBeNull()
    expect(validateReturnTo(`/${'a'.repeat(OAUTH_RETURN_TO_MAX_LEN + 1)}`)).toBeNull()
  })

  it('withFlickrOAuthFlash merges query and sets oauth', () => {
    expect(withFlickrOAuthFlash('/onboarding', 'success')).toBe('/onboarding?oauth=flickr&status=success')
    expect(withFlickrOAuthFlash('/?providers=open', 'success')).toBe(
      '/?providers=open&oauth=flickr&status=success'
    )
    expect(withFlickrOAuthFlash('/x?foo=1', 'error', 'bad')).toBe(
      '/x?foo=1&oauth=flickr&status=error&reason=bad'
    )
  })

  it('withFlickrOAuthFlash preserves hash', () => {
    expect(withFlickrOAuthFlash('/onboarding#pane', 'success')).toBe(
      '/onboarding?oauth=flickr&status=success#pane'
    )
  })

  it('withFlickrOAuthFlash omits reason for errors when reason is empty', () => {
    const url = withFlickrOAuthFlash('/x', 'error', '')
    expect(url).not.toContain('reason=')
    expect(url).toContain('status=error')
  })

  it('withFlickrOAuthFlash omits reason when error status and reason omitted', () => {
    const url = withFlickrOAuthFlash('/y', 'error')
    expect(url).toBe('/y?oauth=flickr&status=error')
    expect(url).not.toContain('reason=')
  })

  it('withFlickrOAuthFlash handles hash-only path and success ignores extra reason arg', () => {
    expect(withFlickrOAuthFlash('/#section', 'success')).toBe('/?oauth=flickr&status=success#section')
    expect(withFlickrOAuthFlash('/z', 'success', 'nope')).toBe('/z?oauth=flickr&status=success')
  })

  it('withDiscogsOAuthFlash sets oauth=discogs', () => {
    expect(withDiscogsOAuthFlash('/onboarding', 'success')).toBe('/onboarding?oauth=discogs&status=success')
    expect(withDiscogsOAuthFlash('/x', 'error', 'bad')).toBe('/x?oauth=discogs&status=error&reason=bad')
  })

  it('withDiscogsOAuthFlash merges query, preserves hash, and handles error reason edge cases', () => {
    expect(withDiscogsOAuthFlash('/?providers=open', 'success')).toBe(
      '/?providers=open&oauth=discogs&status=success',
    )
    expect(withDiscogsOAuthFlash('/onboarding#pane', 'success')).toBe(
      '/onboarding?oauth=discogs&status=success#pane',
    )
    expect(withDiscogsOAuthFlash('/#section', 'success')).toBe('/?oauth=discogs&status=success#section')
    expect(withDiscogsOAuthFlash('/z', 'success', 'ignored')).toBe('/z?oauth=discogs&status=success')
    const errEmpty = withDiscogsOAuthFlash('/a', 'error', '')
    expect(errEmpty).toContain('status=error')
    expect(errEmpty).not.toContain('reason=')
    expect(withDiscogsOAuthFlash('/b', 'error')).toBe('/b?oauth=discogs&status=error')
  })

  it('withGitHubOAuthFlash sets oauth=github', () => {
    expect(withGitHubOAuthFlash('/onboarding', 'success')).toBe('/onboarding?oauth=github&status=success')
    expect(withGitHubOAuthFlash('/x', 'error', 'bad')).toBe('/x?oauth=github&status=error&reason=bad')
  })

  it('treats a trailing # with no fragment as no hash (joined without empty #suffix)', () => {
    expect(withFlickrOAuthFlash('/done#', 'success')).toBe('/done?oauth=flickr&status=success')
    expect(withDiscogsOAuthFlash('/done#', 'success')).toBe('/done?oauth=discogs&status=success')
    expect(withGitHubOAuthFlash('/done#', 'success')).toBe('/done?oauth=github&status=success')
  })

  it('withGitHubOAuthFlash merges query, preserves hash, and handles error reason edge cases', () => {
    expect(withGitHubOAuthFlash('/?providers=open', 'success')).toBe(
      '/?providers=open&oauth=github&status=success',
    )
    expect(withGitHubOAuthFlash('/onboarding#pane', 'success')).toBe(
      '/onboarding?oauth=github&status=success#pane',
    )
    expect(withGitHubOAuthFlash('/#section', 'success')).toBe('/?oauth=github&status=success#section')
    expect(withGitHubOAuthFlash('/z', 'success', 'ignored')).toBe('/z?oauth=github&status=success')
    const errEmpty = withGitHubOAuthFlash('/a', 'error', '')
    expect(errEmpty).toContain('status=error')
    expect(errEmpty).not.toContain('reason=')
    expect(withGitHubOAuthFlash('/b', 'error')).toBe('/b?oauth=github&status=error')
  })
})
