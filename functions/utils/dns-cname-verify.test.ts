import { afterEach, describe, expect, it, vi } from 'vitest'
import dns from 'dns'

import { hostnameCnameChainsTo } from './dns-cname-verify.js'

describe('hostnameCnameChainsTo', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true when the first CNAME equals the target', async () => {
    vi.spyOn(dns.promises, 'resolveCname').mockResolvedValue(['personal-stats-chrisvogt.web.app'])

    await expect(
      hostnameCnameChainsTo('widgets.example.com', 'personal-stats-chrisvogt.web.app')
    ).resolves.toBe(true)
  })

  it('normalizes trailing dots on the target', async () => {
    vi.spyOn(dns.promises, 'resolveCname').mockResolvedValue(['personal-stats-chrisvogt.web.app.'])

    await expect(
      hostnameCnameChainsTo('widgets.example.com', 'personal-stats-chrisvogt.web.app')
    ).resolves.toBe(true)
  })

  it('follows a multi-hop CNAME chain', async () => {
    vi.spyOn(dns.promises, 'resolveCname')
      .mockResolvedValueOnce(['hop.example.net'])
      .mockResolvedValueOnce(['personal-stats-chrisvogt.web.app'])

    await expect(
      hostnameCnameChainsTo('widgets.example.com', 'personal-stats-chrisvogt.web.app')
    ).resolves.toBe(true)
  })

  it('returns false when resolveCname has no path to the target', async () => {
    vi.spyOn(dns.promises, 'resolveCname').mockResolvedValue(['wrong.example.com'])

    await expect(
      hostnameCnameChainsTo('widgets.example.com', 'personal-stats-chrisvogt.web.app')
    ).resolves.toBe(false)
  })

  it('returns false on ENOTFOUND', async () => {
    const err = Object.assign(new Error('not found'), { code: 'ENOTFOUND' as const })
    vi.spyOn(dns.promises, 'resolveCname').mockRejectedValue(err)

    await expect(
      hostnameCnameChainsTo('widgets.example.com', 'personal-stats-chrisvogt.web.app')
    ).resolves.toBe(false)
  })

  it('returns false on ENODATA', async () => {
    const err = Object.assign(new Error('no data'), { code: 'ENODATA' as const })
    vi.spyOn(dns.promises, 'resolveCname').mockRejectedValue(err)

    await expect(
      hostnameCnameChainsTo('widgets.example.com', 'personal-stats-chrisvogt.web.app')
    ).resolves.toBe(false)
  })

  it('follows the first record when multiple CNAMEs are returned and none match the target yet', async () => {
    vi.spyOn(dns.promises, 'resolveCname')
      .mockResolvedValueOnce(['hop-a.example.com', 'hop-b.example.com'])
      .mockResolvedValueOnce(['personal-stats-chrisvogt.web.app'])

    await expect(
      hostnameCnameChainsTo('start.example.com', 'personal-stats-chrisvogt.web.app')
    ).resolves.toBe(true)
  })

  it('returns true when hostname already equals target', async () => {
    const spy = vi.spyOn(dns.promises, 'resolveCname')

    await expect(
      hostnameCnameChainsTo(
        'personal-stats-chrisvogt.web.app',
        'personal-stats-chrisvogt.web.app'
      )
    ).resolves.toBe(true)

    expect(spy).not.toHaveBeenCalled()
  })

  it('rethrows when resolveCname fails with a non-ENOTFOUND error', async () => {
    vi.spyOn(dns.promises, 'resolveCname').mockRejectedValue(new Error('SERVFAIL'))

    await expect(
      hostnameCnameChainsTo('widgets.example.com', 'personal-stats-chrisvogt.web.app')
    ).rejects.toThrow('SERVFAIL')
  })

  it('rethrows when the DNS error object has a non-string code', async () => {
    vi.spyOn(dns.promises, 'resolveCname').mockRejectedValue({ code: 1 })

    await expect(
      hostnameCnameChainsTo('widgets.example.com', 'personal-stats-chrisvogt.web.app')
    ).rejects.toEqual({ code: 1 })
  })

  it('returns false when max hops are exhausted without reaching the target', async () => {
    vi.spyOn(dns.promises, 'resolveCname')
      .mockResolvedValueOnce(['hop1.example.com'])
      .mockResolvedValueOnce(['hop2.example.com'])

    await expect(
      hostnameCnameChainsTo('start.example.com', 'personal-stats-chrisvogt.web.app', 2)
    ).resolves.toBe(false)
  })
})
