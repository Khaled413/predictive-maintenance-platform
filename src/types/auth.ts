// ---------------------------------------------------------------------------
// Authentication, Role-Based Access Control (RBAC), and Audit Types
// ---------------------------------------------------------------------------

export type UserRole = 'admin' | 'manager' | 'technician'

export type AccountStatus = 'active' | 'deactivated'

export type Permission =
  // Dashboard
  | 'dashboard.view'
  // User Management
  | 'users.read'
  | 'users.create'
  | 'users.update'
  | 'users.deactivate'
  // Roles & Permissions
  | 'roles.read'
  | 'roles.manage'
  | 'permissions.manage'
  // Machines
  | 'machines.read'
  | 'machines.create'
  | 'machines.update'
  | 'machines.delete'
  | 'machines.assign'
  // Alerts
  | 'alerts.read'
  | 'alerts.update'
  // Maintenance Work Orders
  | 'maintenance.read'
  | 'maintenance.create'
  | 'maintenance.assign'
  | 'maintenance.update'
  | 'maintenance.complete'
  // Reports
  | 'reports.read'
  | 'reports.export'
  // Models
  | 'models.read'
  | 'models.manage'
  // Global Settings
  | 'settings.read'
  | 'settings.manage'
  // Assistant
  | 'assistant.use'
  // Security & Audit
  | 'audit.read'

export interface AuthUser {
  id: string
  name: string
  nameAr?: string
  email: string
  role: UserRole
  status: AccountStatus
  avatarInitials: string
  avatarInitialsAr: string
  department: string
  departmentAr: string
  assignedMachineIds: string[]
  createdAt: string
  lastLoginAt: string
}

export interface AuditEvent {
  id: string
  timestamp: string
  actorId: string
  actorName: string
  actorRole: UserRole
  action: string
  resourceType: string
  resourceId?: string
  outcome: 'ALLOW' | 'DENY'
  details?: string
  metadata?: Record<string, unknown>
}

export interface PermissionCheckResult {
  allowed: boolean
  reason?: string
}
