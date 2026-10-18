import { useState, useMemo, useEffect } from 'react'
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  Wrench,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  History,
  Lock,
  Edit2,
  Cpu,
  Eye,
  RotateCcw,
  Check,
  X,
  Mail,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { usePreferences } from '../context/PreferencesContext'
import type { AccountStatus, UserRole, Permission, AuthUser } from '../types/auth'
import { PERMISSION_GROUPS } from '../types/auth'
import { getUserPermissions, ROLE_PERMISSIONS } from '../utils/rbac'

export default function UsersPage() {
  const {
    currentUser,
    users,
    auditLog,
    createUser,
    updateUserRole,
    updateUserPermissions,
    updateFullEmployeeData,
    switchActiveUser,
    setUserStatus,
    assignMachinesToTechnician,
    refreshUsers,
  } = useAuth()
  const { machines } = useApp()
  const { t, language } = usePreferences()

  useEffect(() => {
    void refreshUsers()
  }, [refreshUsers])

  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | AccountStatus>('ALL')

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [roleModalUser, setRoleModalUser] = useState<{
    id: string
    name: string
    currentRole: UserRole
  } | null>(null)
  const [newSelectedRole, setNewSelectedRole] = useState<UserRole>('technician')
  const [assignModalUser, setAssignModalUser] = useState<{
    id: string
    name: string
    assigned: string[]
  } | null>(null)
  const [selectedMachineIds, setSelectedMachineIds] = useState<string[]>([])

  // Comprehensive Full Employee Record Editor state
  const [fullEditUser, setFullEditUser] = useState<AuthUser | null>(null)
  const [editFullName, setEditFullName] = useState('')
  const [editFullNameAr, setEditFullNameAr] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editRole, setEditRole] = useState<UserRole>('technician')
  const [editStatus, setEditStatus] = useState<AccountStatus>('active')
  const [editDepartment, setEditDepartment] = useState('')
  const [editDepartmentAr, setEditDepartmentAr] = useState('')
  const [editAssignedMachineIds, setEditAssignedMachineIds] = useState<string[]>([])
  const [isSavingFullEdit, setIsSavingFullEdit] = useState(false)

  // Granular Permissions & Visibility Manager state
  const [permissionsModalUser, setPermissionsModalUser] = useState<AuthUser | null>(null)
  const [selectedPermissions, setSelectedPermissions] = useState<Permission[]>([])
  const [isSavingPermissions, setIsSavingPermissions] = useState(false)

  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // New user form state
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState<UserRole>('technician')
  const [newDepartment, setNewDepartment] = useState('')

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        (u.nameAr && u.nameAr.includes(search)) ||
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.department.toLowerCase().includes(search.toLowerCase())
      const matchRole = roleFilter === 'ALL' || u.role === roleFilter
      const matchStatus = statusFilter === 'ALL' || u.status === statusFilter
      return matchSearch && matchRole && matchStatus
    })
  }, [users, search, roleFilter, statusFilter])

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setActionError(null)

    if (!newName.trim() || !newEmail.trim()) {
      setActionError(t('Please fill in all required fields'))
      return
    }

    const initials = newName
      .trim()
      .split(' ')
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()

    const result = await createUser({
      name: newName.trim(),
      email: newEmail.trim(),
      role: newRole,
      status: 'active',
      avatarInitials: initials || 'US',
      avatarInitialsAr: initials || 'مس',
      department: newDepartment.trim() || 'Plant Operations',
      departmentAr: newDepartment.trim() || 'عمليات المصنع',
      assignedMachineIds: [],
    })

    if (result.success) {
      setCreateModalOpen(false)
      setNewName('')
      setNewEmail('')
      setNewDepartment('')
      setNewRole('technician')
    } else {
      setActionError(result.error ?? 'Failed to invite user')
    }
  }

  const handleRoleChangeConfirm = async () => {
    if (!roleModalUser) return
    setActionError(null)

    const result = await updateUserRole(roleModalUser.id, newSelectedRole)
    if (result.success) {
      setRoleModalUser(null)
    } else {
      setActionError(result.error ?? 'Failed to change role')
    }
  }

  const handleSaveAssignments = async () => {
    if (!assignModalUser) return
    setActionError(null)

    const result = await assignMachinesToTechnician(
      assignModalUser.id,
      selectedMachineIds
    )
    if (result.success) {
      setAssignModalUser(null)
    } else {
      setActionError(result.error ?? 'Failed to assign machines')
    }
  }

  const openFullEditModal = (user: AuthUser) => {
    setActionError(null)
    setActionSuccess(null)
    setFullEditUser(user)
    setEditFullName(user.name)
    setEditFullNameAr(user.nameAr || user.name)
    setEditEmail(user.email)
    setEditRole(user.role)
    setEditStatus(user.status)
    setEditDepartment(user.department)
    setEditDepartmentAr(user.departmentAr || user.department)
    setEditAssignedMachineIds([...user.assignedMachineIds])
  }

  const handleSaveFullEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullEditUser) return
    setActionError(null)
    setActionSuccess(null)

    if (!editFullName.trim() || !editEmail.trim()) {
      setActionError(t('Please fill in all required fields'))
      return
    }

    setIsSavingFullEdit(true)
    const result = await updateFullEmployeeData(fullEditUser.id, {
      name: editFullName.trim(),
      nameAr: editFullNameAr.trim() || editFullName.trim(),
      email: editEmail.trim(),
      role: editRole,
      status: editStatus,
      department: editDepartment.trim() || 'Plant Operations',
      departmentAr: editDepartmentAr.trim() || 'عمليات المصنع',
      assignedMachineIds: editAssignedMachineIds,
      customPermissions: fullEditUser.customPermissions,
    })
    setIsSavingFullEdit(false)

    if (result.success) {
      setFullEditUser(null)
      setActionSuccess(t('Employee record updated successfully'))
      setTimeout(() => setActionSuccess(null), 4000)
    } else {
      setActionError(result.error ?? 'Failed to update employee details')
    }
  }

  const openPermissionsModal = (user: AuthUser) => {
    setActionError(null)
    setActionSuccess(null)
    setPermissionsModalUser(user)
    setSelectedPermissions([...getUserPermissions(user)])
  }

  const handleSavePermissions = async () => {
    if (!permissionsModalUser) return
    setActionError(null)
    setActionSuccess(null)
    setIsSavingPermissions(true)

    const result = await updateUserPermissions(
      permissionsModalUser.id,
      selectedPermissions
    )
    setIsSavingPermissions(false)

    if (result.success) {
      setPermissionsModalUser(null)
      setActionSuccess(
        `${t('Permissions updated for')} ${permissionsModalUser.name} (${selectedPermissions.length} ${t('permissions granted')})`
      )
      setTimeout(() => setActionSuccess(null), 4000)
    } else {
      setActionError(result.error ?? 'Failed to update permissions')
    }
  }

  const togglePermission = (key: Permission) => {
    setSelectedPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    )
  }

  const handleResetToRolePermissions = () => {
    if (!permissionsModalUser) return
    const baseline = ROLE_PERMISSIONS[permissionsModalUser.role] || []
    setSelectedPermissions([...baseline])
  }

  const handleSelectAllPermissions = () => {
    const all = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key))
    setSelectedPermissions(Array.from(new Set(all)))
  }

  const handleDeselectAllPermissions = () => {
    setSelectedPermissions([])
  }

  const roleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10.5px] font-bold text-purple-300">
            <Shield className="h-3 w-3" />
            {t('Admin')}
          </span>
        )
      case 'manager':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10.5px] font-bold text-sky-300">
            <Users className="h-3 w-3" />
            {t('Maintenance Manager')}
          </span>
        )
      case 'technician':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-bold text-emerald-300">
            <Wrench className="h-3 w-3" />
            {t('Technician')}
          </span>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="panel p-5 relative overflow-hidden">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-600/30 border border-indigo-400/30 text-indigo-300">
                <Users className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
                  <span className="text-gradient">{t('User Management & RBAC')}</span>
                </h1>
                <p className="text-xs text-ink-dim">
                  {t(
                    'Manage user roles, operational machine assignments, and review security audit logs.'
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-line bg-navy-800/60 p-1">
              <button
                type="button"
                onClick={() => setActiveTab('users')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeTab === 'users'
                    ? 'bg-sky-500 text-white shadow-sm'
                    : 'text-ink-dim hover:text-ink'
                }`}
              >
                {t('Users Directory')} ({users.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('audit')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeTab === 'audit'
                    ? 'bg-sky-500 text-white shadow-sm'
                    : 'text-ink-dim hover:text-ink'
                }`}
              >
                <History className="h-3.5 w-3.5" />
                {t('Audit Trail')} ({auditLog.length})
              </button>
            </div>

            {currentUser?.role === 'admin' && activeTab === 'users' && (
              <button
                type="button"
                onClick={() => {
                  setActionError(null)
                  setCreateModalOpen(true)
                }}
                className="btn-primary"
              >
                <UserPlus className="h-4 w-4" />
                {t('Create User')}
              </button>
            )}
          </div>
        </div>
      </div>

      {actionError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/15 p-3.5 text-xs text-red-200">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 p-3.5 text-xs text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {activeTab === 'users' ? (
        <>
          {/* Filters Bar */}
          <div className="panel p-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <input
                type="text"
                placeholder={t('Search users by name, email, or department...')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label={t('Filter by Role')}
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
                className="input w-auto text-xs"
              >
                <option value="ALL">{t('All Roles')}</option>
                <option value="admin">{t('Admin')}</option>
                <option value="manager">{t('Maintenance Manager')}</option>
                <option value="technician">{t('Technician')}</option>
              </select>

              <select
                aria-label={t('Filter by Status')}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="input w-auto text-xs"
              >
                <option value="ALL">{t('All Statuses')}</option>
                <option value="active">{t('Active')}</option>
                <option value="deactivated">{t('Deactivated')}</option>
              </select>
            </div>
          </div>

          {/* Users Table / Grid */}
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line bg-navy-800/40 text-[11px] font-semibold text-ink-faint uppercase tracking-wider">
                    <th className="px-4 py-3">{t('User')}</th>
                    <th className="px-4 py-3">{t('Role')}</th>
                    <th className="px-4 py-3">{t('Status')}</th>
                    <th className="px-4 py-3">{t('Department')}</th>
                    <th className="px-4 py-3">{t('Assigned Machines')}</th>
                    <th className="px-4 py-3 text-right">{t('Actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/40">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-ink-faint">
                        {t('No users found matching your search and filter criteria.')}
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => {
                      const isSelf = currentUser?.id === user.id
                      return (
                        <tr
                          key={user.id}
                          className="hover:bg-navy-800/30 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-600 text-xs font-bold text-white shadow-sm ring-1 ring-white/10">
                                {language === 'ar'
                                  ? user.avatarInitialsAr
                                  : user.avatarInitials}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-ink truncate">
                                  {language === 'ar' && user.nameAr
                                    ? user.nameAr
                                    : user.name}
                                  {isSelf && (
                                    <span className="ml-1.5 text-[10px] text-sky-400 font-normal">
                                      ({t('You')})
                                    </span>
                                  )}
                                </p>
                                <p className="text-[11px] text-ink-faint font-mono truncate">
                                  {user.email}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {roleBadge(user.role)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {user.status === 'active' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                {t('Active')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-300">
                                <XCircle className="h-3.5 w-3.5 text-red-400" />
                                {t('Deactivated')}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-ink-dim truncate max-w-xs">
                            {language === 'ar' && user.departmentAr
                              ? user.departmentAr
                              : user.department}
                          </td>
                          <td className="px-4 py-3">
                            {user.role === 'technician' ? (
                              user.assignedMachineIds.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {user.assignedMachineIds.map((mId) => (
                                    <span
                                      key={mId}
                                      className="rounded bg-navy-800 px-1.5 py-0.5 text-[10px] font-mono text-sky-300 border border-sky-400/20"
                                    >
                                      {mId}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-ink-faint italic text-[11px]">
                                  {t('No machines assigned')}
                                </span>
                              )
                            ) : (
                              <span className="text-ink-faint text-[11px]">
                                {t('Fleet-wide scope')}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {currentUser?.role === 'admin' ? (
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                {/* Granular Permissions & Visibility Button */}
                                <button
                                  type="button"
                                  onClick={() => openPermissionsModal(user)}
                                  className="btn-ghost px-2 py-1 h-7 text-[11px] text-emerald-400 hover:text-emerald-300 hover:border-emerald-500/40"
                                  title={t(
                                    'Customize individual permissions & module visibility'
                                  )}
                                >
                                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                                  <span className="hidden sm:inline font-medium">
                                    {t('Permissions')}
                                  </span>
                                </button>

                                {/* Comprehensive Edit All Employee Data Button */}
                                <button
                                  type="button"
                                  onClick={() => openFullEditModal(user)}
                                  className="btn-ghost px-2 py-1 h-7 text-[11px] text-sky-400 hover:text-sky-300 hover:border-sky-500/40"
                                  title={t(
                                    'Edit all employee data (Name, Role, Dept, Machines, etc.)'
                                  )}
                                >
                                  <Edit2 className="h-3 w-3 text-sky-400" />
                                  <span className="hidden sm:inline font-medium">
                                    {t('Edit All')}
                                  </span>
                                </button>

                                {/* Assign Machines for Technicians */}
                                {user.role === 'technician' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAssignModalUser({
                                        id: user.id,
                                        name: user.name,
                                        assigned: [...user.assignedMachineIds],
                                      })
                                      setSelectedMachineIds([...user.assignedMachineIds])
                                    }}
                                    className="btn-ghost px-2 py-1 h-7 text-[11px]"
                                    title={t('Assign Machines')}
                                  >
                                    <Cpu className="h-3.5 w-3.5 text-cyan-400" />
                                    <span className="hidden sm:inline">
                                      {t('Assign')}
                                    </span>
                                  </button>
                                )}

                                {/* Switch to User for Preview/Verification */}
                                {!isSelf && (
                                  <button
                                    type="button"
                                    onClick={() => switchActiveUser(user)}
                                    className="btn-ghost px-2 py-1 h-7 text-[11px] text-indigo-400 hover:text-indigo-300 hover:border-indigo-500/40"
                                    title={t(
                                      'Switch to this user to test visible modules and private chat'
                                    )}
                                  >
                                    <Eye className="h-3.5 w-3.5 text-indigo-400" />
                                    <span className="hidden sm:inline font-medium">
                                      {t('View As')}
                                    </span>
                                  </button>
                                )}

                                {/* Account Deactivation / Activation */}
                                {!isSelf && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      setActionError(null)
                                      setActionSuccess(null)
                                      const next =
                                        user.status === 'active'
                                          ? 'deactivated'
                                          : 'active'
                                      const res = await setUserStatus(user.id, next)
                                      if (!res.success) {
                                        setActionError(
                                          res.error ?? 'Failed to update user status'
                                        )
                                      } else {
                                        setActionSuccess(
                                          `${t('Account')} ${next === 'active' ? t('activated') : t('deactivated')} ${t('for')} ${user.name}`
                                        )
                                        setTimeout(() => setActionSuccess(null), 3500)
                                      }
                                    }}
                                    className={`btn-ghost px-2 py-1 h-7 text-[11px] ${
                                      user.status === 'active'
                                        ? 'text-red-400 hover:border-red-400/40 hover:text-red-300'
                                        : 'text-emerald-400 hover:border-emerald-400/40 hover:text-emerald-300'
                                    }`}
                                  >
                                    {user.status === 'active'
                                      ? t('Deactivate')
                                      : t('Activate')}
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] text-ink-faint italic">
                                <Lock className="inline h-3 w-3 mr-1" />
                                {t('Admin only')}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Audit Trail View */
        <div className="panel p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <History className="h-4 w-4 text-sky-400" />
                {t('Security Audit & RBAC Event Log')}
              </h2>
              <p className="text-xs text-ink-faint">
                {t(
                  'Chronological immutable record of security and authorization events.'
                )}
              </p>
            </div>
            <span className="rounded-md border border-line bg-navy-800 px-2 py-1 font-mono text-[11px] text-ink-dim">
              {auditLog.length} {t('Events logged')}
            </span>
          </div>

          <div className="space-y-2">
            {auditLog.map((event) => (
              <div
                key={event.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-line/50 bg-navy-800/40 p-3 text-xs hover:border-sky-400/30 transition-all"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <span
                    className={`mt-0.5 flex h-2 w-2 shrink-0 rounded-full ${
                      event.outcome === 'ALLOW' ? 'bg-emerald-400' : 'bg-red-400'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] font-bold text-sky-300">
                        {event.action}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${
                          event.outcome === 'ALLOW'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-red-500/20 text-red-300 border border-red-500/30'
                        }`}
                      >
                        {event.outcome}
                      </span>
                      <span className="text-ink-faint">·</span>
                      <span className="text-ink font-medium">
                        {event.actorName} ({event.actorRole})
                      </span>
                    </div>
                    {event.details && (
                      <p className="mt-1 text-ink-dim text-[11px] leading-relaxed">
                        {event.details}
                      </p>
                    )}
                  </div>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-ink-faint self-start sm:self-center">
                  {new Date(event.timestamp).toLocaleTimeString()} ·{' '}
                  {new Date(event.timestamp).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="panel w-full max-w-md p-6 space-y-4 border border-line shadow-2xl">
            <h3 className="text-lg font-bold text-ink flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-sky-400" />
              {t('Create New Platform User')}
            </h3>

            <form onSubmit={handleCreateUser} className="space-y-3.5">
              <div>
                <label className="label">{t('Full Name')}</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Youssef Nabil"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="input"
                />
              </div>

              <div>
                <label className="label">{t('Email Address')}</label>
                <input
                  type="email"
                  required
                  placeholder="user@factory-ai.local"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="input"
                />
              </div>

              <div>
                <label className="label">{t('Organizational Role')}</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="input"
                >
                  <option value="technician">
                    {t('Technician (Assigned scope only)')}
                  </option>
                  <option value="manager">
                    {t('Maintenance Manager (Fleet-wide operations)')}
                  </option>
                  <option value="admin">{t('Admin (Full system authority)')}</option>
                </select>
              </div>

              <div>
                <label className="label">{t('Department / Assignment Unit')}</label>
                <input
                  type="text"
                  placeholder="e.g. Mechanical Assembly Line 3"
                  value={newDepartment}
                  onChange={(e) => setNewDepartment(e.target.value)}
                  className="input"
                />
              </div>

              <div className="mt-6 flex justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="btn-ghost"
                >
                  {t('Cancel')}
                </button>
                <button type="submit" className="btn-primary">
                  {t('Save User')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Role Change Confirmation Modal */}
      {roleModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="panel w-full max-w-sm p-6 space-y-4 border border-line shadow-2xl">
            <h3 className="text-base font-bold text-ink flex items-center gap-2">
              <Shield className="h-5 w-5 text-amber-400" />
              {t('Confirm Role Change')}
            </h3>

            <p className="text-xs text-ink-dim leading-relaxed">
              {t('Are you sure you want to change permissions for')}{' '}
              <strong className="text-ink">{roleModalUser.name}</strong>?
            </p>

            <div>
              <label className="label">{t('New Assigned Role')}</label>
              <select
                value={newSelectedRole}
                onChange={(e) => setNewSelectedRole(e.target.value as UserRole)}
                className="input"
              >
                <option value="technician">{t('Technician')}</option>
                <option value="manager">{t('Maintenance Manager')}</option>
                <option value="admin">{t('Admin')}</option>
              </select>
            </div>

            <div className="mt-6 flex justify-end gap-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setRoleModalUser(null)}
                className="btn-ghost"
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                onClick={handleRoleChangeConfirm}
                className="btn-primary"
              >
                {t('Confirm Change')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Machines to Technician Modal */}
      {assignModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="panel w-full max-w-lg p-6 space-y-4 border border-line shadow-2xl">
            <h3 className="text-base font-bold text-ink flex items-center gap-2">
              <Cpu className="h-5 w-5 text-sky-400" />
              {t('Assign Operational Machines')}
            </h3>

            <p className="text-xs text-ink-dim">
              {t('Select the machines that technician')}{' '}
              <strong className="text-ink">{assignModalUser.name}</strong>{' '}
              {t('is authorized to monitor and service:')}
            </p>

            <div className="max-h-60 overflow-y-auto space-y-2 p-1 thin-scroll border border-line/40 rounded-xl bg-navy-900/50">
              {machines.map((m) => {
                const isSelected = selectedMachineIds.includes(m.id)
                return (
                  <label
                    key={m.id}
                    className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'border-sky-400/40 bg-sky-500/15 text-white'
                        : 'border-line/30 bg-navy-800/40 text-ink-dim hover:text-ink'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedMachineIds((prev) => [...prev, m.id])
                          } else {
                            setSelectedMachineIds((prev) =>
                              prev.filter((id) => id !== m.id)
                            )
                          }
                        }}
                        className="rounded border-line bg-navy-950 text-sky-500 focus:ring-0"
                      />
                      <span className="font-mono font-bold">{m.id}</span>
                      <span>·</span>
                      <span className="font-medium">{m.name}</span>
                    </div>
                    <span className="text-[10px] uppercase font-semibold text-ink-faint">
                      {m.type}
                    </span>
                  </label>
                )
              })}
            </div>

            <div className="mt-6 flex justify-end gap-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setAssignModalUser(null)}
                className="btn-ghost"
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveAssignments}
                className="btn-primary"
              >
                {t('Save Machine Assignments')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Granular Permissions & Visibility Manager Modal */}
      {permissionsModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
          <div className="panel w-full max-w-3xl max-h-[90vh] flex flex-col p-6 border border-sky-400/30 shadow-2xl animate-scaleUp">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-ink flex items-center gap-2">
                    <span>{t('Customize Employee Permissions & Visibility')}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-navy-800 text-sky-300 border border-sky-400/30 font-normal">
                      {permissionsModalUser.name}
                    </span>
                  </h3>
                  <p className="text-xs text-ink-dim">
                    {t(
                      'Toggle which modules appear in their navigation and configure operational capabilities.'
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPermissionsModalUser(null)}
                className="rounded-lg p-1.5 text-ink-faint hover:bg-navy-800 hover:text-ink transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Presets and Filters */}
            <div className="py-3 flex flex-wrap items-center justify-between gap-2 border-b border-line/40 shrink-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-semibold text-ink-dim uppercase tracking-wider mr-1">
                  {t('Presets')}:
                </span>
                <button
                  type="button"
                  onClick={handleResetToRolePermissions}
                  className="btn-ghost py-1 px-2.5 text-[11px] h-7 gap-1"
                  title={t('Reset to standard permissions for this role')}
                >
                  <RotateCcw className="h-3 w-3 text-amber-400" />
                  {t('Reset to Role Default')}
                </button>
                <button
                  type="button"
                  onClick={handleSelectAllPermissions}
                  className="btn-ghost py-1 px-2.5 text-[11px] h-7 gap-1"
                >
                  <Check className="h-3 w-3 text-emerald-400" />
                  {t('Select All')}
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAllPermissions}
                  className="btn-ghost py-1 px-2.5 text-[11px] h-7 gap-1"
                >
                  <X className="h-3 w-3 text-red-400" />
                  {t('Deselect All')}
                </button>
              </div>

              <div className="rounded-lg bg-navy-950/60 border border-line px-2.5 py-1 text-[11px] font-mono text-ink-dim">
                <span className="text-emerald-400 font-bold">
                  {selectedPermissions.length}
                </span>{' '}
                / 28 {t('Enabled')}
              </div>
            </div>

            {/* Permissions List by Category */}
            <div className="flex-1 overflow-y-auto thin-scroll py-4 space-y-6 pr-1">
              {PERMISSION_GROUPS.map((group) => {
                const groupTitle = language === 'ar' ? group.titleAr : group.title
                const groupDesc =
                  language === 'ar' ? group.descriptionAr : group.description

                return (
                  <div key={group.id} className="space-y-3">
                    <div className="bg-navy-950/40 p-2.5 rounded-xl border border-line/40">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-sky-400" />
                          {groupTitle}
                        </h4>
                        <span className="text-[10px] text-sky-300 font-mono">
                          {
                            group.permissions.filter((p) =>
                              selectedPermissions.includes(p.key)
                            ).length
                          }{' '}
                          / {group.permissions.length}
                        </span>
                      </div>
                      <p className="text-[11px] text-ink-dim mt-0.5">{groupDesc}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {group.permissions.map((p) => {
                        const isChecked = selectedPermissions.includes(p.key)
                        const permName = language === 'ar' ? p.nameAr : p.name
                        const permDesc = language === 'ar' ? p.descAr : p.desc

                        return (
                          <div
                            key={p.key}
                            onClick={() => togglePermission(p.key)}
                            className={`flex items-start justify-between gap-3 p-3 rounded-xl border cursor-pointer transition-all select-none ${
                              isChecked
                                ? 'border-sky-400/40 bg-sky-500/10 shadow-sm'
                                : 'border-line/40 bg-navy-900/30 opacity-70 hover:opacity-100 hover:border-line'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-xs text-ink">
                                  {permName}
                                </span>
                                {p.isNavModule && (
                                  <span className="rounded bg-sky-400/20 text-sky-300 border border-sky-400/30 px-1 py-0.2 text-[9px] font-bold">
                                    {t('Sidebar Tab')}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10.5px] text-ink-dim mt-0.5 leading-relaxed">
                                {permDesc}
                              </p>
                            </div>

                            {/* Custom Toggle Switch */}
                            <div
                              className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
                                isChecked
                                  ? 'bg-sky-500'
                                  : 'bg-navy-800 border border-line'
                              }`}
                            >
                              <span
                                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                                  isChecked ? 'left-4' : 'left-0.5'
                                }`}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Footer Buttons */}
            <div className="pt-4 border-t border-line flex items-center justify-between shrink-0">
              <p className="text-[11px] text-ink-faint">
                {t('Changes apply immediately to this user upon saving.')}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPermissionsModalUser(null)}
                  className="btn-ghost"
                  disabled={isSavingPermissions}
                >
                  {t('Cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleSavePermissions}
                  className="btn-primary"
                  disabled={isSavingPermissions}
                >
                  {isSavingPermissions ? t('Saving...') : t('Save Permissions Matrix')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comprehensive Employee Master Record Editor Modal */}
      {fullEditUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
          <div className="panel w-full max-w-2xl max-h-[90vh] flex flex-col p-6 border border-sky-400/30 shadow-2xl animate-scaleUp">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/20 text-sky-300 border border-sky-400/30">
                  <Edit2 className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-ink">
                    {t('Edit Complete Employee Record')}
                  </h3>
                  <p className="text-xs text-ink-dim">
                    {t(
                      'Modify names, contact info, job role, status, and machine authorizations.'
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFullEditUser(null)}
                className="rounded-lg p-1.5 text-ink-faint hover:bg-navy-800 hover:text-ink transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form
              onSubmit={handleSaveFullEdit}
              className="flex-1 overflow-y-auto thin-scroll py-4 space-y-4 pr-1"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">{t('Full Name (English)')} *</label>
                  <input
                    type="text"
                    required
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="input"
                    placeholder="e.g. Youssef Nabil"
                  />
                </div>

                <div>
                  <label className="label">{t('Full Name (Arabic)')}</label>
                  <input
                    type="text"
                    value={editFullNameAr}
                    onChange={(e) => setEditFullNameAr(e.target.value)}
                    className="input"
                    placeholder="مثال: يوسف نبيل"
                    dir="rtl"
                  />
                </div>
              </div>

              <div>
                <label className="label">{t('Corporate Email Address')} *</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-faint" />
                  <input
                    type="email"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="input pl-9 font-mono text-xs"
                    placeholder="employee@factory-ai.local"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">{t('Organizational Role')} *</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="input text-xs"
                  >
                    <option value="technician">
                      {t('Technician (Assigned scope only)')}
                    </option>
                    <option value="manager">
                      {t('Maintenance Manager (Fleet-wide scope)')}
                    </option>
                    <option value="admin">{t('Admin (Full system authority)')}</option>
                  </select>
                </div>

                <div>
                  <label className="label">{t('Account Status')} *</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as AccountStatus)}
                    className="input text-xs"
                  >
                    <option value="active">{t('Active (Granted system access)')}</option>
                    <option value="deactivated">
                      {t('Deactivated (Suspended access)')}
                    </option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">{t('Department / Line (English)')}</label>
                  <input
                    type="text"
                    value={editDepartment}
                    onChange={(e) => setEditDepartment(e.target.value)}
                    className="input text-xs"
                    placeholder="e.g. CNC & Robotic Milling Line"
                  />
                </div>

                <div>
                  <label className="label">{t('Department / Line (Arabic)')}</label>
                  <input
                    type="text"
                    value={editDepartmentAr}
                    onChange={(e) => setEditDepartmentAr(e.target.value)}
                    className="input text-xs"
                    placeholder="مثال: خط آلات التفريز والروبوتات"
                    dir="rtl"
                  />
                </div>
              </div>

              {/* Machine Assignments Section */}
              <div className="pt-2 border-t border-line/40 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="label mb-0">{t('Assigned Machinery Assets')}</label>
                  <span className="text-[10.5px] text-ink-faint">
                    {editAssignedMachineIds.length} {t('Selected')}
                  </span>
                </div>
                <p className="text-[11px] text-ink-dim">
                  {t(
                    'Select which machines this technician is authorized to inspect, service, and monitor:'
                  )}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto thin-scroll p-1 border border-line/40 rounded-xl bg-navy-950/40">
                  {machines.map((m) => {
                    const isSelected = editAssignedMachineIds.includes(m.id)
                    return (
                      <label
                        key={m.id}
                        className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                          isSelected
                            ? 'border-sky-400/40 bg-sky-500/15 text-white'
                            : 'border-line/30 bg-navy-900/40 text-ink-dim hover:text-ink'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditAssignedMachineIds((prev) => [...prev, m.id])
                              } else {
                                setEditAssignedMachineIds((prev) =>
                                  prev.filter((id) => id !== m.id)
                                )
                              }
                            }}
                            className="rounded border-line bg-navy-950 text-sky-500"
                          />
                          <span className="font-mono font-bold text-sky-300">{m.id}</span>
                          <span className="truncate max-w-[120px]">{m.name}</span>
                        </div>
                        <span className="text-[9.5px] uppercase font-semibold text-ink-faint">
                          {m.type}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="pt-4 border-t border-line flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const targetUser = fullEditUser
                    setFullEditUser(null)
                    openPermissionsModal(targetUser)
                  }}
                  className="btn-ghost text-xs text-emerald-400 gap-1.5"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>{t('Configure Permissions Matrix')}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFullEditUser(null)}
                    className="btn-ghost"
                    disabled={isSavingFullEdit}
                  >
                    {t('Cancel')}
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={isSavingFullEdit}
                  >
                    {isSavingFullEdit ? t('Saving...') : t('Save Employee Data')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
