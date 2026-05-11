/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import type { MutableRefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { OnboardingProgressPayload } from './SettingsProfileIdentity'
import {
  SettingsCustomDomainBlock,
  SettingsProfileIdentity,
  SettingsUsernameBlock,
} from './SettingsProfileIdentity'

const apiMocks = vi.hoisted(() => ({
  getJson: vi.fn(),
  putJson: vi.fn(),
}))

vi.mock('@/auth/apiClient', () => ({
  apiClient: {
    getJson: (...args: unknown[]) => apiMocks.getJson(...args),
    putJson: (...args: unknown[]) => apiMocks.putJson(...args),
  },
}))

vi.mock('@/lib/baseUrl', () => ({
  /** Non-empty origin so `fetch(\`/api/...\`)` resolves under jsdom. */
  getAppBaseUrl: () => 'http://localhost',
}))

vi.mock('@/lib/onboardingCnameTarget', () => ({
  getOnboardingCnameTarget: () => 'cname.metrics.example',
}))

vi.mock('@/sections/OnboardingSection.module.css', () => ({
  default: new Proxy(
    {},
    {
      get: (_, prop: string) => prop,
    },
  ),
}))

vi.mock('@/sections/UserSettingsSection.module.css', () => ({
  default: new Proxy(
    {},
    {
      get: (_, prop: string) => prop,
    },
  ),
}))

const getJson = apiMocks.getJson
const putJson = apiMocks.putJson

function jsonResponse(data: unknown, ok = true, status = ok ? 200 : 400): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
  } as Response
}

function mockUser(): User {
  return {
    uid: 'test-settings-profile-uid',
    getIdToken: vi.fn().mockResolvedValue('mock-id-token'),
  } as unknown as User
}

function sampleProgress(overrides: Partial<OnboardingProgressPayload> = {}): OnboardingProgressPayload {
  return {
    currentStep: 'done',
    completedSteps: ['profile'],
    username: null,
    connectedProviderIds: [],
    customDomain: null,
    ...overrides,
  }
}

function setupLoad(progress: OnboardingProgressPayload) {
  getJson.mockResolvedValue(jsonResponse({ payload: progress }))
}

/** Matches the 500ms debounce in `handleUsernameChange` without stubbing `setTimeout` (stubs break React scheduling). */
async function afterUsernameDebounce() {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 800)
  })
}

/** Waits until username check succeeded (`canSaveUsername`); avoids brittle copy matchers. */
async function waitUntilSaveUsernameEnabled() {
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /save username/i })).toBeEnabled()
  })
}

