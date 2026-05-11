'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { useAuth } from '@/auth/AuthContext'
import { CHRONOGROVE_THEMES } from '@/theme/chronogroveTheme'
import { CHRONOGROVE_THEME_INFO } from '@/theme/chronogroveThemeInfo'
import { useChronogroveThemePersist } from '@/theme/useChronogroveThemePersist'
import styles from './UserMenu.module.css'

function userInitial(user: User): string {
  const fromName = user.displayName?.trim().charAt(0)
  if (fromName) return fromName.toUpperCase()
  const fromEmail = user.email?.trim().charAt(0)
  return fromEmail ? fromEmail.toUpperCase() : '?'
}

export function UserMenu({ user }: Readonly<{ user: User }>) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const { logout } = useAuth()
  const { activeTheme, persist } = useChronogroveThemePersist()

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="user-menu-popover"
        id="user-menu-button"
        onClick={() => setOpen((o) => !o)}
      >
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt=""
            className={styles.avatar}
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className={styles.avatarPlaceholder} aria-hidden>
            {userInitial(user)}
          </span>
        )}
        <span className={styles.chevron} aria-hidden>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M3 4.5 6 7.5 9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {open ? (
        <div
          className={styles.menu}
          id="user-menu-popover"
          role="menu"
          aria-labelledby="user-menu-button"
        >
          <p className={styles.menuSectionLabel} id="user-menu-theme-label">
            Theme
          </p>
          <fieldset className={styles.menuThemeFieldset} aria-labelledby="user-menu-theme-label">
            {CHRONOGROVE_THEMES.map((id) => (
            <button
              key={id}
              type="button"
              className={`${styles.menuItem} ${activeTheme === id ? styles.menuItemActive : ''}`}
              role="menuitemradio"
              aria-checked={activeTheme === id}
              onClick={() => {
                persist(id).catch(() => {})
              }}
            >
              <span className={styles.menuItemText}>{CHRONOGROVE_THEME_INFO[id].menuLabel}</span>
              {activeTheme === id ? (
                <span className={styles.menuCheck} aria-hidden>
                  ✓
                </span>
              ) : null}
            </button>
            ))}
          </fieldset>
          <div className={styles.menuDivider} />
          <Link
            href="/user-settings/"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Settings…
          </Link>
          <button
            type="button"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => {
              setOpen(false)
              logout().catch(() => {})
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  )
}
