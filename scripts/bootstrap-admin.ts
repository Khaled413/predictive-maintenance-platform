/**
 * First-Admin Provisioning Bootstrap Script
 *
 * Usage:
 *   SUPABASE_URL=https://xyz.supabase.co SUPABASE_SERVICE_ROLE_KEY=ey... \
 *   npx tsx scripts/bootstrap-admin.ts --email=admin@factory.com --name="Plant Administrator" --password="SuperSecurePassword123!"
 *
 * Requirements satisfied:
 * - No hardcoded production passwords in git
 * - No public promotion endpoints
 * - Enforces role='admin' in public.profiles and creates corresponding auth.users record safely
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) return {}
  const content = fs.readFileSync(envPath, 'utf-8')
  const env: Record<string, string> = {}
  content.split('\n').forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim()
      let val = trimmed.slice(eqIdx + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      env[key] = val
    }
  })
  return env
}

const env = loadEnv()
const supabaseUrl =
  process.env.SUPABASE_URL || env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL || ''
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || ''

function parseArgs() {
  const args: Record<string, string> = {}
  process.argv.slice(2).forEach((arg) => {
    if (arg.startsWith('--')) {
      const [key, val] = arg.slice(2).split('=')
      args[key] = val
    }
  })
  return args
}

async function bootstrapAdmin() {
  console.log('='.repeat(70))
  console.log('ENTERPRISE INDUSTRIAL AI SAAS — FIRST ADMIN BOOTSTRAP')
  console.log('='.repeat(70))

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      'Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required.'
    )
    console.log('\nExample execution:')
    console.log('  $env:SUPABASE_URL="https://your-project.supabase.co"')
    console.log('  $env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"')
    console.log(
      '  npx tsx scripts/bootstrap-admin.ts --email=admin@factory.com --name="Eng. Khaled" --password="StrongPassword123!"\n'
    )
    process.exit(1)
  }

  const args = parseArgs()
  const email = args.email || 'admin@factory.local'
  const name = args.name || 'Plant Administrator'
  const password = args.password

  if (!password) {
    console.error('Error: Please provide --password="YourPassword" argument.')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`\n1. Creating or finding auth user for: ${email}...`)

  // Check if user already exists
  const { data: userList } = await supabase.auth.admin.listUsers()
  const existingUser = userList?.users?.find(
    (u: { email?: string; id: string }) => u.email === email
  )

  let userId: string

  if (existingUser) {
    console.log(
      `   User already exists in auth.users (ID: ${existingUser.id}). Updating password and metadata...`
    )
    const { data: updated, error: updateError } =
      await supabase.auth.admin.updateUserById(existingUser.id, {
        password,
        user_metadata: { full_name: name, role: 'admin' },
        email_confirm: true,
      })
    if (updateError) throw updateError
    userId = updated.user.id
  } else {
    console.log(`   Provisioning new auth user...`)
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name, role: 'admin' },
    })
    if (createError) throw createError
    userId = created.user.id
  }

  console.log(`2. Ensuring public.profiles entry has role='admin'...`)
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: userId,
    full_name: name,
    email: email,
    role_id: 'admin',
    department: 'Plant Operations & IT Administration',
    account_status: 'active',
    avatar_initials: name.slice(0, 2).toUpperCase(),
    updated_at: new Date().toISOString(),
  })

  if (profileError) {
    console.error('Profile upsert error:', profileError)
  } else {
    console.log('   Profile successfully configured with role=admin!')
  }

  console.log('\n3. Recording initial bootstrap event in audit_logs...')
  await supabase.from('audit_logs').insert({
    actor_id: userId,
    actor_name: name,
    actor_role: 'admin',
    action: 'system.bootstrap_admin',
    resource_type: 'user',
    resource_id: userId,
    outcome: 'ALLOW',
    details: `Initial system administrator bootstrapped for ${email}`,
  })

  console.log('\n' + '='.repeat(70))
  console.log('SUCCESS: First administrator provisioned successfully!')
  console.log(`Email:    ${email}`)
  console.log(`Role:     admin`)
  console.log(`User ID:  ${userId}`)
  console.log('='.repeat(70) + '\n')
}

bootstrapAdmin().catch((err) => {
  console.error('\nBootstrap failed:', err)
  process.exit(1)
})
