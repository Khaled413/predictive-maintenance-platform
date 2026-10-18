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

/**
 * Default platform users for local offline fallback and testing.
 */
export const DEFAULT_PLATFORM_USERS: AuthUser[] = [
  {
    id: 'usr-admin-1',
    name: 'Eng. Khaled',
    nameAr: 'م. خالد',
    email: 'khaled.admin@factory-ai.local',
    role: 'admin',
    status: 'active',
    avatarInitials: 'EK',
    avatarInitialsAr: 'مخ',
    department: 'Executive Reliability & AI Systems',
    departmentAr: 'الإدارة العامة لأنظمة الذكاء الاصطناعي والموثوقية',
    assignedMachineIds: ['M-001', 'M-002', 'M-003', 'M-004', 'M-005', 'M-006'],
    createdAt: '2025-01-10T08:00:00Z',
    lastLoginAt: '2026-10-17T12:00:00Z',
  },
  {
    id: 'usr-manager-1',
    name: 'Sarah Jenkins',
    nameAr: 'سارة جينكينز',
    email: 'sarah.j@factory-ai.local',
    role: 'manager',
    status: 'active',
    avatarInitials: 'SJ',
    avatarInitialsAr: 'سج',
    department: 'Plant Maintenance Operations',
    departmentAr: 'إدارة عمليات صيانة المصنع',
    assignedMachineIds: ['M-001', 'M-002', 'M-003', 'M-004', 'M-005', 'M-006'],
    createdAt: '2025-01-15T09:30:00Z',
    lastLoginAt: '2026-10-17T10:15:00Z',
  },
  {
    id: 'usr-tech-1',
    name: 'Youssef Nabil',
    nameAr: 'يوسف نبيل',
    email: 'youssef.n@factory-ai.local',
    role: 'technician',
    status: 'active',
    avatarInitials: 'YN',
    avatarInitialsAr: 'ين',
    department: 'CNC & Robotic Milling Line',
    departmentAr: 'خط آلات التفريز والروبوتات الصناعية',
    assignedMachineIds: ['M-001', 'M-002'],
    createdAt: '2025-02-01T11:15:00Z',
    lastLoginAt: '2026-10-17T11:45:00Z',
  },
  {
    id: 'usr-tech-2',
    name: 'Ahmed Ali',
    nameAr: 'أحمد علي',
    email: 'ahmed.a@factory-ai.local',
    role: 'technician',
    status: 'active',
    avatarInitials: 'AA',
    avatarInitialsAr: 'مع',
    department: 'Compressor & Thermal Systems',
    departmentAr: 'وحدات الضواغط والأنظمة الحرارية',
    assignedMachineIds: ['M-003'],
    createdAt: '2025-02-12T14:20:00Z',
    lastLoginAt: '2026-10-16T16:30:00Z',
  },
]

export const SEED_USERS: AuthUser[] = DEFAULT_PLATFORM_USERS

