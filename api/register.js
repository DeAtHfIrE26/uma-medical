import { createClient } from '@supabase/supabase-js'

export const config = {
  maxDuration: 30,
}

function json(res, statusCode, body) {
  res.status(statusCode).setHeader('Content-Type', 'application/json')
  res.send(JSON.stringify(body))
}

function getEnv(name) {
  return process.env[name]
}

function getConfig() {
  const url = getEnv('VITE_SUPABASE_URL')
  const anonKey = getEnv('VITE_SUPABASE_ANON_KEY')
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !anonKey || !serviceRoleKey) {
    return null
  }

  return { url, anonKey, serviceRoleKey }
}

function validateInput({ email, password, fullName, inviteCode }) {
  if (!email || !password || !fullName || !inviteCode) {
    return 'All registration fields are required'
  }

  if (typeof email !== 'string' || !email.includes('@')) {
    return 'Enter a valid email address'
  }

  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters'
  }

  if (typeof fullName !== 'string' || fullName.trim().length < 2) {
    return 'Enter your full name'
  }

  if (typeof inviteCode !== 'string' || inviteCode.trim().length < 6) {
    return 'Enter a valid invite code'
  }

  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' })
  }

  const config = getConfig()
  if (!config) {
    return json(res, 500, { error: 'Server is missing Supabase configuration' })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
  const { email, password, fullName, inviteCode } = body
  const validationError = validateInput({ email, password, fullName, inviteCode })
  if (validationError) {
    return json(res, 400, { error: validationError })
  }

  const normalizedCode = inviteCode.toUpperCase().trim()

  const adminClient = createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const publicClient = createClient(config.url, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: invite, error: inviteError } = await adminClient
    .from('invite_codes')
    .select('id, code, used')
    .eq('code', normalizedCode)
    .eq('used', false)
    .maybeSingle()

  if (inviteError) {
    return json(res, 500, { error: 'Unable to validate the invite code right now' })
  }

  if (!invite) {
    return json(res, 400, { error: 'Invalid or already used invite code. Contact the administrator.' })
  }

  const { data: signUpData, error: signUpError } = await publicClient.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: {
        full_name: fullName.trim(),
        role: 'admin',
      },
    },
  })

  if (signUpError) {
    return json(res, 400, { error: signUpError.message })
  }

  const userId = signUpData.user?.id
  if (!userId) {
    return json(res, 500, { error: 'Registration succeeded but no user ID was returned' })
  }

  const { data: consumedInvite, error: consumeError } = await adminClient
    .from('invite_codes')
    .update({
      used: true,
      used_by: userId,
      used_at: new Date().toISOString(),
    })
    .eq('id', invite.id)
    .eq('used', false)
    .select('id')
    .maybeSingle()

  if (consumeError || !consumedInvite) {
    await adminClient.auth.admin.deleteUser(userId).catch(() => {})
    return json(res, 409, { error: 'This invite code was already used. Please request a new code.' })
  }

  return json(res, 200, {
    message: 'Account created. Please check your email to verify your address.',
  })
}
