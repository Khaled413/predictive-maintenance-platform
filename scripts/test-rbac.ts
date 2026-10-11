/**
 * Automated Verification Script for RBAC & Permission Management
 * Validates all 13 required scenarios from Section 14 against the RBAC core engine.
 */

import {
  ROLE_PERMISSIONS,
  hasPermission,
  canAccessMachine,
  canModifyMaintenanceOrder,
  canManageUser,
} from '../src/utils/rbac'
import type { AuthUser, Permission } from '../src/types/auth'

// Mock user records matching types/auth.ts
const adminUser: AuthUser = {
  id: 'usr-admin-1',
  name: 'Eng. Khaled',
  email: 'khaled.admin@factory-ai.local',
  role: 'admin',
  status: 'active',
  avatarInitials: 'EK',
  avatarInitialsAr: 'مخ',
  department: 'Plant Operations & IT Administration',
  departmentAr: 'إدارة العمليات وتكنولوجيا المصنع',
  assignedMachineIds: [],
  createdAt: '2026-01-10T08:00:00Z',
  lastLoginAt: new Date().toISOString(),
}

const managerUser: AuthUser = {
  id: 'usr-mgr-1',
  name: 'Sarah Connor',
  email: 'sarah.connor@factory-ai.local',
  role: 'manager',
  status: 'active',
  avatarInitials: 'SC',
  avatarInitialsAr: 'سك',
  department: 'Predictive Maintenance Engineering',
  departmentAr: 'هندسة الصيانة التنبؤية',
  assignedMachineIds: [],
  createdAt: '2026-01-15T09:30:00Z',
  lastLoginAt: new Date().toISOString(),
}

const techA: AuthUser = {
  id: 'usr-tech-1',
  name: 'Ahmed Hassan',
  email: 'ahmed.hassan@factory-ai.local',
  role: 'technician',
  status: 'active',
  avatarInitials: 'AH',
  avatarInitialsAr: 'أح',
  department: 'Line 1 Mechanical Reliability',
  departmentAr: 'صيانة خط 1 الميكانيكية',
  assignedMachineIds: ['M-001', 'M-002', 'M-003'],
  createdAt: '2026-02-01T10:00:00Z',
  lastLoginAt: new Date().toISOString(),
}

const techB: AuthUser = {
  id: 'usr-tech-2',
  name: 'Omar Tarek',
  email: 'omar.tarek@factory-ai.local',
  role: 'technician',
  status: 'active',
  avatarInitials: 'OT',
  avatarInitialsAr: 'عط',
  department: 'Line 2 Pneumatic & Drive Systems',
  departmentAr: 'صيانة خط 2 الهوائية والأنظمة الحركية',
  assignedMachineIds: ['M-004', 'M-005', 'M-006'],
  createdAt: '2026-02-05T11:15:00Z',
  lastLoginAt: new Date().toISOString(),
}

const deactivatedUser: AuthUser = {
  id: 'usr-inact-1',
  name: 'Former Contractor',
  email: 'former.contractor@factory-ai.local',
  role: 'technician',
  status: 'deactivated',
  avatarInitials: 'FC',
  avatarInitialsAr: 'مس',
  department: 'Temporary Electrical Maintenance',
  departmentAr: 'صيانة كهربائية مؤقتة',
  assignedMachineIds: ['M-001'],
  createdAt: '2026-01-01T00:00:00Z',
  lastLoginAt: '2026-01-20T17:00:00Z',
}

interface TestResult {
  name: string
  status: 'PASS' | 'FAIL'
  error?: string
}

const tests: TestResult[] = []

function test(name: string, fn: () => void) {
  try {
    fn()
    tests.push({ name, status: 'PASS' })
  } catch (err: unknown) {
    tests.push({ name, status: 'FAIL', error: err instanceof Error ? err.message : String(err) })
  }
}

function assert(condition: boolean, message?: string) {
  if (!condition) {
    throw new Error(message || 'Assertion failed')
  }
}

console.log('='.repeat(70))
console.log('STARTING AUTOMATED RBAC VERIFICATION (13 SCENARIOS)')
console.log('='.repeat(70))

