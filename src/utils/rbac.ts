// ---------------------------------------------------------------------------
// Centralized Authorization & RBAC Engine (Deny-By-Default Policy)
// ---------------------------------------------------------------------------

import type { AuthUser, Permission, UserRole } from '../types/auth'
import type { Machine, MaintenanceRecord } from '../types'

/**
 * Baseline Role-to-Permissions Matrix.
 * Explicit deny-by-default: If a permission is not listed for a role, it is denied.
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  admin: [
    'dashboard.view',
    'users.read',
    'users.create',
    'users.update',
    'users.deactivate',
    'roles.read',
    'roles.manage',
    'permissions.manage',
    'machines.read',
    'machines.create',
    'machines.update',
    'machines.delete',
    'machines.assign',
    'alerts.read',
    'alerts.update',
    'maintenance.read',
    'maintenance.create',
    'maintenance.assign',
    'maintenance.update',
    'maintenance.complete',
    'reports.read',
    'reports.export',
    'models.read',
    'models.manage',
    'settings.read',
    'settings.manage',
    'assistant.use',
    'audit.read',
  ],
  manager: [
    'dashboard.view',
    'machines.read',
    'machines.create',
    'machines.update',
    'machines.assign',
    'alerts.read',
    'alerts.update',
    'maintenance.read',
    'maintenance.create',
    'maintenance.assign',
    'maintenance.update',
    'maintenance.complete',
    'reports.read',
    'reports.export',
    'models.read',
    'assistant.use',
  ],
  technician: [
    'dashboard.view',
    'machines.read',
    'alerts.read',
    'maintenance.read',
    'maintenance.update',
    'maintenance.complete',
    'reports.read',
    'assistant.use',
  ],
} as const

/**
 * Retrieves the effective permissions for a user.
 * If customPermissions are explicitly defined for the user (by the Admin), they take precedence.
 * Otherwise, falls back to the baseline ROLE_PERMISSIONS matrix.
 */
export function getUserPermissions(
  user: AuthUser | null | undefined
): readonly Permission[] {
  if (!user || user.status !== 'active') return []
  if (Array.isArray(user.customPermissions)) {
    return user.customPermissions
  }
  return ROLE_PERMISSIONS[user.role] ?? []
}

/**
 * Checks if a user has a specific permission.
 * Deny-by-default: returns false if user is undefined, deactivated, or missing the permission.
 */
export function hasPermission(
  user: AuthUser | null | undefined,
  permission: Permission
): boolean {
  if (!user || user.status !== 'active') return false
  const permissions = getUserPermissions(user)
  return permissions.includes(permission)
}

/**
 * Checks if a user has at least one of the specified permissions.
 */
export function hasAnyPermission(
  user: AuthUser | null | undefined,
  permissions: Permission[]
): boolean {
  if (!user || user.status !== 'active') return false
  return permissions.some((perm) => hasPermission(user, perm))
}

/**
 * Checks if a user has all of the specified permissions.
 */
export function hasAllPermissions(
  user: AuthUser | null | undefined,
  permissions: Permission[]
): boolean {
  if (!user || user.status !== 'active') return false
  return permissions.every((perm) => hasPermission(user, perm))
}

// ---------------------------------------------------------------------------
// Resource-Level Access Evaluation (Separating Permissions from Operational Assignments)
// ---------------------------------------------------------------------------

/**
 * Evaluates whether a user is authorized to view/access a specific machine.
 *
 * Rules:
 * 1. Must have 'machines.read' permission.
 * 2. Admin & Manager have fleet-wide operational scope (can access any machine).
 * 3. Technicians can ONLY access machines assigned to them (in user.assignedMachineIds).
 */
export function canAccessMachine(
  user: AuthUser | null | undefined,
  machineOrId: Machine | string
): boolean {
  if (!hasPermission(user, 'machines.read') || !user) return false
  const machineId = typeof machineOrId === 'string' ? machineOrId : machineOrId.id

  // Admins and Managers have organization-wide operational scope
  if (user.role === 'admin' || user.role === 'manager') {
    return true
  }

  // Technicians must be explicitly assigned to this machine
  return user.assignedMachineIds.includes(machineId)
}

/**
 * Evaluates whether a user can access a maintenance order.
 *
 * Rules:
 * 1. Must have 'maintenance.read' permission.
 * 2. Admin & Manager have fleet-wide operational scope.
 * 3. Technicians can access an order if:
 *    - It is assigned to their name or user ID, OR
 *    - It belongs to a machine assigned to them.
 */
export function canAccessMaintenanceOrder(
  user: AuthUser | null | undefined,
  order: MaintenanceRecord
): boolean {
  if (!hasPermission(user, 'maintenance.read') || !user) return false

  if (user.role === 'admin' || user.role === 'manager') {
    return true
  }

  // Assigned directly to the technician
  if (order.technician === user.name || order.technician === user.id) {
    return true
  }

  // Or relates to one of their assigned machines
  return user.assignedMachineIds.includes(order.machineId)
}

/**
 * Evaluates whether a user can modify, update or complete a maintenance order.
 *
 * Rules:
 * 1. Must have 'maintenance.update' permission.
 * 2. Admin & Manager can modify any maintenance order within scope.
 * 3. Technicians can ONLY modify/complete orders assigned to them.
 *    A technician cannot update or complete work assigned to another technician!
 */
export function canModifyMaintenanceOrder(
  user: AuthUser | null | undefined,
  order: MaintenanceRecord
): boolean {
  if (!hasPermission(user, 'maintenance.update') || !user) return false

  if (user.role === 'admin' || user.role === 'manager') {
    return true
  }

  // Technicians can only modify their own assigned orders
  return order.technician === user.name || order.technician === user.id
}

/**
 * Checks whether an actor can manage another user's role or status.
 */
export function canManageUser(
  actor: AuthUser | null | undefined,
  targetUser: AuthUser
): { allowed: boolean; reason?: string } {
  if (!hasPermission(actor, 'users.update') || !actor) {
    return { allowed: false, reason: 'Insufficient permissions to manage users' }
  }

  if (actor.id === targetUser.id && targetUser.role === 'admin') {
    return {
      allowed: false,
      reason: 'Administrators cannot demote or deactivate their own active account',
    }
  }

  return { allowed: true }
}
