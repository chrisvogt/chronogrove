/** @vitest-environment jsdom */

import * as React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getTenantDisplayHostMock } = vi.hoisted(() => ({
  getTenantDisplayHostMock: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: (props: { href: string; className?: string; children?: React.ReactNode }) => (
    <a href={props.href} className={props.className}>
      {props.children}
    </a>
  ),
}))

vi.mock('@/components/AuthScene', () => ({
  AuthScene: () => <div data-testid="auth-scene" />,
}))

vi.mock('../components/UserMenu', () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}))

vi.mock('../lib/tenantDisplay', () => ({
  getTenantDisplayHost: getTenantDisplayHostMock,
}))

import { Layout } from './Layout'

describe('Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getTenantDisplayHostMock.mockReturnValue('console.chronogrove.com')
  })

  it('shows the signed-in dashboard navigation and overview copy', async () => {
    const onSectionChange = vi.fn()
    const user = userEvent.setup()

    render(
      <Layout user={{ uid: 'u1' } as never} activeSection="overview" onSectionChange={onSectionChange}>
        <div>dashboard body</div>
      </Layout>,
    )

    expect(screen.getByTestId('auth-scene')).toBeInTheDocument()
    expect(screen.getByTestId('user-menu')).toBeInTheDocument()
    expect(screen.getAllByText('Dashboard')).toHaveLength(2)
    expect(screen.getByText('Schema')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Try API')).toBeInTheDocument()
    expect(screen.getByText('Sync')).toBeInTheDocument()
    expect(
      screen.getByText('Live provider health, snapshot stats, and sync · console.chronogrove.com'),
    ).toBeInTheDocument()
    expect(screen.getByText('Commit unknown')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Dashboard' })[0]!)
    expect(onSectionChange).toHaveBeenCalledWith('overview')

    const menuToggle = screen.getByRole('button', { name: 'Open navigation menu' })
    const overlay = screen.getByRole('button', { name: 'Close navigation menu' })
    expect(overlay).not.toHaveAttribute('data-open')

    await user.click(menuToggle)
    expect(overlay).toHaveAttribute('data-open', 'true')

    await user.click(overlay)
    expect(overlay).not.toHaveAttribute('data-open')
  })

  it('shows auth copy and hides protected nav items for signed-out users on auth', async () => {
    const onSectionChange = vi.fn()
    const user = userEvent.setup()

    render(
      <Layout user={null} activeSection="auth" onSectionChange={onSectionChange}>
        <div>auth body</div>
      </Layout>,
    )

    expect(screen.queryByTestId('auth-scene')).not.toBeInTheDocument()
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
    expect(screen.getByText('Access the Chronogrove console')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(onSectionChange).toHaveBeenCalledWith('auth')
  })

  it('renders the commit link branch when a build sha is available', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_GIT_SHA', 'abc123')
    const { Layout: ReloadedLayout } = await import('./Layout')

    render(
      <ReloadedLayout user={{ uid: 'u1' } as never} activeSection="schema" onSectionChange={vi.fn()}>
        <div>schema body</div>
      </ReloadedLayout>,
    )

    expect(screen.getByText('Commit abc123')).toBeInTheDocument()
    expect(screen.getByText('Public routes, payloads, and authenticated helpers')).toBeInTheDocument()

    vi.unstubAllEnvs()
  })
})