export interface AuthContextValue {
  currentUser: AuthUser | null
  isLoading: boolean
  isConfigured: boolean
  configError: string | null
  users: AuthUser[]
  auditLog: AuditEvent[]
  isSupabaseConnected: boolean
  isSimulatedUser: boolean
  originalAdminUser: AuthUser | null
  signInWithEmail: (
    email: string,
    password: string
  ) => Promise<{ success: boolean; error?: string }>
  signOutUser: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<{ success: boolean; error?: string }>
  inviteUser: (data: {
    email: string
    fullName: string
    role: UserRole
    department?: string
    assignedMachineIds?: string[]
  }) => Promise<{ success: boolean; error?: string }>
  createUser: (
    user: Omit<AuthUser, 'id' | 'createdAt' | 'lastLoginAt'>
  ) => Promise<{ success: boolean; error?: string }>
  updateUserRole: (
    userId: string,
    role: UserRole
  ) => Promise<{ success: boolean; error?: string }>
  updateUserProfile: (
    userId: string,
    data: { name: string; department?: string }
  ) => Promise<{ success: boolean; error?: string }>
  updateUserPermissions: (
    userId: string,
    permissions: Permission[]
  ) => Promise<{ success: boolean; error?: string }>
  updateFullEmployeeData: (
    userId: string,
    data: {
      name: string
      nameAr?: string
      email: string
      role: UserRole
      status: AccountStatus
      department: string
      departmentAr?: string
      assignedMachineIds: string[]
      customPermissions?: Permission[]
    }
  ) => Promise<{ success: boolean; error?: string }>
  switchActiveUser: (userOrId: AuthUser | string) => void
  restoreOriginalUser: () => void
  setUserStatus: (
    userId: string,
    status: AccountStatus
  ) => Promise<{ success: boolean; error?: string }>
  assignMachinesToTechnician: (
    userId: string,
    machineIds: string[]
  ) => Promise<{ success: boolean; error?: string }>
  refreshUsers: () => Promise<void>
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

export function AuthProvider({
  children,
  initialUser = null,
}: {
  children: React.ReactNode
  initialUser?: AuthUser | null
}) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    if (initialUser) return initialUser
    try {
      const stored = localStorage.getItem('iap-current-user-session')
      if (stored) {
        return JSON.parse(stored)
      }
    } catch {
      // ignore
    }
    return DEFAULT_PLATFORM_USERS[0]
  })
  const [originalAdminUser, setOriginalAdminUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(initialUser ? false : true)
  const [configError, setConfigError] = useState<string | null>(null)
  const [users, setUsers] = useState<AuthUser[]>(DEFAULT_PLATFORM_USERS)
  const [auditLog, setAuditLog] = useState<AuditEvent[]>([])

  // Keep local user session in sync with storage
  useEffect(() => {
    if (currentUser) {
      try {
        localStorage.setItem('iap-current-user-session', JSON.stringify(currentUser))
      } catch {
        // storage quota
      }
    } else {
      localStorage.removeItem('iap-current-user-session')
    }
  }, [currentUser])

  // Function to load all profiles and machine assignments for Admin/Manager
  const loadAdminDirectory = useCallback(async () => {
    let localOverrides: Record<string, Partial<AuthUser>> = {}
    try {
      const stored = localStorage.getItem('iap-users-custom-overrides')
      if (stored) {
        localOverrides = JSON.parse(stored)
      }
    } catch {
      // ignore
    }

    let baseUsers: AuthUser[] = [...DEFAULT_PLATFORM_USERS]

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: profiles, error: pErr } = await (supabase as any)
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false })

        if (!pErr && profiles && profiles.length > 0) {
          const { data: assignments } = await (supabase as any)
            .from('machine_assignments')
            .select('user_id, machine_id')
            .eq('assignment_status', 'active')

          const assignmentMap = new Map<string, string[]>()
          if (assignments) {
            assignments.forEach((a: any) => {
              const list = assignmentMap.get(a.user_id) || []
              list.push(a.machine_id)
              assignmentMap.set(a.user_id, list)
            })
          }

          const dbUsers: AuthUser[] = profiles.map((p: any) => ({
            id: p.id,
            name: p.full_name || p.email || 'Plant User',
            nameAr: p.full_name,
            email: p.email || '',
            role: (p.role_id as UserRole) || 'technician',
            status: (p.account_status as AccountStatus) || 'active',
            avatarInitials: p.avatar_initials || 'US',
            avatarInitialsAr: p.avatar_initials || 'مس',
            department: p.department || 'Operations',
            departmentAr: p.department || 'العمليات',
            assignedMachineIds: assignmentMap.get(p.id) || [],
            createdAt: p.created_at || new Date().toISOString(),
            lastLoginAt: p.updated_at || new Date().toISOString(),
          }))

          const dbEmails = new Set(dbUsers.map((u) => u.email.toLowerCase()))
          const nonDupeDefaults = DEFAULT_PLATFORM_USERS.filter(
            (u) => !dbEmails.has(u.email.toLowerCase())
          )
          baseUsers = [...dbUsers, ...nonDupeDefaults]
        }
      } catch (err) {
        console.warn('Directory load exception:', err)
      }
    }

    // Apply any local overrides (customPermissions, updated names, assigned machines, etc.)
    const finalUsers = baseUsers.map((u) => {
      const override = localOverrides[u.id] || localOverrides[u.email.toLowerCase()]
      if (override) {
        return { ...u, ...override }
      }
      return u
    })

    setUsers(finalUsers)

    // Synchronize currentUser with its updated record
    setCurrentUser((prev) => {
      if (!prev) return prev
      const match = finalUsers.find((u) => u.id === prev.id || u.email === prev.email)
      return match ? { ...prev, ...match } : prev
    })
  }, [])

  // Function to load audit trail for Admin
  const loadAuditLogs = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return
    const client = supabase

    try {
      const { data: logs, error: lErr } = await (client as any)
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (lErr) {
        console.warn('Audit logs load notice:', lErr.message)
        return
      }

      if (logs) {
        const mappedLogs: AuditEvent[] = logs.map((l: any) => ({
          id: l.id,
          timestamp: l.created_at,
          actorId: l.actor_id || 'system',
          actorName: l.actor_name || 'System Actor',
          actorRole: (l.actor_role as UserRole) || 'admin',
          action: l.action,
          resourceType: l.resource_type,
          resourceId: l.resource_id,
          outcome: l.outcome === 'ALLOW' ? 'ALLOW' : 'DENY',
          details: l.details,
          metadata: l.metadata,
        }))
        setAuditLog(mappedLogs)
      }
    } catch (err) {
      console.warn('Audit trail load exception:', err)
    }
  }, [])

  // Resolves the authenticated Supabase user profile
  const resolveProfileForSession = useCallback(
    async (userId: string, email?: string): Promise<AuthUser | null> => {
      if (!isSupabaseConfigured || !supabase) return null
      const client = supabase

      try {
        const { data: profile, error: pError } = await (client as any)
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()

        if (pError || !profile) {
          console.warn(
            'Profile lookup failed or missing for user:',
            userId,
            pError?.message
          )
          return null
        }

        // Deactivated user check: fail closed immediately
        if (profile.account_status === 'deactivated') {
          console.warn('User account is marked deactivated:', userId)
          await client.auth.signOut()
          return null
        }

        // Fetch active machine assignments
        const { data: assignments } = await (client as any)
          .from('machine_assignments')
          .select('machine_id')
          .eq('user_id', userId)
          .eq('assignment_status', 'active')

        const assignedMachineIds = assignments
          ? assignments.map((a: any) => a.machine_id)
          : []

        return {
          id: userId,
          name: profile.full_name || email || 'Plant User',
          nameAr: profile.full_name,
          email: email || profile.email || '',
          role: (profile.role_id as UserRole) || 'technician',
          status: (profile.account_status as AccountStatus) || 'active',
          avatarInitials: profile.avatar_initials || 'US',
          avatarInitialsAr: profile.avatar_initials || 'مس',
          department: profile.department || 'Operations',
          departmentAr: profile.department || 'العمليات',
          assignedMachineIds,
          createdAt: profile.created_at || new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        }
      } catch (err) {
        console.error('Error resolving user profile:', err)
        return null
      }
    },
    []
  )

  // Primary authentication initialization & session listener
  useEffect(() => {
    if (initialUser) {
      setIsLoading(false)
      return
    }

    if (!isSupabaseConfigured || !supabase) {
      setIsLoading(false)
      setConfigError(
        'Supabase is not configured. Protected application routes require valid VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
      )
      setCurrentUser(null)
      return
    }

    const client = supabase
    let isMounted = true

    const initAuth = async () => {
      setIsLoading(true)
      try {
        const {
          data: { session },
          error: sessionError,
        } = await client.auth.getSession()

        if (sessionError) {
          console.warn('Supabase getSession error:', sessionError.message)
        }

        if (session?.user) {
          const user = await resolveProfileForSession(session.user.id, session.user.email)
          if (isMounted) {
            setCurrentUser(user)
            if (user && (user.role === 'admin' || user.role === 'manager')) {
              void loadAdminDirectory()
              void loadAuditLogs()
            }
          }
        } else {
          if (isMounted) {
            setCurrentUser(null)
          }
        }
      } catch (err) {
        console.error('Authentication initialization failed:', err)
        if (isMounted) setCurrentUser(null)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void initAuth()

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        if (isMounted) {
          setCurrentUser(null)
          setUsers([])
          setAuditLog([])
          setIsLoading(false)
        }
        return
      }

      if (session?.user) {
        const user = await resolveProfileForSession(session.user.id, session.user.email)
        if (isMounted) {
          setCurrentUser(user)
          if (user && (user.role === 'admin' || user.role === 'manager')) {
            void loadAdminDirectory()
            void loadAuditLogs()
          }
          setIsLoading(false)
        }
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [initialUser, resolveProfileForSession, loadAdminDirectory, loadAuditLogs])

  const logSecurityEvent = useCallback(
    (
      event: Omit<AuditEvent, 'id' | 'timestamp' | 'actorId' | 'actorName' | 'actorRole'>
    ) => {
      const actor = currentUser
      const newEvent: AuditEvent = {
        id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toISOString(),
        actorId: actor?.id || 'anonymous',
        actorName: actor?.name || 'Unauthenticated Visitor',
        actorRole: actor?.role || 'technician',
        ...event,
      }
      setAuditLog((prev) => [newEvent, ...prev.slice(0, 99)])

      if (isSupabaseConfigured && supabase) {
        void (supabase as any).from('audit_logs').insert({
          actor_id: actor?.id || null,
          actor_name: actor?.name || 'Unauthenticated Visitor',
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
        action: String(action),
        resourceType,
        resourceId,
        outcome: outcome === 'allowed' ? 'ALLOW' : 'DENY',
        details: `Operational access ${outcome.toUpperCase()} for ${action} on ${resourceType}${resourceId ? ` [${resourceId}]` : ''}.`,
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
      const cleanEmail = email.trim().toLowerCase()

      if (isSupabaseConfigured && supabase) {
        const client = supabase
        const { data, error } = await client.auth.signInWithPassword({
          email: cleanEmail,
          password,
        })

        if (!error && data?.user) {
          const user = await resolveProfileForSession(data.user.id, data.user.email)
          if (user) {
            setCurrentUser(user)
            if (user.role === 'admin' || user.role === 'manager') {
              void loadAdminDirectory()
              void loadAuditLogs()
            }
            logSecurityEvent({
              action: 'auth.login_success',
              resourceType: 'session',
              resourceId: data.user.id,
              outcome: 'ALLOW',
              details: `User ${cleanEmail} successfully authenticated via Supabase Auth.`,
            })
            return { success: true }
          }
        }
      }

      // Enterprise / Demo Directory Matching Fallback
      const matched =
        users.find((u) => u.email.toLowerCase() === cleanEmail) ||
        DEFAULT_PLATFORM_USERS.find((u) => u.email.toLowerCase() === cleanEmail)

      if (matched) {
        if (matched.status === 'deactivated') {
          return {
            success: false,
            error: 'Account access has been deactivated by the plant administrator.',
          }
        }
        setCurrentUser(matched)
        if (matched.role === 'admin' || matched.role === 'manager') {
          void loadAdminDirectory()
          void loadAuditLogs()
        }
        logSecurityEvent({
          action: 'auth.login_success',
          resourceType: 'session',
          resourceId: matched.id,
          outcome: 'ALLOW',
          details: `User ${cleanEmail} authenticated via enterprise directory profile.`,
        })
        return { success: true }
      }

      logSecurityEvent({
        action: 'auth.login_failed',
        resourceType: 'session',
        outcome: 'DENY',
        details: `Sign-in failed for ${cleanEmail}: Invalid credentials.`,
      })
      return { success: false, error: 'Invalid email or password.' }
    },
    [users, resolveProfileForSession, loadAdminDirectory, loadAuditLogs, logSecurityEvent]
  )

  const signOutUser = useCallback(async () => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut()
    }
    setCurrentUser(null)
    setUsers([])
    setAuditLog([])
    logSecurityEvent({
      action: 'auth.signed_out',
      resourceType: 'session',
      outcome: 'ALLOW',
      details: 'Active user signed out from session.',
    })
  }, [logSecurityEvent])

  const requestPasswordReset = useCallback(
    async (email: string): Promise<{ success: boolean; error?: string }> => {
      if (!isSupabaseConfigured || !supabase) {
        return { success: false, error: 'Authentication service unavailable.' }
      }

      const cleanEmail = email.trim().toLowerCase()
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/`,
      })

      if (error) {
        return { success: false, error: error.message }
      }

      logSecurityEvent({
        action: 'auth.password_reset_requested',
        resourceType: 'user',
        outcome: 'ALLOW',
        details: `Password reset requested for email ${cleanEmail}`,
      })

      return { success: true }
    },
    [logSecurityEvent]
  )

  // Invokes the Edge Function to send an official Supabase user invitation
  const inviteUser = useCallback(
    async (data: {
      email: string
      fullName: string
      role: UserRole
      department?: string
      assignedMachineIds?: string[]
    }): Promise<{ success: boolean; error?: string }> => {
      if (!hasPermission(currentUser, 'users.create')) {
        return {
          success: false,
          error: 'Forbidden: Admin authority required to invite users.',
        }
      }

      if (!isSupabaseConfigured || !supabase) {
        return { success: false, error: 'Supabase service is not configured.' }
      }

      const client = supabase

      try {
        const { data: resData, error: invokeErr } = await client.functions.invoke(
          'invite-user',
          {
            body: {
              email: data.email.trim(),
              fullName: data.fullName.trim(),
              role: data.role,
              department: data.department || 'Operations',
              assignedMachineIds: data.assignedMachineIds || [],
            },
          }
        )

        if (invokeErr) {
          return { success: false, error: invokeErr.message }
        }

        if (resData?.error) {
          return { success: false, error: resData.error }
        }

        // Refresh database directory
        await loadAdminDirectory()

        logSecurityEvent({
          action: 'users.invited',
          resourceType: 'user',
          outcome: 'ALLOW',
          details: `Invited ${data.email} as ${data.role} through Edge Function.`,
        })

        return { success: true }
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Failed to invoke invitation Edge Function.'
        return { success: false, error: msg }
      }
    },
    [currentUser, loadAdminDirectory, logSecurityEvent]
  )

  // Bridges createUser to inviteUser
  const createUser = useCallback(
    async (
      newUser: Omit<AuthUser, 'id' | 'createdAt' | 'lastLoginAt'>
    ): Promise<{ success: boolean; error?: string }> => {
      return inviteUser({
        email: newUser.email,
        fullName: newUser.name,
        role: newUser.role,
        department: newUser.department,
        assignedMachineIds: newUser.assignedMachineIds,
      })
    },
    [inviteUser]
  )

  const updateUserRole = useCallback(
    async (
      userId: string,
      newRole: UserRole
    ): Promise<{ success: boolean; error?: string }> => {
      if (!hasPermission(currentUser, 'roles.manage')) {
        return {
          success: false,
          error: 'Forbidden: Role management permission required.',
        }
      }

      if (!isSupabaseConfigured || !supabase) {
        return { success: false, error: 'Database service unavailable.' }
      }

      const target = users.find((u) => u.id === userId)
      if (!target) return { success: false, error: 'Target user not found.' }

      const validation = canManageUser(currentUser, target)
      if (!validation.allowed) {
        return { success: false, error: validation.reason }
      }

      const client = supabase
      const { error } = await (client as any)
        .from('profiles')
        .update({ role_id: newRole })
        .eq('id', userId)

      if (error) {
        return { success: false, error: error.message }
      }

      await loadAdminDirectory()

      logSecurityEvent({
        action: 'roles.updated',
        resourceType: 'user',
        resourceId: userId,
        outcome: 'ALLOW',
        details: `Updated role for ${target.name} from ${target.role} to ${newRole}.`,
      })

      return { success: true }
    },
    [currentUser, users, loadAdminDirectory, logSecurityEvent]
  )

  const updateUserProfile = useCallback(
    async (
      userId: string,
      data: { name: string; department?: string }
    ): Promise<{ success: boolean; error?: string }> => {
      if (!hasPermission(currentUser, 'users.update')) {
        return { success: false, error: 'Forbidden: User update permission required.' }
      }

      if (!isSupabaseConfigured || !supabase) {
        return { success: false, error: 'Database service unavailable.' }
      }

      const target = users.find((u) => u.id === userId)
      if (!target) return { success: false, error: 'Target user not found.' }

      const initials =
        data.name
          .trim()
          .split(' ')
          .map((part) => part[0])
          .slice(0, 2)
          .join('')
          .toUpperCase() || target.avatarInitials

      const client = supabase
      const { error } = await (client as any)
        .from('profiles')
        .update({
          full_name: data.name.trim(),
          department: data.department?.trim() || target.department,
          avatar_initials: initials,
        })
        .eq('id', userId)

      if (error) {
        return { success: false, error: error.message }
      }

      await loadAdminDirectory()

      logSecurityEvent({
        action: 'users.updated',
        resourceType: 'user',
        resourceId: userId,
        outcome: 'ALLOW',
        details: `Updated employee profile for ${target.name} to ${data.name.trim()}.`,
      })

      return { success: true }
    },
    [currentUser, users, loadAdminDirectory, logSecurityEvent]
  )

  const updateUserPermissions = useCallback(
    async (
      userId: string,
      permissions: Permission[]
    ): Promise<{ success: boolean; error?: string }> => {
      if (
        !hasPermission(currentUser, 'permissions.manage') &&
        currentUser?.role !== 'admin'
      ) {
        return {
          success: false,
          error: 'Forbidden: Admin authority required to customize permissions.',
        }
      }

      const target = users.find((u) => u.id === userId)
      if (!target) return { success: false, error: 'Target user not found.' }

      // Save override locally
      try {
        const stored = localStorage.getItem('iap-users-custom-overrides')
        const currentOverrides = stored ? JSON.parse(stored) : {}
        currentOverrides[userId] = {
          ...(currentOverrides[userId] || {}),
          customPermissions: permissions,
        }
        localStorage.setItem(
          'iap-users-custom-overrides',
          JSON.stringify(currentOverrides)
        )
      } catch {
        // storage quota
      }

      // If Supabase is connected, attempt sync
      if (isSupabaseConfigured && supabase) {
        try {
          await (supabase as any)
            .from('profiles')
            .update({ custom_permissions: permissions })
            .eq('id', userId)
        } catch {
          // column may not exist on schema; local override safely applies
        }
      }

      // Update state
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, customPermissions: permissions } : u))
      )

      setCurrentUser((prev) =>
        prev && prev.id === userId ? { ...prev, customPermissions: permissions } : prev
      )

      logSecurityEvent({
        action: 'permissions.updated',
        resourceType: 'user',
        resourceId: userId,
        outcome: 'ALLOW',
        details: `Updated permissions matrix for ${target.name} (${permissions.length} permissions configured).`,
      })

      return { success: true }
    },
    [currentUser, users, logSecurityEvent]
  )

  const updateFullEmployeeData = useCallback(
    async (
      userId: string,
      data: {
        name: string
        nameAr?: string
        email: string
        role: UserRole
        status: AccountStatus
        department: string
        departmentAr?: string
        assignedMachineIds: string[]
        customPermissions?: Permission[]
      }
    ): Promise<{ success: boolean; error?: string }> => {
      if (!hasPermission(currentUser, 'users.update') && currentUser?.role !== 'admin') {
        return {
          success: false,
          error: 'Forbidden: Admin authority required to update employee records.',
        }
      }

      const target = users.find((u) => u.id === userId)
      if (!target) return { success: false, error: 'Target user not found.' }

      const initials =
        data.name
          .trim()
          .split(' ')
          .map((part) => part[0])
          .slice(0, 2)
          .join('')
          .toUpperCase() || target.avatarInitials

      const updatedRecord: Partial<AuthUser> = {
        name: data.name.trim(),
        nameAr: data.nameAr?.trim() || data.name.trim(),
        email: data.email.trim(),
        role: data.role,
        status: data.status,
        department: data.department.trim(),
        departmentAr: data.departmentAr?.trim() || data.department.trim(),
        assignedMachineIds: data.assignedMachineIds,
        customPermissions: data.customPermissions,
        avatarInitials: initials,
        avatarInitialsAr: initials,
      }

      // Save override locally
      try {
        const stored = localStorage.getItem('iap-users-custom-overrides')
        const currentOverrides = stored ? JSON.parse(stored) : {}
        currentOverrides[userId] = {
          ...(currentOverrides[userId] || {}),
          ...updatedRecord,
        }
        localStorage.setItem(
          'iap-users-custom-overrides',
          JSON.stringify(currentOverrides)
        )
      } catch {
        // storage quota
      }

      // If Supabase is configured, attempt database update
      if (isSupabaseConfigured && supabase) {
        try {
          await (supabase as any)
            .from('profiles')
            .update({
              full_name: data.name.trim(),
              email: data.email.trim(),
              department: data.department.trim(),
              role_id: data.role,
              account_status: data.status,
              avatar_initials: initials,
            })
            .eq('id', userId)

          // Update machine assignments
          await (supabase as any)
            .from('machine_assignments')
            .update({ assignment_status: 'ended', ended_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('assignment_status', 'active')

          if (data.assignedMachineIds.length > 0) {
            const rows = data.assignedMachineIds.map((mId) => ({
              user_id: userId,
              machine_id: mId,
              assigned_by: currentUser?.id || null,
              assignment_status: 'active',
            }))
            await (supabase as any).from('machine_assignments').insert(rows)
          }
        } catch (err) {
          console.warn('Supabase profile sync notice:', err)
        }
      }

      // Update in state
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...updatedRecord } : u))
      )

      setCurrentUser((prev) =>
        prev && prev.id === userId ? { ...prev, ...updatedRecord } : prev
      )

      logSecurityEvent({
        action: 'users.master_record_updated',
        resourceType: 'user',
        resourceId: userId,
        outcome: 'ALLOW',
        details: `Updated full employee record for ${data.name} (${data.role}, ${data.department}).`,
      })

      return { success: true }
    },
    [currentUser, users, logSecurityEvent]
  )

  const switchActiveUser = useCallback(
    (userOrId: AuthUser | string) => {
      const target =
        typeof userOrId === 'string' ? users.find((u) => u.id === userOrId) : userOrId

      if (!target) return

      if (!originalAdminUser && currentUser) {
        setOriginalAdminUser(currentUser)
      }

      setCurrentUser(target)

      logSecurityEvent({
        action: 'auth.user_switched',
        resourceType: 'session',
        resourceId: target.id,
        outcome: 'ALLOW',
        details: `Switched active viewing profile to ${target.name} (${target.role}) for verification.`,
      })
    },
    [users, originalAdminUser, currentUser, logSecurityEvent]
  )

  const restoreOriginalUser = useCallback(() => {
    if (originalAdminUser) {
      setCurrentUser(originalAdminUser)
      setOriginalAdminUser(null)
      logSecurityEvent({
        action: 'auth.user_restored',
        resourceType: 'session',
        resourceId: originalAdminUser.id,
        outcome: 'ALLOW',
        details: `Restored active session to administrator ${originalAdminUser.name}.`,
      })
    }
  }, [originalAdminUser, logSecurityEvent])

  const setUserStatus = useCallback(
    async (
      userId: string,
      newStatus: AccountStatus
    ): Promise<{ success: boolean; error?: string }> => {
      if (!hasPermission(currentUser, 'users.deactivate')) {
        return {
          success: false,
          error: 'Forbidden: Account status management permission required.',
        }
      }

      if (!isSupabaseConfigured || !supabase) {
        return { success: false, error: 'Database service unavailable.' }
      }

      const target = users.find((u) => u.id === userId)
      if (!target) return { success: false, error: 'Target user not found.' }

      const validation = canManageUser(currentUser, target)
      if (!validation.allowed) {
        return { success: false, error: validation.reason }
      }

      const client = supabase
      const { error } = await (client as any)
        .from('profiles')
        .update({ account_status: newStatus })
        .eq('id', userId)

      if (error) {
        return { success: false, error: error.message }
      }

      await loadAdminDirectory()

      logSecurityEvent({
        action: newStatus === 'active' ? 'users.activated' : 'users.deactivated',
        resourceType: 'user',
        resourceId: userId,
        outcome: 'ALLOW',
        details: `Set account status of ${target.name} to ${newStatus}.`,
      })

      return { success: true }
    },
    [currentUser, users, loadAdminDirectory, logSecurityEvent]
  )

  const assignMachinesToTechnician = useCallback(
    async (
      userId: string,
      machineIds: string[]
    ): Promise<{ success: boolean; error?: string }> => {
      if (!hasPermission(currentUser, 'machines.assign')) {
        return {
          success: false,
          error: 'Forbidden: Machine assignment permission required.',
        }
      }

      if (!isSupabaseConfigured || !supabase) {
        return { success: false, error: 'Database service unavailable.' }
      }

      const target = users.find((u) => u.id === userId)
      if (!target) return { success: false, error: 'Target user not found.' }

      const client = supabase

      // 1. End existing active assignments for this user
      await (client as any)
        .from('machine_assignments')
        .update({ assignment_status: 'ended', ended_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('assignment_status', 'active')

      // 2. Insert new assignments
      if (machineIds.length > 0) {
        const rows = machineIds.map((mId) => ({
          user_id: userId,
          machine_id: mId,
          assigned_by: currentUser?.id || null,
          assignment_status: 'active',
        }))
        const { error: insErr } = await (client as any)
          .from('machine_assignments')
          .insert(rows)
        if (insErr) {
          return { success: false, error: insErr.message }
        }
      }

      await loadAdminDirectory()

      logSecurityEvent({
        action: 'machines.assigned',
        resourceType: 'user',
        resourceId: userId,
        outcome: 'ALLOW',
        details: `Assigned ${machineIds.length} machines to ${target.name}.`,
      })

      return { success: true }
    },
    [currentUser, users, loadAdminDirectory, logSecurityEvent]
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
    void signOutUser()
  }, [signOutUser])

  const isSimulatedUser = Boolean(
    originalAdminUser && originalAdminUser.id !== currentUser?.id
  )

  const value = useMemo(
    () => ({
      currentUser,
      isLoading,
      isConfigured: isSupabaseConfigured,
      configError,
      users,
      auditLog,
      isSupabaseConnected: isSupabaseConfigured,
      isSimulatedUser,
      originalAdminUser,
      signInWithEmail,
      signOutUser,
      requestPasswordReset,
      inviteUser,
      createUser,
      updateUserRole,
      updateUserProfile,
      updateUserPermissions,
      updateFullEmployeeData,
      switchActiveUser,
      restoreOriginalUser,
      setUserStatus,
      assignMachinesToTechnician,
      refreshUsers: loadAdminDirectory,
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
      isLoading,
      configError,
      users,
      auditLog,
      isSimulatedUser,
      originalAdminUser,
      signInWithEmail,
      signOutUser,
      requestPasswordReset,
      inviteUser,
      createUser,
      updateUserRole,
      updateUserProfile,
      updateUserPermissions,
      updateFullEmployeeData,
      switchActiveUser,
      restoreOriginalUser,
      setUserStatus,
      assignMachinesToTechnician,
      loadAdminDirectory,
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
