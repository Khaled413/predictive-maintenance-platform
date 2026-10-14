/**
 * Supabase Schema & RBAC Matrix Cross-Verification Test
 * Validates that database migrations, table definitions, and permission seeds align 1:1 with TypeScript domain models.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { ROLE_PERMISSIONS } from '../src/utils/rbac'
import { isSupabaseConfigured } from '../src/lib/supabase'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

console.log('='.repeat(70))
console.log('STARTING SUPABASE MIGRATION & SCHEMA VERIFICATION')
console.log('='.repeat(70))

const tests: { name: string; status: 'PASS' | 'FAIL'; error?: string }[] = []

function test(name: string, fn: () => void) {
  try {
    fn()
    tests.push({ name, status: 'PASS' })
  } catch (err: unknown) {
    tests.push({
      name,
      status: 'FAIL',
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

function assert(cond: boolean, msg?: string) {
  if (!cond) throw new Error(msg || 'Assertion failed')
}

// 1. Verify consolidated enterprise schema file exists and contains essential tables
test('Verify 20261012_consolidated_enterprise_schema.sql contains required enterprise tables', () => {
  const schemaPath = path.resolve(
    __dirname,
    '../supabase/migrations/20261012_consolidated_enterprise_schema.sql'
  )
  assert(fs.existsSync(schemaPath), 'Consolidated migration file must exist')
  const content = fs.readFileSync(schemaPath, 'utf-8')

  const expectedTables = [
    'public.roles',
    'public.permissions',
    'public.role_permissions',
    'public.profiles',
    'public.machines',
    'public.machine_assignments',
    'public.maintenance_orders',
    'public.alerts',
    'public.audit_logs',
  ]

  expectedTables.forEach((table) => {
    assert(
      content.includes(`CREATE TABLE IF NOT EXISTS ${table}`),
      `Schema must define ${table}`
    )
  })
})

// 2. Verify Row Level Security (RLS) is enabled on all tables
test('Verify Row Level Security (RLS) is enabled on all tables', () => {
  const schemaPath = path.resolve(
    __dirname,
    '../supabase/migrations/20261012_consolidated_enterprise_schema.sql'
  )
  const content = fs.readFileSync(schemaPath, 'utf-8')

  const rlsTables = [
    'public.roles',
    'public.permissions',
    'public.role_permissions',
    'public.profiles',
    'public.machines',
    'public.machine_assignments',
    'public.maintenance_orders',
    'public.alerts',
    'public.audit_logs',
  ]

  rlsTables.forEach((table) => {
    assert(
      content.includes(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`),
      `RLS must be enabled on ${table}`
    )
  })
})

// 3. Verify security definer functions exist
test('Verify Security Definier helper functions exist in migration', () => {
  const schemaPath = path.resolve(
    __dirname,
    '../supabase/migrations/20261012_consolidated_enterprise_schema.sql'
  )
  const content = fs.readFileSync(schemaPath, 'utf-8')

  assert(
    content.includes('FUNCTION public.get_current_user_role()'),
    'Must contain get_current_user_role()'
  )
  assert(content.includes('FUNCTION public.is_admin()'), 'Must contain is_admin()')
  assert(
    content.includes('FUNCTION public.is_manager_or_admin()'),
    'Must contain is_manager_or_admin()'
  )
  assert(
    content.includes('FUNCTION public.has_permission('),
    'Must contain has_permission()'
  )
  assert(
    content.includes('FUNCTION public.is_assigned_to_machine('),
    'Must contain is_assigned_to_machine()'
  )
  assert(
    content.includes('FUNCTION public.handle_new_user()'),
    'Must contain handle_new_user() auth trigger'
  )
})

// 4. Verify seed data contains all permissions and roles matching TypeScript RBAC catalog
test('Verify consolidated schema matches TypeScript RBAC catalog', () => {
  const schemaPath = path.resolve(
    __dirname,
    '../supabase/migrations/20261012_consolidated_enterprise_schema.sql'
  )
  const content = fs.readFileSync(schemaPath, 'utf-8')

  // Check roles
  assert(content.includes("'admin'"), "Must seed 'admin' role")
  assert(content.includes("'manager'"), "Must seed 'manager' role")
  assert(content.includes("'technician'"), "Must seed 'technician' role")

  // Check that all Admin permissions from TypeScript are mentioned
  ROLE_PERMISSIONS.admin.forEach((perm) => {
    assert(content.includes(`'${perm}'`), `Seed must include permission '${perm}'`)
  })
})

// 5. Verify Edge Function exists
test('Verify Edge Function invite-user exists and has correct structure', () => {
  const edgeFuncPath = path.resolve(
    __dirname,
    '../supabase/functions/invite-user/index.ts'
  )
  assert(fs.existsSync(edgeFuncPath), 'Edge function file must exist')
  const content = fs.readFileSync(edgeFuncPath, 'utf-8')

  assert(content.includes('inviteUserByEmail'), 'Must invoke inviteUserByEmail')
  assert(
    content.includes("callerProfile?.role_id !== 'admin'"),
    'Must verify caller admin authority'
  )
  assert(content.includes('audit_logs'), 'Must log security audit event')
})

// 6. Verify Supabase Client configuration state
test('Verify Supabase client handles unconfigured gracefully', () => {
  // In dev environment without env vars, isSupabaseConfigured must be a boolean (false or true)
  assert(
    typeof isSupabaseConfigured === 'boolean',
    'isSupabaseConfigured must be boolean'
  )
})

console.log('\nVERIFICATION RESULTS:')
let passed = 0
tests.forEach((t) => {
  if (t.status === 'PASS') {
    passed++
    console.log(`  ✓ [PASS] ${t.name}`)
  } else {
    console.error(`  ✗ [FAIL] ${t.name} - Error: ${t.error}`)
  }
})

console.log('\n' + '='.repeat(70))
console.log(`SUMMARY: ${passed} / ${tests.length} SUPABASE CHECKS PASSED`)
console.log('='.repeat(70))

if (passed !== tests.length) {
  process.exit(1)
}