describe('SettingsProfileIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getJson.mockClear()
    putJson.mockClear()
    getJson.mockResolvedValue(jsonResponse({ payload: sampleProgress() }))
    putJson.mockResolvedValue(jsonResponse({ payload: sampleProgress() }))
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows restoring session when api session is not ready', () => {
    render(<SettingsProfileIdentity user={mockUser()} apiSessionReady={false} />)
    expect(screen.getByText(/restoring session/i)).toBeInTheDocument()
  })

  it('loads profile and renders username and domain sections', async () => {
    setupLoad(sampleProgress({ username: 'alice', customDomain: 'api.example.com' }))
    render(<SettingsProfileIdentity user={mockUser()} apiSessionReady />)
    expect(screen.getByText(/loading profile/i)).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^username$/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: /custom api domain/i })).toBeInTheDocument()
    expect(getJson).toHaveBeenCalledWith('/api/onboarding/progress', { idToken: 'mock-id-token' })
  })

  it('shows load error when GET /api/onboarding/progress is not ok', async () => {
    getJson.mockResolvedValue(jsonResponse({}, false, 500))
    render(<SettingsProfileIdentity user={mockUser()} apiSessionReady />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not load profile/i)
    })
  })

  it('shows load error when response has no payload', async () => {
    getJson.mockResolvedValue(jsonResponse({}))
    render(<SettingsProfileIdentity user={mockUser()} apiSessionReady />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/no profile data/i)
    })
  })

  it('domain save sends latest username from progressRef (merged payload)', async () => {
    setupLoad(sampleProgress({ username: 'bob', customDomain: null }))
    putJson.mockResolvedValue(
      jsonResponse({
        payload: sampleProgress({ username: 'bob', customDomain: 'api.bob.dev' }),
      }),
    )
    const user = userEvent.setup()
    render(<SettingsProfileIdentity user={mockUser()} apiSessionReady />)
    await waitFor(() => screen.getByPlaceholderText('api.yourdomain.com'))

    const domainInput = screen.getByPlaceholderText('api.yourdomain.com')
    await user.clear(domainInput)
    await user.type(domainInput, 'api.bob.dev')

    await user.click(screen.getByRole('button', { name: /save domain/i }))

    await waitFor(() => {
      expect(putJson).toHaveBeenCalledWith(
        '/api/onboarding/progress',
        expect.objectContaining({
          username: 'bob',
          customDomain: 'api.bob.dev',
        }),
        { idToken: 'mock-id-token' },
      )
    })
    // Success copy is cleared by the [saved] effect when progress updates; PUT body is the behavior we care about.
  })

  it('username save preserves customDomain from progressRef in PUT body', async () => {
    setupLoad(sampleProgress({ username: null, customDomain: 'legacy.api.example.com' }))
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonResponse({ available: true }) as Awaited<ReturnType<typeof fetch>>,
    )
    putJson.mockResolvedValue(
      jsonResponse({
        payload: sampleProgress({ username: 'newuser', customDomain: 'legacy.api.example.com' }),
      }),
    )

    const user = userEvent.setup()
    render(<SettingsProfileIdentity user={mockUser()} apiSessionReady />)
    await waitFor(() => screen.getByPlaceholderText('your-username'))

    const nameInput = screen.getByPlaceholderText('your-username')
    fireEvent.change(nameInput, { target: { value: 'newuser' } })
    await afterUsernameDebounce()

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    })
    await waitUntilSaveUsernameEnabled()

    await user.click(screen.getByRole('button', { name: /save username/i }))

    await waitFor(() => {
      expect(putJson).toHaveBeenCalledWith(
        '/api/onboarding/progress',
        expect.objectContaining({
          username: 'newuser',
          customDomain: 'legacy.api.example.com',
        }),
        { idToken: 'mock-id-token' },
      )
    })
  })

  it('blocks the other identity save while one request is in flight', async () => {
    setupLoad(sampleProgress({ username: 'alice', customDomain: null }))
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonResponse({ available: true }) as Awaited<ReturnType<typeof fetch>>,
    )
    let finishPut!: (r: Response) => void
    putJson.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finishPut = resolve
        }),
    )

    render(<SettingsProfileIdentity user={mockUser()} apiSessionReady />)
    await waitFor(() => screen.getByPlaceholderText('your-username'))

    fireEvent.change(screen.getByPlaceholderText('your-username'), {
      target: { value: 'alice2' },
    })
    await afterUsernameDebounce()
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    await waitUntilSaveUsernameEnabled()

    fireEvent.click(screen.getByRole('button', { name: /save username/i }))

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /saving/i })).toHaveLength(2)
    })

    fireEvent.change(screen.getByPlaceholderText('api.yourdomain.com'), {
      target: { value: 'api.alice.dev' },
    })
    expect(screen.queryByRole('button', { name: /save domain/i })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /saving/i })).toHaveLength(2)

    finishPut!(
      jsonResponse({
        payload: sampleProgress({ username: 'alice2', customDomain: null }),
      }),
    )

    await waitFor(() => {
      expect(screen.queryAllByRole('button', { name: /saving/i })).toHaveLength(0)
    })
  })

  it('shows domain save error when PUT fails', async () => {
    setupLoad(sampleProgress({ username: 'u', customDomain: null }))
    putJson.mockResolvedValue(jsonResponse({ error: 'domain taken' }, false, 409))

    render(<SettingsProfileIdentity user={mockUser()} apiSessionReady />)
    await waitFor(() => screen.getByPlaceholderText('api.yourdomain.com'))

    const domainInput = screen.getByPlaceholderText('api.yourdomain.com')
    fireEvent.change(domainInput, { target: { value: 'taken.example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /save domain/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/domain taken/i)
    })
  })

  it('shows username save error when PUT fails', async () => {
    setupLoad(sampleProgress({ username: null, customDomain: null }))
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonResponse({ available: true }) as Awaited<ReturnType<typeof fetch>>,
    )
    putJson.mockResolvedValue(jsonResponse({ error: 'bad' }, false, 400))

    const user = userEvent.setup()
    render(<SettingsProfileIdentity user={mockUser()} apiSessionReady />)
    await waitFor(() => screen.getByPlaceholderText('your-username'))

    fireEvent.change(screen.getByPlaceholderText('your-username'), {
      target: { value: 'validusr' },
    })
    await afterUsernameDebounce()
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    await waitUntilSaveUsernameEnabled()

    await user.click(screen.getByRole('button', { name: /save username/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/bad/i)
    })
  })

  it('verify DNS runs check-domain and shows verified state', async () => {
    setupLoad(sampleProgress({ customDomain: 'api.z.test' }))
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonResponse({ verified: true }) as Awaited<ReturnType<typeof fetch>>,
    )

    const user = userEvent.setup()
    render(<SettingsProfileIdentity user={mockUser()} apiSessionReady />)
    await waitFor(() => screen.getByRole('button', { name: /verify dns/i }))

    await user.click(screen.getByRole('button', { name: /verify dns/i }))

    await waitFor(() => {
      expect(screen.getByText(/dns verified/i)).toBeInTheDocument()
    })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/onboarding/check-domain?domain=api.z.test'),
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('shows not-verified when DNS check returns verified false', async () => {
    setupLoad(sampleProgress({ customDomain: 'pending.test' }))
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonResponse({ verified: false }) as Awaited<ReturnType<typeof fetch>>,
    )

    const user = userEvent.setup()
    render(<SettingsProfileIdentity user={mockUser()} apiSessionReady />)
    await waitFor(() => screen.getByRole('button', { name: /verify dns/i }))
    await user.click(screen.getByRole('button', { name: /verify dns/i }))

    await waitFor(() => {
      expect(screen.getByText(/not verified yet/i)).toBeInTheDocument()
    })
  })

  it('shows DNS verification error when check-domain fails', async () => {
    setupLoad(sampleProgress({ customDomain: 'bad.test' }))
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonResponse({}, false, 500) as Awaited<ReturnType<typeof fetch>>,
    )

    const user = userEvent.setup()
    render(<SettingsProfileIdentity user={mockUser()} apiSessionReady />)
    await waitFor(() => screen.getByRole('button', { name: /verify dns/i }))
    await user.click(screen.getByRole('button', { name: /verify dns/i }))

    await waitFor(() => {
      expect(screen.getByText(/verification failed/i)).toBeInTheDocument()
    })
  })

  it('username availability check handles fetch failure', async () => {
    setupLoad(sampleProgress({ username: null, customDomain: null }))
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('network'))

    render(<SettingsProfileIdentity user={mockUser()} apiSessionReady />)
    await waitFor(() => screen.getByPlaceholderText('your-username'))

    const input = screen.getByPlaceholderText('your-username')
    fireEvent.change(input, { target: { value: 'abcuser' } })
    await waitFor(() => expect(input).toHaveValue('abcuser'))
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/onboarding/check-username?username=abcuser'),
        expect.anything(),
      ),
    )

    await waitFor(() => {
      expect(
        screen.getByText(/could not check availability/i),
      ).toBeInTheDocument()
    })
  })

  it('username check uses anonymous path when getIdToken throws', async () => {
    setupLoad(sampleProgress({ username: null, customDomain: null }))
    const userNoToken = {
      getIdToken: vi
        .fn()
        // Strict Mode runs the progress load effect twice; both need a token before we simulate failure on the username check.
        .mockResolvedValueOnce('mock-id-token')
        .mockResolvedValueOnce('mock-id-token')
        .mockRejectedValue(new Error('no token')),
    } as unknown as User
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonResponse({ available: true }) as Awaited<ReturnType<typeof fetch>>,
    )

    render(<SettingsProfileIdentity user={userNoToken} apiSessionReady />)
    await waitFor(() => screen.getByPlaceholderText('your-username'))

    fireEvent.change(screen.getByPlaceholderText('your-username'), {
      target: { value: 'tokusr' },
    })
    await afterUsernameDebounce()

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    })
  })

  it('marks username invalid when the pattern fails after debounce', async () => {
    setupLoad(sampleProgress({ username: null, customDomain: null }))
    render(<SettingsProfileIdentity user={mockUser()} apiSessionReady />)
    await waitFor(() => screen.getByPlaceholderText('your-username'))

    fireEvent.change(screen.getByPlaceholderText('your-username'), {
      target: { value: '_bad' },
    })
    await afterUsernameDebounce()

    await waitFor(() => {
      expect(screen.getByText(/must start and end/i)).toBeInTheDocument()
    })
  })

  it('shows taken when check-username reports unavailable', async () => {
    setupLoad(sampleProgress({ username: null, customDomain: null }))
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonResponse({ available: false }) as Awaited<ReturnType<typeof fetch>>,
    )
    render(<SettingsProfileIdentity user={mockUser()} apiSessionReady />)
    await waitFor(() => screen.getByPlaceholderText('your-username'))

    fireEvent.change(screen.getByPlaceholderText('your-username'), {
      target: { value: 'takenone' },
    })
    await afterUsernameDebounce()

    await waitFor(() => {
      expect(screen.getByText(/already taken/i)).toBeInTheDocument()
    })
  })

  it('shows username check error when check-username returns non-OK', async () => {
    setupLoad(sampleProgress({ username: null, customDomain: null }))
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonResponse({ available: true }, false, 500) as Awaited<ReturnType<typeof fetch>>,
    )
    render(<SettingsProfileIdentity user={mockUser()} apiSessionReady />)
    await waitFor(() => screen.getByPlaceholderText('your-username'))

    const input = screen.getByPlaceholderText('your-username')
    fireEvent.change(input, { target: { value: 'httpfail' } })
    await waitFor(() => expect(input).toHaveValue('httpfail'))
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/onboarding/check-username?username=httpfail'),
        expect.anything(),
      ),
    )

    await waitFor(() => {
      expect(screen.getByText(/could not check availability/i)).toBeInTheDocument()
    })
  })

  it('does not schedule a check when the draft is edited back to the saved username', async () => {
    setupLoad(sampleProgress({ username: 'alice', customDomain: null }))
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonResponse({ available: true }) as Awaited<ReturnType<typeof fetch>>,
    )
    render(<SettingsProfileIdentity user={mockUser()} apiSessionReady />)
    await waitFor(() => screen.getByPlaceholderText('your-username'))

    const input = screen.getByPlaceholderText('your-username')
    fireEvent.change(input, { target: { value: 'alice2' } })
    await afterUsernameDebounce()
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())

    vi.mocked(globalThis.fetch).mockClear()
    fireEvent.change(input, { target: { value: 'alice' } })
    await afterUsernameDebounce()

    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('can save clearing the username (advanced) with username null in PUT body', async () => {
    setupLoad(sampleProgress({ username: 'clearme', customDomain: null }))
    putJson.mockResolvedValue(
      jsonResponse({
        payload: sampleProgress({ username: null, customDomain: null }),
      }),
    )
    const user = userEvent.setup()
    render(<SettingsProfileIdentity user={mockUser()} apiSessionReady />)
    await waitFor(() => screen.getByPlaceholderText('your-username'))

    const nameInput = screen.getByPlaceholderText('your-username')
    // Use userEvent + explicit waits: fireEvent.change + user.click can race on slow CI
    // (click runs before React commits '', Save stays disabled, putJson never fires).
    await user.clear(nameInput)
    await waitFor(() => expect(nameInput).toHaveValue(''))
    await waitUntilSaveUsernameEnabled()

    await user.click(screen.getByRole('button', { name: /save username/i }))

    await waitFor(() => {
      expect(putJson).toHaveBeenCalledWith(
        '/api/onboarding/progress',
        expect.objectContaining({ username: null }),
        { idToken: 'mock-id-token' },
      )
    })
  })

  it('unmount clears DNS polling timers', async () => {
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    setupLoad(sampleProgress({ customDomain: 'poll.test' }))
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonResponse({ verified: false }) as Awaited<ReturnType<typeof fetch>>,
    )

    const user = userEvent.setup()
    const { unmount } = render(<SettingsProfileIdentity user={mockUser()} apiSessionReady />)
    await waitFor(() => screen.getByRole('button', { name: /verify dns/i }))
    await user.click(screen.getByRole('button', { name: /verify dns/i }))
    await waitFor(() => expect(intervalSpy).toHaveBeenCalled())
    unmount()
    intervalSpy.mockRestore()
  })

  it('DNS polling interval re-invokes check-domain (covers interval callback)', async () => {
    setupLoad(sampleProgress({ customDomain: 'interval.coverage.test' }))
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonResponse({ verified: false }) as Awaited<ReturnType<typeof fetch>>,
    )

    const realSetInterval = globalThis.setInterval.bind(globalThis)
    const intervalSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation((handler, timeout) => {
      if (timeout === 15_000 && typeof handler === 'function') {
        queueMicrotask(() => {
          ;(handler as () => void)()
        })
        return 77_777 as unknown as ReturnType<typeof setInterval>
      }
      return realSetInterval(handler as TimerHandler, timeout as number)
    })

    try {
      const user = userEvent.setup()
      render(<SettingsProfileIdentity user={mockUser()} apiSessionReady />)
      await waitFor(() => screen.getByRole('button', { name: /verify dns/i }))
      await user.click(screen.getByRole('button', { name: /verify dns/i }))

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledTimes(2)
      })
      expect(globalThis.fetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('/api/onboarding/check-domain?domain=interval.coverage.test'),
        expect.objectContaining({ method: 'GET' }),
      )
    } finally {
      intervalSpy.mockRestore()
    }
  })

  it('shows generic load error when progress GET rejects with a non-Error', async () => {
    getJson.mockRejectedValue('not-an-error-instance')
    render(<SettingsProfileIdentity user={mockUser()} apiSessionReady />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/load failed/i)
    })
  })

  it('re-fetches when Firebase user uid changes without dropping into full-page loading', async () => {
    const userA = { ...mockUser(), uid: 'settings-uid-a' } as User
    const userB = { ...mockUser(), uid: 'settings-uid-b' } as User

    getJson.mockResolvedValueOnce(jsonResponse({ payload: sampleProgress({ username: 'alpha' }) }))
    const { rerender } = render(<SettingsProfileIdentity user={userA} apiSessionReady />)
    await waitFor(() => expect(screen.getByDisplayValue('alpha')).toBeInTheDocument())

    getJson.mockResolvedValueOnce(jsonResponse({ payload: sampleProgress({ username: 'bravo' }) }))
    rerender(<SettingsProfileIdentity user={userB} apiSessionReady />)

    await waitFor(() => expect(screen.getByDisplayValue('bravo')).toBeInTheDocument())
    expect(getJson).toHaveBeenCalled()
  })

  it('username save onClick swallows rejection when PUT throws (covers defensive catch)', async () => {
    setupLoad(sampleProgress({ username: null, customDomain: null }))
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonResponse({ available: true }) as Awaited<ReturnType<typeof fetch>>,
    )
    putJson.mockRejectedValue(new Error('network down'))

    const user = userEvent.setup()
    render(<SettingsProfileIdentity user={mockUser()} apiSessionReady />)
    await waitFor(() => screen.getByPlaceholderText('your-username'))

    fireEvent.change(screen.getByPlaceholderText('your-username'), {
      target: { value: 'throwusr' },
    })
    await afterUsernameDebounce()
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    await waitUntilSaveUsernameEnabled()

    await user.click(screen.getByRole('button', { name: /save username/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save username/i })).toBeEnabled()
    })
  })

  it('domain save onClick swallows rejection when PUT throws (covers defensive catch)', async () => {
    setupLoad(sampleProgress({ username: 'u', customDomain: null }))
    putJson.mockRejectedValue(new Error('network down'))

    render(<SettingsProfileIdentity user={mockUser()} apiSessionReady />)
    await waitFor(() => screen.getByPlaceholderText('api.yourdomain.com'))

    fireEvent.change(screen.getByPlaceholderText('api.yourdomain.com'), {
      target: { value: 'api.throw.test' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save domain/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save domain/i })).toBeEnabled()
    })
  })

  it('username save succeeds when PUT body JSON fails but response is OK (putOnboarding json catch)', async () => {
    setupLoad(sampleProgress({ username: null, customDomain: null }))
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonResponse({ available: true }) as Awaited<ReturnType<typeof fetch>>,
    )
    putJson.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('malformed')),
    } as unknown as Response)

    const user = userEvent.setup()
    render(<SettingsProfileIdentity user={mockUser()} apiSessionReady />)
    await waitFor(() => screen.getByPlaceholderText('your-username'))

    fireEvent.change(screen.getByPlaceholderText('your-username'), {
      target: { value: 'jsonusr' },
    })
    await afterUsernameDebounce()
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    await waitUntilSaveUsernameEnabled()

    await user.click(screen.getByRole('button', { name: /save username/i }))

    await waitFor(() => {
      expect(screen.getByText(/username updated/i)).toBeInTheDocument()
    })
  })
})

