import type { ReactNode } from 'react'
import Link from 'next/link'

import { CHRONOGROVE_GITHUB_REPO, CHRONOGROVE_LICENSE_URL } from '@/lib/chronogroveRepo'
import styles from './MarketingShell.module.css'

const primaryLinks = [
  { href: '/schema/', label: 'Schema' },
  { href: '/status/', label: 'Status' },
  { href: '/docs/', label: 'Docs' },
]

const secondaryLinks = [
  { href: '/about/', label: 'About' },
  { href: '/privacy/', label: 'Privacy' },
  { href: '/auth/', label: 'Sign in' },
]

const DEFAULT_FOOTER =
  'Chronogrove syncs third-party providers into a JSON API that powers widget experiences on www.chrisvogt.me and in the open-source Gatsby theme; more themes and Web components that call the same API are planned. Maintainer link below.'

export function MarketingShell({
  children,
  footerCopy = DEFAULT_FOOTER,
}: Readonly<{
  children: ReactNode
  /** Full footer paragraph. Defaults to a short factual description. */
  footerCopy?: string
}>) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand}>
            <span className={styles.brandMark} aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M12 22V8.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <path
                  d="M12 8.5 7 4.5M12 8.5 17 4.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M12 13.5 6.5 11M12 13.5 17.5 11"
                  stroke="currentColor"
                  strokeWidth="1.45"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.85"
                />
                <circle cx="12" cy="3" r="1.35" fill="currentColor" opacity="0.9" />
              </svg>
            </span>
            <span className={styles.brandText}>
              <span className={styles.brandWordmark}>
                <span className={styles.brandChrono}>Chrono</span>
                <span className={styles.brandGrove}>grove</span>
              </span>
              <span className={styles.brandByline}>by Chris Vogt</span>
            </span>
          </Link>
          <nav className={styles.nav} aria-label="Primary">
            {primaryLinks.map((link) => (
              <Link key={link.href} href={link.href} className={styles.navLink}>
                {link.label}
              </Link>
            ))}
          </nav>
          <div className={styles.actions}>
            {secondaryLinks.map((link) => (
              <Link key={link.href} href={link.href} className={styles.actionLink}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <p className={styles.footerCopy}>{footerCopy}</p>
          <div className={styles.footerLinks}>
            <a href={CHRONOGROVE_GITHUB_REPO} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href={CHRONOGROVE_LICENSE_URL} target="_blank" rel="noreferrer">
              Apache License 2.0
            </a>
            <a href="https://www.chrisvogt.me" target="_blank" rel="noreferrer">
              Chris Vogt
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
