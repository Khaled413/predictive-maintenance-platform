/**
 * Seed Test Employees for Predictive Maintenance Platform
 *
 * Provisions sample employees across all RBAC roles (Manager, Technicians):
 * - Sets up accounts in auth.users with secure password
 * - Connects profiles in public.profiles
 * - Assigns machinery fleet scope in public.machine_assignments
 *
 * Usage:
 *   npx tsx scripts/seed-employees.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// Read .env manually to avoid extra dependencies
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
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      env[key] = val
    }
  })
  return env
}

const env = loadEnv()
const supabaseUrl = process.env.SUPABASE_URL || env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const DEFAULT_PASSWORD = 'FactoryTest2026!'

const TEST_EMPLOYEES = [
  {
    email: 'manager@factory.com',
    fullName: 'Karim Mansour',
    role: 'manager' as const,
    department: 'Maintenance Operations & Planning',
    initials: 'KM',
    assignedMachines: [],
  },
  {
    email: 'tech1@factory.com',
    fullName: 'Ahmed Hassan',
    role: 'technician' as const,
    department: 'Mechanical Reliability - Line 1',
    initials: 'AH',
    assignedMachines: ['M-001', 'M-002', 'M-003'],
  },
  {
    email: 'tech2@factory.com',
    fullName: 'Sara Nabil',
    role: 'technician' as const,
    department: 'Electrical & Robotics Automation',
    initials: 'SN',
    assignedMachines: ['M-004', 'M-005'],
  },
  {
    email: 'tech3@factory.com',
    fullName: 'Omar Farouk',
    role: 'technician' as const,
    department: 'Packaging & Steam Utilities',
    initials: 'OF',
    assignedMachines: ['M-006', 'M-007'],
  },
  {
    email: 'tech4@factory.com',
    fullName: 'Mahmoud Tarek',
    role: 'technician' as const,
    department: 'High-Pressure Systems & Air Deck',
    initials: 'MT',
    assignedMachines: ['M-008', 'M-012'],
  },
]

async function seedEmployees() {
  console.log('='.repeat(70))
  console.log('SEEDING TEST EMPLOYEES TO SUPABASE')
  console.log('='.repeat(70))
  console.log(`Connecting to: ${supabaseUrl}`)
  console.log(`Default password for all test users: ${DEFAULT_PASSWORD}\n`)

  const { data: userList, error: listErr } = await supabase.auth.admin.listUsers()
  if (listErr) {
    console.error('Failed to list existing users:', listErr.message)
    process.exit(1)
  }

  const existingByEmail = new Map<string, { id: string; email?: string }>()
  userList?.users?.forEach((u: { id: string; email?: string }) => {
    if (u.email) {
      existingByEmail.set(u.email.toLowerCase(), u)
    }
  })

  for (const emp of TEST_EMPLOYEES) {
    console.log(`Processing: ${emp.fullName} (${emp.email}) [${emp.role}]...`)
    let userId: string

    const existing = existingByEmail.get(emp.email.toLowerCase())
    if (existing) {
      console.log(`  - User exists in auth.users (${existing.id}). Updating password and metadata...`)
      const { data: updated, error: updateErr } = await supabase.auth.admin.updateUserById(existing.id, {
        password: DEFAULT_PASSWORD,
        user_metadata: { full_name: emp.fullName, role: emp.role },
        email_confirm: true,
      })
      if (updateErr) {
        console.error(`    Failed to update auth user: ${updateErr.message}`)
        continue
      }
      userId = updated.user.id
    } else {
      console.log(`  - Creating new user in auth.users...`)
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: emp.email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: emp.fullName, role: emp.role },
      })
      if (createErr) {
        console.error(`    Failed to create auth user: ${createErr.message}`)
        continue
      }
      userId = created.user.id
    }

    // 2. Upsert into public.profiles
    const { error: profErr } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        full_name: emp.fullName,
        email: emp.email,
        role_id: emp.role,
        department: emp.department,
        account_status: 'active',
        avatar_initials: emp.initials,
        updated_at: new Date().toISOString(),
      })

    if (profErr) {
      console.error(`    Failed to update profile: ${profErr.message}`)
      continue
    }
    console.log(`  ✓ Profile synchronized in public.profiles.`)

    // 3. Assign machines if technician
    if (emp.role === 'technician' && emp.assignedMachines.length > 0) {
      // Clear old active assignments
      await supabase
        .from('machine_assignments')
        .delete()
        .eq('user_id', userId)

      const assignments = emp.assignedMachines.map((mId) => ({
        machine_id: mId,
        user_id: userId,
        assignment_status: 'active',
      }))

      const { error: assignErr } = await supabase
        .from('machine_assignments')
        .insert(assignments)

      if (assignErr) {
        console.warn(`    Notice on machine assignments: ${assignErr.message}`)
      } else {
        console.log(`  ✓ Assigned ${emp.assignedMachines.length} machines (${emp.assignedMachines.join(', ')}).`)
      }
    }
  }

  console.log('\n' + '='.repeat(70))
  console.log('TEST EMPLOYEES SEEDED SUCCESSFULLY!')
  console.log('='.repeat(70))
  console.log('\nAvailable Test Accounts:')
  console.log('------------------------------------------------------------')
  console.log('1. Admin:      admin@factory.com      / IndustrialAdmin2026!')
  console.log('2. Manager:    manager@factory.com    / FactoryTest2026!')
  console.log('3. Tech 1:     tech1@factory.com      / FactoryTest2026!  (M-001, M-002, M-003)')
  console.log('4. Tech 2:     tech2@factory.com      / FactoryTest2026!  (M-004, M-005)')
  console.log('5. Tech 3:     tech3@factory.com      / FactoryTest2026!  (M-006, M-007)')
  console.log('6. Tech 4:     tech4@factory.com      / FactoryTest2026!  (M-008, M-012)')
  console.log('------------------------------------------------------------\n')
}

seedEmployees().catch(console.error)
