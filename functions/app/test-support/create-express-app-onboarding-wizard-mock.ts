import { vi } from 'vitest'

vi.mock('../../services/onboarding-wizard-persistence.js', () => ({
  loadOnboardingStateForApi: vi.fn(),
  persistOnboardingWizardState: vi.fn(),
}))
