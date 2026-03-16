import { useAuthStore } from '@/stores/auth'

export function useAuth() {
  const { session, supabaseUser, profile, loading, initialized } = useAuthStore()

  return {
    session,
    user: supabaseUser,
    profile,
    loading,
    initialized,
    isAuthenticated: !!session,
  }
}
