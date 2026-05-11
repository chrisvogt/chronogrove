'use client'

import { createContext, useContext, useState, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import type { User, Auth, ConfirmationResult } from 'firebase/auth'
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  createUserWithEmailAndPassword,
  RecaptchaVerifier,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
} from 'firebase/auth'
import { isAuthlessPublicStatusSurface } from '@/lib/tenant-api-root-map'
import { getFirebaseApp } from './firebase'
import { apiClient } from './apiClient'
import {
  establishApiSessionCoalesced,
  resetSessionEstablishmentTracking,
  isApiSessionEstablishedForUid,
} from './establishApiSession'

export interface AuthContextValue {
  user: User | null
  /** False while the backend session cookie (and fallback ID token) is being established after Firebase sign-in. */
  apiSessionReady: boolean
  loading: boolean
  error: string | null
  setError: (err: string | null) => void
  signUpWithEmail: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signInWithPhone: (phoneNumber: string) => Promise<ConfirmationResult>
  resendVerificationEmail: () => Promise<void>
  logout: () => Promise<void>
  auth: Auth | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

type AuthProviderProps = Readonly<{
  children: ReactNode
}>

export function AuthProvider({ children }: AuthProviderProps) {
  const pathname = usePathname()
  /** Hostname is stable for same-origin SPA navigations; omit from deps to avoid extra effect runs. */
  const authlessPublicSurface = useMemo(() => {
    const host = typeof window !== 'undefined' ? window.location.hostname : undefined
    return isAuthlessPublicStatusSurface(pathname, host)
  }, [pathname])
  const [user, setUser] = useState<User | null>(null)
  const [apiSessionReady, setApiSessionReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [auth, setAuth] = useState<Auth | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lastEmailVerifiedRef = useRef<boolean | null>(null)
  const previousAuthUidRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let unsubscribeAuth: (() => void) | undefined

    if (authlessPublicSurface) {
      setAuth(null)
      setUser(null)
      setApiSessionReady(true)
      setLoading(false)
      setError(null)
      return () => {
        cancelled = true
      }
    }

    setLoading(true)
    void (async () => {
      try {
        const { auth: a } = await getFirebaseApp()
        if (cancelled) return
        setAuth(a)
        unsubscribeAuth = onAuthStateChanged(a, async (u) => {
          if (cancelled) return
          if (!u) {
            lastEmailVerifiedRef.current = null
            previousAuthUidRef.current = null
            resetSessionEstablishmentTracking()
            apiClient.clearSession()
            setUser(null)
            setApiSessionReady(true)
            setLoading(false)
            return
          }

          if (
            previousAuthUidRef.current !== null &&
            previousAuthUidRef.current !== u.uid
          ) {
            await apiClient.clearStaleSessionCookie()
            resetSessionEstablishmentTracking()
          }
          previousAuthUidRef.current = u.uid

          if (
            lastEmailVerifiedRef.current !== null &&
            lastEmailVerifiedRef.current === false &&
            u.emailVerified === true
          ) {
            resetSessionEstablishmentTracking()
          }
          lastEmailVerifiedRef.current = u.emailVerified

          setUser(u)
          if (!isApiSessionEstablishedForUid(u.uid)) {
            setApiSessionReady(false)
          }
          await establishApiSessionCoalesced(u)
          if (!cancelled) {
            setApiSessionReady(true)
            setLoading(false)
          }
        })
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
      unsubscribeAuth?.()
    }
  }, [authlessPublicSurface])

  const googleProvider = useMemo(() => {
    const p = new GoogleAuthProvider()
    p.setCustomParameters({ hd: 'chrisvogt.me' })
    return p
  }, [])

  const signInWithGoogle = async () => {
    if (!auth) return
    setError(null)
    try {
      const cred = await signInWithPopup(auth, googleProvider)
      await establishApiSessionCoalesced(cred.user)
    } catch (e) {
      const err = e as { message?: string }
      setError(err.message ?? 'Google sign-in failed')
      throw e
    }
  }

  const signUpWithEmail = async (email: string, password: string) => {
    if (!auth) return
    setError(null)
    try {
      await apiClient.clearStaleSessionCookie()
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      await sendEmailVerification(cred.user)
      await establishApiSessionCoalesced(cred.user)
    } catch (e) {
      const err = e as { code?: string; message?: string }
      let msg: string
      switch (err.code) {
        case 'auth/email-already-in-use':
          msg = 'An account with this email already exists.'
          break
        case 'auth/weak-password':
          msg = 'Password should be at least 6 characters.'
          break
        case 'auth/invalid-email':
          msg = 'Invalid email address.'
          break
        default:
          msg = err.message ?? 'Sign-up failed'
      }
      setError(msg)
      throw e
    }
  }

  const signInWithEmail = async (email: string, password: string) => {
    if (!auth) return
    setError(null)
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (e) {
      const err = e as { code?: string; message?: string }
      let msg: string
      switch (err.code) {
        case 'auth/user-not-found':
          msg = 'No account with this email.'
          break
        case 'auth/wrong-password':
          msg = 'Incorrect password.'
          break
        case 'auth/invalid-email':
          msg = 'Invalid email address.'
          break
        default:
          msg = err.message ?? 'Sign-in failed'
      }
      setError(msg)
      throw e
    }
  }

  const signInWithPhone = async (phoneNumber: string) => {
    if (!auth) throw new Error('Auth not ready')
    setError(null)
    const verifier = new RecaptchaVerifier(auth, 'phone-recaptcha', { size: 'invisible' })
    try {
      return await signInWithPhoneNumber(auth, phoneNumber, verifier)
    } catch (e) {
      const err = e as { message?: string }
      setError(err.message ?? 'Phone sign-in failed')
      throw e
    }
  }

  const resendVerificationEmail = async () => {
    if (!auth?.currentUser) throw new Error('Not signed in')
    await sendEmailVerification(auth.currentUser)
  }

  const logout = async () => {
    setError(null)
    try {
      await apiClient.logout()
    } catch {
      // ignore
    }
    if (auth) await signOut(auth)
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      apiSessionReady,
      loading,
      error,
      setError,
      signUpWithEmail,
      signInWithGoogle,
      signInWithEmail,
      signInWithPhone,
      resendVerificationEmail,
      logout,
      auth,
    }),
    [user, apiSessionReady, loading, error, auth]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
