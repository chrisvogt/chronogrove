import { vi } from 'vitest'

vi.mock('express-rate-limit', () => ({
  rateLimit: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}))
