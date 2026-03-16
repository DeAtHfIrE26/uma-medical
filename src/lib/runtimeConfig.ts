const REQUIRED_PUBLIC_ENV = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
] as const

export function getMissingPublicEnv(): string[] {
  return REQUIRED_PUBLIC_ENV.filter((key) => {
    const value = import.meta.env[key]
    return typeof value !== 'string' || value.trim().length === 0
  })
}

export function getRuntimeConfigError(): string | null {
  const missing = getMissingPublicEnv()

  if (missing.length === 0) {
    return null
  }

  return `Missing required environment variables: ${missing.join(', ')}`
}
