'use client'

import type { ReactNode } from 'react'
import { ThemeProvider } from 'next-themes'
import { AuthProvider } from '@/auth/AuthContext'
import { OnboardingUsernameGate } from '@/components/OnboardingUsernameGate'
import { ThemeSync } from '@/theme/ThemeSync'
import {
  CHRONOGROVE_THEME_STORAGE_KEY,
  CHRONOGROVE_THEMES,
  DEFAULT_THEME,
} from '@/theme/chronogroveTheme'

export function Providers({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme={DEFAULT_THEME}
      themes={[...CHRONOGROVE_THEMES]}
      enableSystem={false}
      storageKey={CHRONOGROVE_THEME_STORAGE_KEY}
      disableTransitionOnChange
    >
      <AuthProvider>
        <OnboardingUsernameGate />
        <ThemeSync>{children}</ThemeSync>
      </AuthProvider>
    </ThemeProvider>
  )
}
