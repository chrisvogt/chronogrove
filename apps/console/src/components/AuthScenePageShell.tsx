import type { ReactNode } from 'react'
import { AuthScene } from '@/components/AuthScene'

/** Full-bleed `AuthScene` with foreground content stacked at `z-index: 1` (onboarding, auth, settings). */
export function AuthScenePageShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <AuthScene />
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </>
  )
}
