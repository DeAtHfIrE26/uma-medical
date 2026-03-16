import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Session, User as SupabaseUser } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { User } from '@/types'

interface AuthState {
  session: Session | null
  supabaseUser: SupabaseUser | null
  profile: User | null
  loading: boolean
  initialized: boolean
  setSession: (session: Session | null) => void
  setProfile: (profile: User | null) => void
  setLoading: (loading: boolean) => void
  setInitialized: (v: boolean) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      supabaseUser: null,
      profile: null,
      loading: true,
      initialized: false,
      setSession: (session) =>
        set({ session, supabaseUser: session?.user ?? null }),
      setProfile: (profile) => set({ profile }),
      setLoading: (loading) => set({ loading }),
      setInitialized: (initialized) => set({ initialized }),
      clear: () =>
        set({ session: null, supabaseUser: null, profile: null }),
    }),
    {
      name: 'uma-auth-store',
      partialize: (state) => ({
        profile: state.profile,
      }),
    }
  )
)

// ─── Initialize auth listener ─────────────────────────────────────────────────

export function initializeAuth() {
  const store = useAuthStore.getState()

  supabase.auth.getSession()
    .then(({ data: { session } }) => {
      store.setSession(session)
      store.setLoading(false)
      store.setInitialized(true)

      if (session?.user) {
        loadProfile(session.user.id)
      }
    })
    .catch(() => {
      // Never leave the app in a permanent loading state.
      store.setSession(null)
      store.setLoading(false)
      store.setInitialized(true)
    })

  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (_event, session) => {
      store.setSession(session)
      store.setLoading(false)

      if (session?.user) {
        await loadProfile(session.user.id)
      } else {
        store.setProfile(null)
        store.clear()
      }
    }
  )

  return () => subscription.unsubscribe()
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)
    }),
  ])
}

export async function resolveActiveUserId(): Promise<string | null> {
  const store = useAuthStore.getState()

  if (store.session?.user?.id) {
    return store.session.user.id
  }

  // Give the auth listener a brief chance to hydrate the store after a reload.
  for (let i = 0; i < 5; i++) {
    await delay(150)
    const hydrated = useAuthStore.getState().session?.user?.id
    if (hydrated) return hydrated
  }

  try {
    const { data: { session } } = await withTimeout(supabase.auth.getSession(), 2500)
    if (session?.user?.id) {
      useAuthStore.getState().setSession(session)
      return session.user.id
    }
  } catch {
    // Fall through and let caller show a friendly re-login message.
  }

  return null
}

async function loadProfile(userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (data) {
    useAuthStore.getState().setProfile(data as User)
  }
}
