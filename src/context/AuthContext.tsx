import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type {
  AccountStatus,
  AuditEvent,
  AuthUser,
  Permission,
  UserRole,
} from '../types/auth'
import {
  canAccessMachine,
  canAccessMaintenanceOrder,
  canManageUser,
  canModifyMaintenanceOrder,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
} from '../utils/rbac'
import type { Machine, MaintenanceRecord } from '../types'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const AUTH_STORAGE_KEY = 'iap-auth-state-v1'
const AUDIT_STORAGE_KEY = 'iap-audit-log-v1'

/**
 * Standard preconfigured users representing all supported organizational roles.
 * Provided for development and verification purposes.
 */
export const SEED_USERS: AuthUser[] = [
  {
    id: 'usr-admin-1',
    name: 'Eng. Khaled',
    nameAr: 'م. خالد',
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
  },
  {
    id: 'usr-mgr-1',
    name: 'Sarah Connor',
    nameAr: 'سارة كونور',
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
  },
  {
    id: 'usr-tech-1',
    name: 'Ahmed Hassan',
    nameAr: 'أحمد حسن',
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
  },
  {
    id: 'usr-tech-2',
    name: 'Omar Tarek',
    nameAr: 'عمر طارق',
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
  },
  {
    id: 'usr-inact-1',
    name: 'Former Contractor',
    nameAr: 'مقاول سابق',
    email: 'former.contractor@factory-ai.local',
    role: 'technician',
    status: 'deactivated',
    avatarInitials: 'FC',
    avatarInitialsAr: 'مس',
    department: 'Temporary Electrical Maintenance',
    departmentAr: 'صيانة كهربائية مؤقتة',
    assignedMachineIds: [],
    createdAt: '2026-01-01T00:00:00Z',
    lastLoginAt: '2026-01-20T17:00:00Z',
  },
]

