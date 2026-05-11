import { CHRONOGROVE_GITHUB_REPO } from '@/lib/chronogroveRepo'

export type OverviewQuickLink = { href: string; label: string; external?: boolean }

/**
 * Dashboard hero “quick links”: routes that complement the main nav (not Schema / Status / Try API / Sync).
 */
export function buildOverviewQuickLinks(input: {
  user: unknown
  publicUsername: string | null
}): OverviewQuickLink[] {
  if (input.user == null) {
    return [
      { href: '/docs/', label: 'Docs' },
      { href: '/about/', label: 'About' },
      { href: '/auth/', label: 'Sign in' },
    ]
  }
  const links: OverviewQuickLink[] = [
    { href: '/user-settings/', label: 'Settings' },
    { href: '/docs/', label: 'Docs' },
  ]
  if (input.publicUsername) {
    links.push({
      href: `/u/${encodeURIComponent(input.publicUsername)}/`,
      label: 'Public status page',
    })
  } else {
    links.push({ href: '/onboarding/', label: 'Account setup' })
  }
  links.push({ href: CHRONOGROVE_GITHUB_REPO, label: 'GitHub', external: true })
  return links
}
