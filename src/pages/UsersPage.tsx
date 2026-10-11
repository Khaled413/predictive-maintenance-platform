import { useState, useMemo } from 'react'
import {
  Users,
  UserPlus,
  Shield,
  Wrench,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  History,
  Lock,
  Edit2,
  Cpu,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { usePreferences } from '../context/PreferencesContext'
import type { AccountStatus, UserRole } from '../types/auth'

export default function UsersPage() {
  const {
    currentUser,
    users,
    auditLog,
    createUser,
    updateUserRole,
    setUserStatus,
    assignMachinesToTechnician,
  } = useAuth()
  const { machines } = useApp()
  const { t, language } = usePreferences()

  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | AccountStatus>('ALL')

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [roleModalUser, setRoleModalUser] = useState<{ id: string; name: string; currentRole: UserRole } | null>(null)
  const [newSelectedRole, setNewSelectedRole] = useState<UserRole>('technician')
  const [assignModalUser, setAssignModalUser] = useState<{ id: string; name: string; assigned: string[] } | null>(null)
  const [selectedMachineIds, setSelectedMachineIds] = useState<string[]>([])
  const [actionError, setActionError] = useState<string | null>(null)

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

  const handleCreateUser = (e: React.FormEvent) => {
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

    const result = createUser({
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
      setActionError(result.error ?? 'Failed to create user')
    }
  }

  const handleRoleChangeConfirm = () => {
    if (!roleModalUser) return
    setActionError(null)

    const result = updateUserRole(roleModalUser.id, newSelectedRole)
    if (result.success) {
      setRoleModalUser(null)
    } else {
      setActionError(result.error ?? 'Failed to change role')
    }
  }

  const handleSaveAssignments = () => {
    if (!assignModalUser) return
    setActionError(null)

    const result = assignMachinesToTechnician(assignModalUser.id, selectedMachineIds)
    if (result.success) {
      setAssignModalUser(null)
    } else {
      setActionError(result.error ?? 'Failed to assign machines')
    }
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
                  {t('Manage user roles, operational machine assignments, and review security audit logs.')}
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
                                {language === 'ar' ? user.avatarInitialsAr : user.avatarInitials}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-ink truncate">
                                  {language === 'ar' && user.nameAr ? user.nameAr : user.name}
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
                            {language === 'ar' && user.departmentAr ? user.departmentAr : user.department}
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
                              <div className="flex items-center justify-end gap-1.5">
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
                                    <Cpu className="h-3.5 w-3.5 text-sky-400" />
                                    <span className="hidden sm:inline">{t('Assign')}</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => {
                                    setRoleModalUser({
                                      id: user.id,
                                      name: user.name,
                                      currentRole: user.role,
                                    })
                                    setNewSelectedRole(user.role)
                                  }}
                                  className="btn-ghost px-2 py-1 h-7 text-[11px]"
                                  title={t('Change Role')}
                                >
                                  <Edit2 className="h-3 w-3 text-amber-400" />
                                  <span className="hidden sm:inline">{t('Role')}</span>
                                </button>

                                {!isSelf && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = user.status === 'active' ? 'deactivated' : 'active'
                                      setUserStatus(user.id, next)
                                    }}
                                    className={`btn-ghost px-2 py-1 h-7 text-[11px] ${
                                      user.status === 'active'
                                        ? 'text-red-400 hover:border-red-400/40 hover:text-red-300'
                                        : 'text-emerald-400 hover:border-emerald-400/40 hover:text-emerald-300'
                                    }`}
                                  >
                                    {user.status === 'active' ? t('Deactivate') : t('Activate')}
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
                {t('Chronological immutable record of security and authorization events.')}
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
                  <option value="technician">{t('Technician (Assigned scope only)')}</option>
                  <option value="manager">{t('Maintenance Manager (Fleet-wide operations)')}</option>
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
                            )}
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
    </div>
  )
}