// Scenario 1: An Admin can perform explicitly permitted administrative actions.
test('Scenario 1: Admin can perform explicitly permitted administrative actions', () => {
  assert(hasPermission(adminUser, 'users.create'), 'Admin should have users.create')
  assert(hasPermission(adminUser, 'users.update'), 'Admin should have users.update')
  assert(hasPermission(adminUser, 'roles.manage'), 'Admin should have roles.manage')
  assert(hasPermission(adminUser, 'permissions.manage'), 'Admin should have permissions.manage')
  assert(hasPermission(adminUser, 'machines.create'), 'Admin should have machines.create')
  assert(hasPermission(adminUser, 'machines.delete'), 'Admin should have machines.delete')
  assert(hasPermission(adminUser, 'models.manage'), 'Admin should have models.manage')
  assert(hasPermission(adminUser, 'settings.manage'), 'Admin should have settings.manage')
})

// Scenario 2: A Maintenance Manager cannot create an Admin account or modify protected global permissions.
test('Scenario 2: Maintenance Manager cannot create Admin account or manage global permissions', () => {
  assert(!hasPermission(managerUser, 'users.create'), 'Manager must NOT have users.create')
  assert(!hasPermission(managerUser, 'roles.manage'), 'Manager must NOT have roles.manage')
  assert(!hasPermission(managerUser, 'permissions.manage'), 'Manager must NOT have permissions.manage')
  assert(!hasPermission(managerUser, 'settings.manage'), 'Manager must NOT have settings.manage')
  
  const manageAdminResult = canManageUser(managerUser, adminUser)
  assert(!manageAdminResult.allowed, 'Manager must be denied from managing Admin account')
})

// Scenario 3: A Technician cannot manage users or roles.
test('Scenario 3: Technician cannot manage users or roles', () => {
  assert(!hasPermission(techA, 'users.read'), 'Technician must NOT have users.read')
  assert(!hasPermission(techA, 'users.create'), 'Technician must NOT have users.create')
  assert(!hasPermission(techA, 'users.update'), 'Technician must NOT have users.update')
  assert(!hasPermission(techA, 'users.deactivate'), 'Technician must NOT have users.deactivate')
  assert(!hasPermission(techA, 'roles.manage'), 'Technician must NOT have roles.manage')
  assert(!hasPermission(techA, 'settings.read'), 'Technician must NOT have settings.read')
})

// Scenario 4: A Technician can access an assigned machine.
test('Scenario 4: Technician can access an assigned machine', () => {
  assert(canAccessMachine(techA, 'M-001'), 'Tech A must access assigned M-001')
  assert(canAccessMachine(techA, 'M-002'), 'Tech A must access assigned M-002')
  assert(canAccessMachine(techA, { id: 'M-003' } as any), 'Tech A must access assigned M-003 object')
})

// Scenario 5: A Technician cannot access an unassigned machine.
test('Scenario 5: Technician cannot access an unassigned machine', () => {
  assert(!canAccessMachine(techA, 'M-004'), 'Tech A must NOT access unassigned M-004')
  assert(!canAccessMachine(techA, 'M-005'), 'Tech A must NOT access unassigned M-005')
  assert(!canAccessMachine(techA, { id: 'M-006' } as any), 'Tech A must NOT access unassigned M-006 object')
  assert(canAccessMachine(managerUser, 'M-004'), 'Manager should access fleet machine M-004')
  assert(canAccessMachine(adminUser, 'M-004'), 'Admin should access fleet machine M-004')
})

// Scenario 6: A Technician cannot update another technician maintenance order unless explicitly authorized.
test('Scenario 6: Technician cannot update another technician maintenance order', () => {
  const orderTechA: any = {
    id: 'MO-101',
    machineId: 'M-001',
    technician: 'Ahmed Hassan',
    status: 'Scheduled',
  }
  const orderTechB: any = {
    id: 'MO-102',
    machineId: 'M-004',
    technician: 'Omar Tarek',
    status: 'Scheduled',
  }

  assert(canModifyMaintenanceOrder(techA, orderTechA), 'Tech A should be able to update own order')
  assert(!canModifyMaintenanceOrder(techA, orderTechB), 'Tech A must NOT be able to update Tech B order')
  assert(canModifyMaintenanceOrder(managerUser, orderTechB), 'Manager should be able to update any order in fleet')
  assert(canModifyMaintenanceOrder(adminUser, orderTechB), 'Admin should be able to update any order in fleet')
})

