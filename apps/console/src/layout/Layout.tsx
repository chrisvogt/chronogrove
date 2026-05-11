'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import type { User } from 'firebase/auth'

import { AuthScene } from '@/components/AuthScene'
import { CHRONOGROVE_LICENSE_URL } from '@/lib/chronogroveRepo'
import { getTenantDisplayHost } from '../lib/tenantDisplay'
import { UserMenu } from '../components/UserMenu'
import styles from './Layout.module.css'

export type SectionId = 'overview' | 'schema' | 'status' | 'api' | 'sync' | 'auth'

export interface LayoutProps {
  children: ReactNode
  user: User | null
  activeSection: SectionId
  onSectionChange: (section: SectionId) => void
}

const navItems: Array<{
  id: Exclude<SectionId, 'auth'>
  label: string
  icon: ReactNode
  requiresAuth?: boolean
}> = [
  {
    id: 'overview',
    label: 'Dashboard',
    requiresAuth: true,
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden>
        <path d="M4 10 10 5l6 5M6.5 9.5V15h7V9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'schema',
    label: 'Schema',
    requiresAuth: true,
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden>
        <path d="M5 4.5h10m-10 5h10m-10 5h6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'status',
    label: 'Status',
    requiresAuth: true,
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden>
        <path d="M4 13.5 7.5 10l2.5 2.5L16 6.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'api',
    label: 'Try API',
    requiresAuth: true,
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden>
        <path d="M7 6.5 3.5 10 7 13.5M13 6.5 16.5 10 13 13.5M11 4 9 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'sync',
    label: 'Sync',
    requiresAuth: true,
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden>
        <path d="M5 10a5 5 0 0 1 8.53-3.53M15 10a5 5 0 0 1-8.53 3.53M13.5 3.5v3h-3M6.5 16.5v-3h3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
]

const sectionCopy: Record<SectionId, { label: string; kicker: string }> = {
  overview: { label: 'Dashboard', kicker: '' }, // kicker filled in Layout with tenant host
  schema: { label: 'Schema', kicker: 'Public routes, payloads, and authenticated helpers' },
  status: { label: 'Status', kicker: 'Fast checks for the public-facing API surface' },
  api: { label: 'Try API', kicker: 'Session helpers and endpoint testing for signed-in operators' },
  sync: { label: 'Sync', kicker: 'Manual provider runs with live progress and final payloads' },
  auth: { label: 'Sign in', kicker: 'Access the Chronogrove console' },
}
const buildSha = process.env.NEXT_PUBLIC_GIT_SHA
const buildCommitUrl = buildSha
  ? `https://github.com/chrisvogt/chronogrove/commit/${buildSha}`
  : null

export function Layout({ children, user, activeSection, onSectionChange }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const tenantHost = getTenantDisplayHost()
  const activeCopy =
    activeSection === 'overview'
      ? {
          label: sectionCopy.overview.label,
          kicker: `Live provider health, snapshot stats, and sync · ${tenantHost || 'Chronogrove'}`,
        }
      : sectionCopy[activeSection]

  return (
    <div className={styles.dashboard}>
      {activeSection !== 'auth' ? <AuthScene /> : null}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <Link href="/" className={styles.logoLink}>
            <span className={styles.logo}>CHRONOGROVE</span>
          </Link>
          <span className={styles.logoTag}>Core data service</span>
          {buildCommitUrl ? (
            <a
              href={buildCommitUrl}
              className={styles.logoSub}
              title="Open the GitHub commit for this UI build"
              target="_blank"
              rel="noreferrer"
            >
              Commit {buildSha}
            </a>
          ) : (
            <span className={styles.logoSub} title="Git commit when this UI was built">
              Commit unknown
            </span>
          )}
        </div>
        <nav className={styles.nav}>
          <div className={styles.navSection}>
            {navItems.map((item) =>
              !item.requiresAuth || user ? (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.navItem} ${activeSection === item.id ? styles.navItemActive : ''}`}
                  onClick={() => {
                    setSidebarOpen(false)
                    onSectionChange(item.id)
                  }}
                  aria-current={activeSection === item.id ? 'page' : undefined}
                >
                  <span className={styles.navIcon}>{item.icon}</span>
                  {item.label}
                </button>
              ) : null
            )}
          </div>
          <div className={styles.navSection}>
            <p className={styles.navHeading}>More</p>
            <Link href="/about/" className={styles.navLink}>
              About
            </Link>
            <Link href="/docs/" className={styles.navLink}>
              Docs
            </Link>
            <Link href="/privacy/" className={styles.navLink}>
              Privacy
            </Link>
            <a
              href={CHRONOGROVE_LICENSE_URL}
              className={`${styles.navLink} ${styles.navLinkExternal}`}
              target="_blank"
              rel="noreferrer"
            >
              License
              <svg
                className={styles.externalLinkIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
              </svg>
              <span className={styles.srOnly}>(opens in new tab)</span>
            </a>
          </div>
        </nav>
      </aside>
      <div className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <button
              type="button"
              className={styles.menuToggle}
              onClick={() => setSidebarOpen((o) => !o)}
              aria-label="Open navigation menu"
            >
              <svg className={styles.menuIcon} viewBox="0 0 24 24" aria-hidden>
                <path d="M5 7h14M5 12h14M5 17h10" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className={styles.headerCenter}>
            <p className={styles.sectionLabel}>{activeCopy.label}</p>
            <p className={styles.sectionKicker}>{activeCopy.kicker}</p>
          </div>
          <div className={styles.headerRight}>
            {user ? (
              <UserMenu user={user} />
            ) : (
              <button type="button" className={styles.signInBtn} onClick={() => onSectionChange('auth')}>
                Sign in
              </button>
            )}
          </div>
        </header>
        <div className={styles.content}>{children}</div>
      </div>
      <button
        type="button"
        className={styles.overlay}
        data-open={sidebarOpen ? 'true' : undefined}
        aria-label="Close navigation menu"
        tabIndex={sidebarOpen ? 0 : -1}
        onClick={() => setSidebarOpen(false)}
      />
    </div>
  )
}