export interface AuthContextValue {
  currentUser: AuthUser | null
  users: AuthUser[]
  auditLog: AuditEvent[]
  isSupabaseConnected: boolean
  signInWithEmail: (
    email: string,
    password: string
  ) => Promise<{ success: boolean; error?: string }>
  signOutUser: () => Promise<void>
  requestPasswordReset: (
    email: string
  ) => Promise<{ success: boolean; error?: string }>
  switchUser: (userId: string) => boolean
  createUser: (user: Omit<AuthUser, 'id' | 'createdAt' | 'lastLoginAt'>) => {
    success: boolean
    error?: string
  }
  updateUserRole: (
    userId: string,
    role: UserRole
  ) => { success: boolean; error?: string }
  setUserStatus: (
    userId: string,
    status: AccountStatus
  ) => { success: boolean; error?: string }
  assignMachinesToTechnician: (
    userId: string,
    machineIds: string[]
  ) => { success: boolean; error?: string }
  checkPermission: (permission: Permission) => boolean
  checkAnyPermission: (permissions: Permission[]) => boolean
  checkAllPermissions: (permissions: Permission[]) => boolean
  checkMachineAccess: (machineOrId: Machine | string) => boolean
  checkOrderAccess: (order: MaintenanceRecord) => boolean
  checkOrderModification: (order: MaintenanceRecord) => boolean
  checkOrderModify: (order: MaintenanceRecord) => boolean
  logSecurityEvent: (
    event: Omit<AuditEvent, 'id' | 'timestamp' | 'actorId' | 'actorName' | 'actorRole'>
  ) => void
  logAudit: (
    action: Permission | string,
    resourceType: string,
    resourceId?: string,
    outcome?: 'allowed' | 'denied',
    metadata?: Record<string, unknown>
  ) => void
  resetAuthToDefaults: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<AuthUser[]>(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
        }
      }
    } catch (e) {
      console.warn('Failed to parse stored auth users, using seed defaults', e)
    }
    return SEED_USERS
  })

  const [currentUserId, setCurrentUserId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('iap-current-user-id')
      if (saved && users.some((u) => u.id === saved)) {
        return saved
      }
    } catch {
      // ignore
    }
    return 'usr-admin-1'
  })

  const [supabaseUser, setSupabaseUser] = useState<AuthUser | null>(null)

  const [auditLog, setAuditLog] = useState<AuditEvent[]>(() => {
    try {
      const raw = localStorage.getItem(AUDIT_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return parsed
      }
    } catch {
      // ignore
    }
    return [
      {
        id: 'aud-seed-1',
        timestamp: new Date().toISOString(),
        actorId: 'usr-admin-1',
        actorName: 'Eng. Khaled',
        actorRole: 'admin',
        action: 'auth.system_initialized',
        resourceType: 'system',
        outcome: 'ALLOW',
        details: 'RBAC Authorization system initialized with baseline permission policies.',
      },
    ]
  })

  // Persist users locally
  useEffect(() => {
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(users))
    } catch (e) {
      console.warn('Could not persist users to localStorage', e)
    }
  }, [users])

  // Persist current user ID
  useEffect(() => {
    try {
      localStorage.setItem('iap-current-user-id', currentUserId)
    } catch (e) {
      console.warn('Could not persist currentUserId to localStorage', e)
    }
  }, [currentUserId])

  // Persist audit log
  useEffect(() => {
    try {
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(auditLog.slice(0, 200)))
    } catch (e) {
      console.warn('Could not persist auditLog to localStorage', e)
    }
  }, [auditLog])

  // Load and subscribe to Supabase Auth state if configured
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return
    const client = supabase

    const loadSupabaseSession = async () => {
      try {
        const {
          data: { session },
        } = await client.auth.getSession()

        if (session?.user) {
          const userId = session.user.id
          const { data: profile } = await (client as any)
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single()

          const { data: assignments } = await (client as any)
            .from('machine_assignments')
            .select('machine_id')
            .eq('user_id', userId)
            .eq('assignment_status', 'active')

          const mappedUser: AuthUser = {
            id: userId,
            name: profile?.full_name || session.user.email || 'Supabase User',
            email: session.user.email || '',
            role: (profile?.role_id as UserRole) || 'technician',
            status: (profile?.account_status as AccountStatus) || 'active',
            avatarInitials: profile?.avatar_initials || 'SB',
            avatarInitialsAr: 'سب',
            department: profile?.department || 'Operations',
            departmentAr: 'العمليات',
            assignedMachineIds: assignments ? assignments.map((a: any) => a.machine_id) : [],
            createdAt: profile?.created_at || new Date().toISOString(),
            lastLoginAt: session.user.last_sign_in_at || new Date().toISOString(),
          }

          setSupabaseUser(mappedUser)
        } else {
          setSupabaseUser(null)
        }
      } catch (err) {
        console.warn('Supabase session load error:', err)
      }
    }

    void loadSupabaseSession()

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void loadSupabaseSession()
      } else {
        setSupabaseUser(null)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const currentUser = useMemo(() => {
    if (isSupabaseConfigured && supabaseUser) {
      return supabaseUser
    }
    const found = users.find((u) => u.id === currentUserId)
    return found || users[0] || null
  }, [users, currentUserId, supabaseUser])

  const logSecurityEvent = useCallback(
    (
      event: Omit<AuditEvent, 'id' | 'timestamp' | 'actorId' | 'actorName' | 'actorRole'>
    ) => {
      const actor = currentUser
      const newEvent: AuditEvent = {
        id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toISOString(),
        actorId: actor?.id || 'anonymous',
        actorName: actor?.name || 'Unauthenticated Guest',
        actorRole: actor?.role || 'technician',
        ...event,
      }
      setAuditLog((prev) => [newEvent, ...prev.slice(0, 199)])

      if (isSupabaseConfigured && supabase) {
        void (supabase as any).from('audit_logs').insert({
          actor_id: actor?.id || null,
          actor_name: actor?.name || 'Unauthenticated Guest',
          actor_role: actor?.role || 'technician',
          action: event.action,
          resource_type: event.resourceType,
          resource_id: event.resourceId || null,
          outcome: event.outcome,
          details: event.details || null,
          metadata: (event.metadata as any) || null,
        })
      }
    },
    [currentUser]
  )

  const logAudit = useCallback(
    (
      action: Permission | string,
      resourceType: string,
      resourceId?: string,
      outcome: 'allowed' | 'denied' = 'allowed',
      metadata?: Record<string, unknown>
    ) => {
      logSecurityEvent({
        action,
        resourceType,
        resourceId,
        outcome: outcome === 'allowed' ? 'ALLOW' : 'DENY',
        details: `${outcome.toUpperCase()}: ${action} on ${resourceType}${resourceId ? ` (${resourceId})` : ''}`,
        metadata,
      })
    },
    [logSecurityEvent]
  )

  const signInWithEmail = useCallback(
    async (
      email: string,
      password: string
    ): Promise<{ success: boolean; error?: string }> => {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) {
          logSecurityEvent({
            action: 'auth.login_failed',
            resourceType: 'session',
            outcome: 'DENY',
            details: `Failed sign in attempt for email ${email}: ${error.message}`,
          })
          return { success: false, error: error.message }
        }

        logSecurityEvent({
          action: 'auth.login_success',
          resourceType: 'session',
          resourceId: data.user.id,
          outcome: 'ALLOW',
          details: `User ${email} signed in successfully via Supabase Auth.`,
        })
        return { success: true }
      }

      // Local sandbox fallback
      const targetUser = users.find(
        (u) => u.email.toLowerCase() === email.toLowerCase()
      )
      if (targetUser) {
        if (targetUser.status === 'deactivated') {
          return {
            success: false,
            error: 'Account has been deactivated. Contact your plant administrator.',
          }
        }
        setCurrentUserId(targetUser.id)
        logSecurityEvent({
          action: 'auth.login_sandbox',
          resourceType: 'session',
          resourceId: targetUser.id,
          outcome: 'ALLOW',
          details: `User ${targetUser.name} signed in (Local Sandbox mode).`,
        })
        return { success: true }
      }

      // If no exact email, match first active admin
      setCurrentUserId('usr-admin-1')
      return { success: true }
    },
    [users, logSecurityEvent]
  )

  const signOutUser = useCallback(async () => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut()
      setSupabaseUser(null)
    }
    logSecurityEvent({
      action: 'auth.signed_out',
      resourceType: 'session',
      outcome: 'ALLOW',
      details: `User signed out from session.`,
    })
  }, [logSecurityEvent])

  const requestPasswordReset = useCallback(
    async (email: string): Promise<{ success: boolean; error?: string }> => {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/`,
        })
        if (error) return { success: false, error: error.message }
        return { success: true }
      }
      return { success: true }
    },
    []
  )

  const switchUser = useCallback(
    (userId: string): boolean => {
      const target = users.find((u) => u.id === userId)
      if (!target) return false

      setCurrentUserId(userId)
      logSecurityEvent({
        action: 'auth.user_switched',
        resourceType: 'session',
        resourceId: userId,
        outcome: 'ALLOW',
        details: `Switched active profile context to ${target.name} (${target.role}).`,
      })
      return true
    },
    [users, logSecurityEvent]
  )

  const createUser = useCallback(
    (
      newUserData: Omit<AuthUser, 'id' | 'createdAt' | 'lastLoginAt'>
    ): { success: boolean; error?: string } => {
      if (!hasPermission(currentUser, 'users.create')) {
        logSecurityEvent({
          action: 'users.create_attempt',
          resourceType: 'user',
          outcome: 'DENY',
          details: `User ${currentUser?.name} attempted to create user without 'users.create' permission.`,
        })
        return {
          success: false,
          error: 'Unauthorized: Permission to create users required.',
        }
      }

      if (users.some((u) => u.email.toLowerCase() === newUserData.email.toLowerCase())) {
        return { success: false, error: 'A user with this email address already exists.' }
      }

      const id = `usr-${Date.now()}`
      const createdUser: AuthUser = {
        ...newUserData,
        id,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      }

      setUsers((prev) => [...prev, createdUser])

      logSecurityEvent({
        action: 'users.created',
        resourceType: 'user',
        resourceId: id,
        outcome: 'ALLOW',
        details: `Created new user ${createdUser.name} with role ${createdUser.role}.`,
      })

      return { success: true }
    },
    [currentUser, users, logSecurityEvent]
  )

  const updateUserRole = useCallback(
    (userId: string, newRole: UserRole): { success: boolean; error?: string } => {
      if (!hasPermission(currentUser, 'roles.manage')) {
        logSecurityEvent({
          action: 'roles.change_attempt',
          resourceType: 'user',
          resourceId: userId,
          outcome: 'DENY',
          details: `User ${currentUser?.name} attempted to modify role without 'roles.manage' permission.`,
        })
        return {
          success: false,
          error: 'Unauthorized: Permission to manage roles required.',
        }
      }

      const target = users.find((u) => u.id === userId)
      if (!target) return { success: false, error: 'User not found.' }

      const validation = canManageUser(currentUser, target)
      if (!validation.allowed) {
        return { success: false, error: validation.reason }
      }

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      )

      if (isSupabaseConfigured && supabase) {
        void (supabase as any).from('profiles').update({ role_id: newRole }).eq('id', userId)
      }

      logSecurityEvent({
        action: 'roles.updated',
        resourceType: 'user',
        resourceId: userId,
        outcome: 'ALLOW',
        details: `Updated role for ${target.name} from ${target.role} to ${newRole}.`,
      })

      return { success: true }
    },
    [currentUser, users, logSecurityEvent]
  )

  const setUserStatus = useCallback(
    (
      userId: string,
      newStatus: AccountStatus
    ): { success: boolean; error?: string } => {
      if (!hasPermission(currentUser, 'users.deactivate')) {
        logSecurityEvent({
          action: 'users.status_change_attempt',
          resourceType: 'user',
          resourceId: userId,
          outcome: 'DENY',
          details: `User ${currentUser?.name} attempted to change account status without permission.`,
        })
        return {
          success: false,
          error: 'Unauthorized: Permission to manage account status required.',
        }
      }

      const target = users.find((u) => u.id === userId)
      if (!target) return { success: false, error: 'User not found.' }

      const validation = canManageUser(currentUser, target)
      if (!validation.allowed) {
        return { success: false, error: validation.reason }
      }

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status: newStatus } : u))
      )

      if (isSupabaseConfigured && supabase) {
        void (supabase as any).from('profiles').update({ account_status: newStatus }).eq('id', userId)
      }

      logSecurityEvent({
        action: newStatus === 'active' ? 'users.activated' : 'users.deactivated',
        resourceType: 'user',
        resourceId: userId,
        outcome: 'ALLOW',
        details: `Set account status of ${target.name} to ${newStatus}.`,
      })
      return { success: true }
    },
    [currentUser, users, logSecurityEvent]
  )

  const assignMachinesToTechnician = useCallback(
    (userId: string, machineIds: string[]): { success: boolean; error?: string } => {
      if (!hasPermission(currentUser, 'machines.assign')) {
        logSecurityEvent({
          action: 'machines.assign_attempt',
          resourceType: 'user',
          resourceId: userId,
          outcome: 'DENY',
          details: `User ${currentUser?.name} attempted to assign machines without 'machines.assign'.`,
        })
        return {
          success: false,
          error: 'Unauthorized: Permission to assign machines required.',
        }
      }

      const target = users.find((u) => u.id === userId)
      if (!target) return { success: false, error: 'User not found.' }

      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, assignedMachineIds: machineIds } : u
        )
      )

      logSecurityEvent({
        action: 'machines.assigned',
        resourceType: 'user',
        resourceId: userId,
        outcome: 'ALLOW',
        details: `Assigned ${machineIds.length} machines (${machineIds.join(', ') || 'None'}) to ${target.name}.`,
      })
      return { success: true }
    },
    [currentUser, users, logSecurityEvent]
  )

  const checkPermission = useCallback(
    (perm: Permission) => hasPermission(currentUser, perm),
    [currentUser]
  )

  const checkAnyPermission = useCallback(
    (perms: Permission[]) => hasAnyPermission(currentUser, perms),
    [currentUser]
  )

  const checkAllPermissions = useCallback(
    (perms: Permission[]) => hasAllPermissions(currentUser, perms),
    [currentUser]
  )

  const checkMachineAccess = useCallback(
    (m: Machine | string) => canAccessMachine(currentUser, m),
    [currentUser]
  )

  const checkOrderAccess = useCallback(
    (order: MaintenanceRecord) => canAccessMaintenanceOrder(currentUser, order),
    [currentUser]
  )

  const checkOrderModification = useCallback(
    (order: MaintenanceRecord) => canModifyMaintenanceOrder(currentUser, order),
    [currentUser]
  )

  const resetAuthToDefaults = useCallback(() => {
    setUsers(SEED_USERS)
    setCurrentUserId('usr-admin-1')
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY)
      localStorage.removeItem('iap-current-user-id')
    } catch {
      // ignore
    }
  }, [])

  const value = useMemo(
    () => ({
      currentUser,
      users,
      auditLog,
      isSupabaseConnected: isSupabaseConfigured,
      signInWithEmail,
      signOutUser,
      requestPasswordReset,
      switchUser,
      createUser,
      updateUserRole,
      setUserStatus,
      assignMachinesToTechnician,
      checkPermission,
      checkAnyPermission,
      checkAllPermissions,
      checkMachineAccess,
      checkOrderAccess,
      checkOrderModification,
      checkOrderModify: checkOrderModification,
      logSecurityEvent,
      logAudit,
      resetAuthToDefaults,
    }),
    [
      currentUser,
      users,
      auditLog,
      signInWithEmail,
      signOutUser,
      requestPasswordReset,
      switchUser,
      createUser,
      updateUserRole,
      setUserStatus,
      assignMachinesToTechnician,
      checkPermission,
      checkAnyPermission,
      checkAllPermissions,
      checkMachineAccess,
      checkOrderAccess,
      checkOrderModification,
      logSecurityEvent,
      logAudit,
      resetAuthToDefaults,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