// Scenario 7: A user without the required permission is denied even when attempting a direct request.
test('Scenario 7: Direct request denied without required permission (Deny by default)', () => {
  assert(!hasPermission(techA, 'machines.delete'), 'Tech A denied machines.delete')
  assert(!hasPermission(managerUser, 'machines.delete'), 'Manager denied machines.delete')
  assert(!hasPermission(techA, 'models.manage'), 'Tech A denied models.manage')
})

// Scenario 8: An unauthenticated user cannot access protected operations.
test('Scenario 8: Unauthenticated user cannot access protected operations', () => {
  assert(!hasPermission(null, 'dashboard.view'), 'null user denied dashboard.view')
  assert(!hasPermission(undefined, 'machines.read'), 'undefined user denied machines.read')
  assert(!canAccessMachine(null, 'M-001'), 'null user denied canAccessMachine')
  assert(!canModifyMaintenanceOrder(null, { id: 'MO-1', machineId: 'M-001' } as any), 'null user denied canModifyMaintenanceOrder')
})

// Scenario 9: Missing or invalid authorization data fails safely.
test('Scenario 9: Missing or invalid authorization data fails safely', () => {
  const malformedUser1: any = { id: 'bad-1', role: 'unknown_role', status: 'active' }
  const malformedUser2: any = { id: 'bad-2', role: null, status: 'active' }
  const malformedUser3: any = { id: 'bad-3' } // no role or status

  assert(!hasPermission(malformedUser1, 'dashboard.view'), 'Unknown role fails safely')
  assert(!hasPermission(malformedUser2, 'machines.read'), 'Null role fails safely')
  assert(!hasPermission(malformedUser3, 'settings.read'), 'Missing role fails safely')
  assert(!hasPermission(techA, 'nonexistent.permission' as Permission), 'Nonexistent permission fails safely')
})

// Scenario 10: Changing a user role updates effective permissions.
test('Scenario 10: Changing a user role updates effective permissions', () => {
  const user = { ...techA }
  assert(!hasPermission(user, 'users.create'), 'Before promotion: cannot create users')
  
  // Promote to admin
  const promotedUser: AuthUser = { ...user, role: 'admin' }
  assert(hasPermission(promotedUser, 'users.create'), 'After promotion to admin: can create users')
  assert(hasPermission(promotedUser, 'machines.delete'), 'After promotion to admin: can delete machines')
})

// Scenario 11: Deactivated users cannot continue performing protected operations.
test('Scenario 11: Deactivated users cannot perform any protected operations', () => {
  assert(!hasPermission(deactivatedUser, 'dashboard.view'), 'Deactivated user denied dashboard.view')
  assert(!hasPermission(deactivatedUser, 'machines.read'), 'Deactivated user denied machines.read')
  assert(!hasPermission(deactivatedUser, 'maintenance.read'), 'Deactivated user denied maintenance.read')
  assert(!canAccessMachine(deactivatedUser, 'M-001'), 'Deactivated user denied assigned machine access')
})

// Scenario 12: Unauthorized requests do not modify stored data (Logic check).
test('Scenario 12: Self-escalation and unauthorized modification checks', () => {
  // A manager attempting to promote themselves to admin
  const selfElevationAttempt = canManageUser(managerUser, { ...managerUser, role: 'admin' })
  assert(!selfElevationAttempt.allowed, 'Manager self-elevation must be denied')

  // A tech attempting to manage manager
  const techManageManager = canManageUser(techA, managerUser)
  assert(!techManageManager.allowed, 'Technician managing manager must be denied')
})

// Scenario 13: Matrix integrity & comprehensive permission boundaries
test('Scenario 13: Permission matrix deny-by-default integrity', () => {
  // Verify that Admin, Manager, Technician role maps exist and are distinct
  assert(ROLE_PERMISSIONS.admin.length > ROLE_PERMISSIONS.manager.length, 'Admin permissions > Manager permissions')
  assert(ROLE_PERMISSIONS.manager.length > ROLE_PERMISSIONS.technician.length, 'Manager permissions > Technician permissions')
  assert(ROLE_PERMISSIONS.technician.includes('assistant.use'), 'Technician has assistant.use')
  assert(!ROLE_PERMISSIONS.technician.includes('settings.manage'), 'Technician does NOT have settings.manage')
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
console.log(`SUMMARY: ${passed} / ${tests.length} SCENARIOS PASSED`)
console.log('='.repeat(70))

if (passed !== tests.length) {
  process.exit(1)
}
