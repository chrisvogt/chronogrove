'use client'

import { useEffect, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/auth/AuthContext'
import { mustVerifyEmailBeforeConsole } from '@/lib/emailVerificationGate'
import { Layout, type SectionId } from '@/layout/Layout'

function pathnameToSection(pathname: string): SectionId {
  const base = pathname.replace(/\/$/, '') || '/'
  if (base === '/') return 'overview'
  if (base === '/auth') return 'auth'
  if (base === '/status') return 'status'
  if (base === '/endpoints') return 'api'
  if (base === '/sync') return 'sync'
  return 'schema'
}

const sectionToPath: Record<SectionId, string> = {
  overview: '/',
  schema: '/schema/',
  status: '/status/',
  api: '/endpoints/',
  sync: '/sync/',
  auth: '/auth/',
}

export default function MainLayout({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname() ?? '/schema/'
  const router = useRouter()
  const { user, loading } = useAuth()
  const section = pathnameToSection(pathname)

  useEffect(() => {
    if (loading) return
    if (user && mustVerifyEmailBeforeConsole(user)) {
      router.replace('/verify-email/')
      return
    }
    if (!user && section !== 'auth') {
      router.replace('/auth/')
    }
    if (user && section === 'auth' && !mustVerifyEmailBeforeConsole(user)) {
      router.replace('/')
    }
  }, [user, loading, section, router, pathname])

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        <div className="spinner" aria-hidden />
        <span style={{ marginLeft: 12 }}>Loading…</span>
      </div>
    )
  }

  const onSectionChange = (id: SectionId) => {
    router.push(sectionToPath[id])
  }

  return (
    <Layout user={user} activeSection={section} onSectionChange={onSectionChange}>
      {children}
    </Layout>
  )
}
