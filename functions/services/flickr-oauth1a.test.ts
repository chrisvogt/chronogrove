import { describe, expect, it, vi, beforeEach } from 'vitest'

import got from 'got'

import {
  buildFlickrAuthorizeUrl,
  buildParameterString,
  buildSignatureBaseString,
  buildSigningKey,
  compareOAuthParamUtf8Octets,
  flickrGetAccessToken,
  flickrGetRequestToken,
  flickrSignQuery,
  oauthPercentEncode,
  parseFormStyleBody,
  randomOAuthNonce,
  signHmacSha1Base64,
  sortParamPairs,
  sortedQueryFromParams,
} from './flickr-oauth1a.js'

vi.mock('got', () => ({ default: vi.fn() }))

describe('flickr-oauth1a', () => {
  beforeEach(() => {
    vi.mocked(got).mockReset()
  })
  it('oauthPercentEncode keeps tilde unescaped', () => {
    expect(oauthPercentEncode('a~b')).toBe('a~b')
  })

  it('compareOAuthParamUtf8Octets uses UTF-8 octet order (not string/code-unit collation)', () => {
    expect(compareOAuthParamUtf8Octets('', '')).toBe(0)
    expect(compareOAuthParamUtf8Octets('a', 'a')).toBe(0)
    expect(compareOAuthParamUtf8Octets('', 'x')).toBeLessThan(0)
    expect(compareOAuthParamUtf8Octets('x', '')).toBeGreaterThan(0)
    // Common prefix then shorter string sorts first (0x61 vs 0x61 0x62)
    expect(compareOAuthParamUtf8Octets('a', 'ab')).toBeLessThan(0)
    expect(compareOAuthParamUtf8Octets('ab', 'a')).toBeGreaterThan(0)
    // First differing byte: 'aa' (61 61) before 'b' (62)
    expect(compareOAuthParamUtf8Octets('aa', 'b')).toBeLessThan(0)
    // ASCII 'a' (61) before emoji leading byte F0
    expect(compareOAuthParamUtf8Octets('a', '😀')).toBeLessThan(0)
  })

  it('buildParameterString sorts by UTF-8 octet order (RFC 5849) by key then value', () => {
    const s = buildParameterString({
      z: '2',
      a: '1',
      m: '3',
    })
    expect(s).toBe('a=1&m=3&z=2')
  })

  it('buildSignatureBaseString matches Flickr doc shape (encoded segments)', () => {
    const params = {
      oauth_callback: 'http://www.example.com',
      oauth_consumer_key: '653e7a6ecc1d528c516cc8f92cf98611',
      oauth_nonce: '95613465',
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: '1305586162',
      oauth_version: '1.0',
    }
    const base = buildSignatureBaseString(
      'GET',
      'https://www.flickr.com/services/oauth/request_token',
      params
    )
    expect(base).toBe(
      [
        'GET',
        oauthPercentEncode('https://www.flickr.com/services/oauth/request_token'),
        oauthPercentEncode(buildParameterString(params)),
      ].join('&')
    )
  })

  it('buildSigningKey concatenates encoded secrets', () => {
    expect(buildSigningKey('cons&secret', 'tok/secret')).toBe(
      `${oauthPercentEncode('cons&secret')}&${oauthPercentEncode('tok/secret')}`
    )
  })

  it('parseFormStyleBody decodes Flickr access token responses', () => {
    const body =
      'fullname=Jamal%20Fanaian&oauth_token=721576263&oauth_token_secret=abc&user_nsid=21207597%40N07&username=jamal'
    expect(parseFormStyleBody(body)).toMatchObject({
      fullname: 'Jamal Fanaian',
      oauth_token: '721576263',
      oauth_token_secret: 'abc',
      user_nsid: '21207597@N07',
      username: 'jamal',
    })
  })

  it('parseFormStyleBody handles keys without = and decodes percent-encoded keys', () => {
    expect(parseFormStyleBody('flag&oauth_token=t')).toEqual({ flag: '', oauth_token: 't' })
    expect(parseFormStyleBody('a%3Db=c')).toEqual({ 'a=b': 'c' })
    expect(parseFormStyleBody('a=1&&b=2')).toEqual({ a: '1', b: '2' })
  })

  it('parseFormStyleBody does not throw on malformed percent-encoding', () => {
    expect(parseFormStyleBody('a=%ZZ&oauth_token=t&oauth_token_secret=s&user_nsid=n&username=u')).toEqual({
      a: '%ZZ',
      oauth_token: 't',
      oauth_token_secret: 's',
      user_nsid: 'n',
      username: 'u',
    })
  })

  it('parseFormStyleBody leaves values that decodeURIComponent rejects', () => {
    expect(parseFormStyleBody('k=%')).toEqual({ k: '%' })
    expect(parseFormStyleBody('%=1')).toEqual({ '%': '1' })
  })

  it('access-token fullname normalization does not double-decode (literal % in display name)', () => {
    const parsed = parseFormStyleBody(
      'fullname=100%25+Done&oauth_token=t&oauth_token_secret=s&user_nsid=n&username=u'
    )
    expect(parsed.fullname).toBe('100%+Done')
    const fullname = parsed.fullname ? parsed.fullname.replace(/\+/g, ' ') : ''
    expect(fullname).toBe('100% Done')
    expect(() => decodeURIComponent(fullname)).toThrow(URIError)
  })

  it('sortParamPairs orders by UTF-8 octets, not locale rules', () => {
    // Latin "a" (0x61) precedes Cyrillic "а" U+0430 (0xD0 0xB0) in octet order
    expect(
      sortParamPairs([
        ['а', '1'],
        ['a', '2'],
      ])
    ).toEqual([
      ['a', '2'],
      ['а', '1'],
    ])
  })

  it('sortParamPairs orders duplicate keys by value', () => {
    expect(
      sortParamPairs([
        ['b', '2'],
        ['b', '1'],
        ['a', '2'],
      ])
    ).toEqual([
      ['a', '2'],
      ['b', '1'],
      ['b', '2'],
    ])
    expect(
      sortParamPairs([
        ['b', '1'],
        ['b', '1'],
      ])
    ).toEqual([
      ['b', '1'],
      ['b', '1'],
    ])
    expect(
      sortParamPairs([
        ['k', 'z'],
        ['k', 'a'],
      ])
    ).toEqual([
      ['k', 'a'],
      ['k', 'z'],
    ])
  })

  it('sortedQueryFromParams emits UTF-8-octet-sorted query pairs', () => {
    const qs = sortedQueryFromParams({ z: '9', a: '1' })
    expect(qs).toBe(`${oauthPercentEncode('a')}=1&${oauthPercentEncode('z')}=9`)
  })

  it('signHmacSha1Base64 is stable for a known base string', () => {
    const sig = signHmacSha1Base64('GET&http%3A%2F%2Fexample&a%3D1', 'key')
    expect(sig).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(sig.length).toBeGreaterThan(10)
  })

  it('randomOAuthNonce returns hex', () => {
    expect(randomOAuthNonce()).toMatch(/^[0-9a-f]{32}$/)
  })

  it('buildFlickrAuthorizeUrl supports write perms', () => {
    const url = buildFlickrAuthorizeUrl('tok', 'write')
    expect(url).toContain('perms=write')
    expect(url).toContain('oauth_token=tok')
  })

  it('flickrSignQuery requires oauth_consumer_key', () => {
    expect(() => flickrSignQuery('GET', 'https://api.flickr.test/rest', {}, 'cs', 'ts')).toThrow(
      /oauth_consumer_key required/
    )
  })

  it('flickrSignQuery fills oauth meta and returns signed params', () => {
    const signed = flickrSignQuery(
      'GET',
      'https://www.flickr.com/services/rest',
      { oauth_consumer_key: 'ck', method: 'x' },
      'secret',
      'toksec'
    )
    expect(signed.oauth_signature).toBeTruthy()
    expect(signed.oauth_consumer_key).toBe('ck')
    expect(signed.oauth_nonce).toBeTruthy()
    expect(signed.oauth_timestamp).toBeTruthy()
  })

  it('flickrSignQuery preserves caller-supplied oauth meta fields', () => {
    const signed = flickrSignQuery(
      'GET',
      'https://www.flickr.com/services/rest',
      {
        oauth_consumer_key: 'ck',
        oauth_nonce: 'fixed-nonce',
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: '111',
        oauth_version: '1.0',
        method: 'flickr.test.echo',
      },
      'sec',
      'tok'
    )
    expect(signed.oauth_nonce).toBe('fixed-nonce')
    expect(signed.oauth_timestamp).toBe('111')
    expect(signed.oauth_signature).toBeTruthy()
  })

  it('flickrGetRequestToken parses Flickr request_token responses', async () => {
    vi.mocked(got).mockResolvedValue({
      body: 'oauth_callback_confirmed=true&oauth_token=tok&oauth_token_secret=tsec',
    } as never)
    const out = await flickrGetRequestToken({
      consumerKey: 'ck',
      consumerSecret: 'cs',
      oauthCallback: 'https://cb',
    })
    expect(out).toEqual({ oauthToken: 'tok', oauthTokenSecret: 'tsec' })
    expect(got).toHaveBeenCalled()
  })

  it('flickrGetRequestToken throws when callback is not confirmed', async () => {
    vi.mocked(got).mockResolvedValue({ body: 'oauth_callback_confirmed=false&oauth_token=t' } as never)
    await expect(
      flickrGetRequestToken({ consumerKey: 'ck', consumerSecret: 'cs', oauthCallback: 'https://cb' })
    ).rejects.toThrow(/oauth_callback not confirmed/)
  })

  it('flickrGetRequestToken throws when tokens are missing', async () => {
    vi.mocked(got).mockResolvedValue({ body: 'oauth_callback_confirmed=true' } as never)
    await expect(
      flickrGetRequestToken({ consumerKey: 'ck', consumerSecret: 'cs', oauthCallback: 'https://cb' })
    ).rejects.toThrow(/request_token failed/)
  })

  it('flickrGetAccessToken uses empty fullname when Flickr omits it', async () => {
    vi.mocked(got).mockResolvedValue({
      body: 'oauth_token=at&oauth_token_secret=as&user_nsid=u1&username=j',
    } as never)
    const out = await flickrGetAccessToken({
      consumerKey: 'ck',
      consumerSecret: 'cs',
      oauthToken: 'rt',
      oauthTokenSecret: 'rs',
      oauthVerifier: 'v',
    })
    expect(out.fullname).toBe('')
  })

  it('flickrGetAccessToken maps Flickr fields and normalizes fullname', async () => {
    vi.mocked(got).mockResolvedValue({
      body: 'oauth_token=at&oauth_token_secret=as&user_nsid=u1&username=j&fullname=a+b',
    } as never)
    const out = await flickrGetAccessToken({
      consumerKey: 'ck',
      consumerSecret: 'cs',
      oauthToken: 'rt',
      oauthTokenSecret: 'rs',
      oauthVerifier: 'v',
    })
    expect(out).toMatchObject({
      oauthToken: 'at',
      oauthTokenSecret: 'as',
      userNsid: 'u1',
      username: 'j',
      fullname: 'a b',
    })
  })

  it('flickrGetAccessToken throws when tokens are missing', async () => {
    vi.mocked(got).mockResolvedValue({ body: 'user_nsid=u1' } as never)
    await expect(
      flickrGetAccessToken({
        consumerKey: 'ck',
        consumerSecret: 'cs',
        oauthToken: 'rt',
        oauthTokenSecret: 'rs',
        oauthVerifier: 'v',
      })
    ).rejects.toThrow(/access_token failed/)
  })

  it('flickrGetAccessToken defaults missing user_nsid and username to empty strings', async () => {
    vi.mocked(got).mockResolvedValue({
      body: 'oauth_token=at&oauth_token_secret=as',
    } as never)
    const out = await flickrGetAccessToken({
      consumerKey: 'ck',
      consumerSecret: 'cs',
      oauthToken: 'rt',
      oauthTokenSecret: 'rs',
      oauthVerifier: 'v',
    })
    expect(out.userNsid).toBe('')
    expect(out.username).toBe('')
  })
})
