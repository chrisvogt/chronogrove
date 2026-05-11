'use client'

import { useEffect, type ReactNode } from 'react'
import { useTheme } from 'next-themes'
import { useAuth } from '@/auth/AuthContext'
import { apiClient } from '@/auth/apiClient'
import { isChronogroveTheme, normalizeChronogroveThemeId } from '@/theme/chronogroveTheme'

/**
 * After Firebase session is ready, load `settings.theme` from the API and align next-themes.
 * Logout does not reset UI theme (keep last choice until next full load).
 */
type ThemeSyncProps = Readonly<{
  children: ReactNode
}>

export function ThemeSync({ children }: ThemeSyncProps) {
  const { user, apiSessionReady } = useAuth()
  const { setTheme, resolvedTheme } = useTheme()

  useEffect(() => {
    if (!user || !apiSessionReady) return

    let cancelled = false
    ;(async () => {
      try {
        const idToken = await user.getIdToken()
        const res = await apiClient.getJson('/api/user/settings', { idToken })
        if (!res.ok || cancelled) return
        const data = (await res.json()) as { ok?: boolean; payload?: { theme?: string } }
        const t = normalizeChronogroveThemeId(data.payload?.theme)
        if (cancelled) return
        setTheme(t)
      } catch {
        /* keep current next-themes value */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user, apiSessionReady, setTheme])

  useEffect(() => {
    if (!resolvedTheme || !isChronogroveTheme(resolvedTheme)) return
    document.documentElement.dataset.chronogroveTheme = resolvedTheme
  }, [resolvedTheme])

  return <>{children}</>
}
