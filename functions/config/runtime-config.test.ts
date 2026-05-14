import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('runtime config', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('bootstraps local runtime env through backend-config', async () => {
    const loadLocalDevelopmentEnv = vi.fn()

    vi.doMock('./backend-config.js', () => ({
      hasAppliedRuntimeConfig: vi.fn(() => false),
      loadLocalDevelopmentEnv,
      markRuntimeConfigApplied: vi.fn(),
    }))

    const { bootstrapLocalRuntimeEnv } = await import('./runtime-config.js')
    const runtimeEnvPath = join(tmpdir(), 'chronogrove-functions.env')
    bootstrapLocalRuntimeEnv(runtimeEnvPath)

    expect(loadLocalDevelopmentEnv).toHaveBeenCalledWith(runtimeEnvPath)
  })

  it('skips loading when runtime config was already applied', async () => {
    const markRuntimeConfigApplied = vi.fn()

    vi.doMock('./backend-config.js', () => ({
      hasAppliedRuntimeConfig: vi.fn(() => true),
      loadLocalDevelopmentEnv: vi.fn(),
      markRuntimeConfigApplied,
    }))

    const { ensureRuntimeConfigApplied } = await import('./runtime-config.js')
    const source = {
      name: 'TEST_CONFIG',
      load: vi.fn(),
      applyToEnv: vi.fn(),
    }

    await ensureRuntimeConfigApplied(source, vi.fn())

    expect(source.load).not.toHaveBeenCalled()
    expect(source.applyToEnv).not.toHaveBeenCalled()
    expect(markRuntimeConfigApplied).not.toHaveBeenCalled()
  })

  it('loads, applies, and marks runtime config when needed', async () => {
    const markRuntimeConfigApplied = vi.fn()

    vi.doMock('./backend-config.js', () => ({
      hasAppliedRuntimeConfig: vi.fn(() => false),
      loadLocalDevelopmentEnv: vi.fn(),
      markRuntimeConfigApplied,
    }))

    const { ensureRuntimeConfigApplied } = await import('./runtime-config.js')
    const source = {
      name: 'TEST_CONFIG',
      load: vi.fn(async () => ({ token: 'secret' })),
      applyToEnv: vi.fn(),
    }

    await ensureRuntimeConfigApplied(source, vi.fn())

    expect(source.load).toHaveBeenCalledTimes(1)
    expect(source.applyToEnv).toHaveBeenCalledWith({ token: 'secret' })
    expect(markRuntimeConfigApplied).toHaveBeenCalledTimes(1)
  })

  it('warns when loading runtime config fails', async () => {
    vi.doMock('./backend-config.js', () => ({
      hasAppliedRuntimeConfig: vi.fn(() => false),
      loadLocalDevelopmentEnv: vi.fn(),
      markRuntimeConfigApplied: vi.fn(),
    }))

    const { ensureRuntimeConfigApplied } = await import('./runtime-config.js')
    const warn = vi.fn()

    await ensureRuntimeConfigApplied(
      {
        name: 'TEST_CONFIG',
        load: vi.fn(() => {
          throw new Error('Config unavailable')
        }),
        applyToEnv: vi.fn(),
      },
      warn
    )

    expect(warn).toHaveBeenCalledWith(
      'Could not load TEST_CONFIG (e.g. local dev with .env)',
      { message: 'Config unavailable' }
    )
  })

  it('warns with String(err) when load throws a non-Error', async () => {
    vi.doMock('./backend-config.js', () => ({
      hasAppliedRuntimeConfig: vi.fn(() => false),
      loadLocalDevelopmentEnv: vi.fn(),
      markRuntimeConfigApplied: vi.fn(),
    }))

    const { ensureRuntimeConfigApplied } = await import('./runtime-config.js')
    const warn = vi.fn()

    await ensureRuntimeConfigApplied(
      {
        name: 'THROW_STRING',
        load: () => {
          throw 'not-an-error-object'
        },
        applyToEnv: vi.fn(),
      },
      warn,
    )

    expect(warn).toHaveBeenCalledWith(
      'Could not load THROW_STRING (e.g. local dev with .env)',
      { message: 'not-an-error-object' },
    )
  })
})