describe('SettingsUsernameBlock (progressRef guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    putJson.mockClear()
    putJson.mockResolvedValue(jsonResponse({ payload: sampleProgress() }))
    globalThis.fetch = vi.fn()
  })

  it('does not call PUT when progressRef.current is null', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonResponse({ available: true }) as Awaited<ReturnType<typeof fetch>>,
    )
    const progressRef: MutableRefObject<OnboardingProgressPayload | null> = { current: null }
    const runIdentitySave = async <T,>(fn: () => Promise<T>) => fn()
    render(
      <SettingsUsernameBlock
        user={mockUser()}
        progress={sampleProgress()}
        progressRef={progressRef}
        baseUrl="http://localhost"
        onProgressUpdated={vi.fn()}
        runIdentitySave={runIdentitySave}
        isSaving={false}
        subsectionClassName="sub"
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('your-username'), {
      target: { value: 'abcuser' },
    })
    await afterUsernameDebounce()
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    await waitUntilSaveUsernameEnabled()

    await userEvent.click(screen.getByRole('button', { name: /save username/i }))

    expect(putJson).not.toHaveBeenCalled()
  })
})

describe('SettingsCustomDomainBlock (progressRef guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    putJson.mockClear()
    putJson.mockResolvedValue(jsonResponse({ payload: sampleProgress() }))
  })

  it('does not call PUT when progressRef.current is null', async () => {
    const progressRef: MutableRefObject<OnboardingProgressPayload | null> = { current: null }
    const runIdentitySave = async <T,>(fn: () => Promise<T>) => fn()
    render(
      <SettingsCustomDomainBlock
        user={mockUser()}
        progress={sampleProgress({ customDomain: 'x.com' })}
        progressRef={progressRef}
        baseUrl="http://localhost"
        onProgressUpdated={vi.fn()}
        runIdentitySave={runIdentitySave}
        isSaving={false}
      />,
    )

    const user = userEvent.setup()
    await user.clear(screen.getByPlaceholderText('api.yourdomain.com'))
    await user.type(screen.getByPlaceholderText('api.yourdomain.com'), 'y.com')
    await user.click(screen.getByRole('button', { name: /save domain/i }))

    expect(putJson).not.toHaveBeenCalled()
  })
})
