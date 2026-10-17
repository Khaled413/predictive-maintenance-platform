import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  User,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Wrench,
  Users,
  Factory,
  Bot,
  CheckCircle2,
  XCircle,
  Mail,
  Building2,
  Calendar,
  Clock,
  ExternalLink,
  MessageSquare,
  Lock,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { usePreferences } from '../context/PreferencesContext'
import { PERMISSION_GROUPS } from '../types/auth'
import { getUserPermissions } from '../utils/rbac'
import Panel from '../components/ui/Panel'

export default function ProfilePage() {
  const { currentUser, isSimulatedUser, restoreOriginalUser } = useAuth()
  const { machines } = useApp()
  const { language, t } = usePreferences()

  const [activeCategory, setActiveCategory] = useState<'all' | 'nav' | 'ops'>('all')

  // Calculate current user's active permissions
  const activePermissions = useMemo(() => {
    return getUserPermissions(currentUser)
  }, [currentUser])

  // Get user's assigned machines
  const assignedMachines = useMemo(() => {
    if (!currentUser) return []
    if (currentUser.role === 'admin' || currentUser.role === 'manager') {
      return machines
    }
    return machines.filter((m) => currentUser.assignedMachineIds?.includes(m.id))
  }, [currentUser, machines])

  // Count saved private conversations for this user
  const savedChatsCount = useMemo(() => {
    if (!currentUser) return 0
    try {
      const stored = localStorage.getItem(`iap-assistant-conversations-${currentUser.id}`)
      if (!stored) return 0
      const parsed = JSON.parse(stored)
      return Array.isArray(parsed) ? parsed.length : 0
    } catch {
      return 0
    }
  }, [currentUser])

  if (!currentUser) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Panel className="p-8 text-center max-w-md">
          <User className="h-12 w-12 text-ink-faint mx-auto mb-3" />
          <h2 className="text-lg font-bold text-ink">{t('No active user profile')}</h2>
          <p className="text-xs text-ink-dim mt-1">
            {t('Please sign in with your enterprise credentials to view your profile.')}
          </p>
        </Panel>
      </div>
    )
  }

  const isArabic = language === 'ar'
  const displayName = isArabic && currentUser.nameAr ? currentUser.nameAr : currentUser.name
  const displayDept = isArabic && currentUser.departmentAr ? currentUser.departmentAr : currentUser.department

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Simulation / Preview Banner if admin is viewing as another user */}
      {isSimulatedUser && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 p-4 shadow-lg backdrop-blur-xl animate-pulse">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold text-amber-200">
                {t('Simulated Profile Verification Mode')}
              </p>
              <p className="text-[11px] text-amber-300/80">
                {t('Viewing platform as')} <strong>{displayName}</strong> ({currentUser.role}).{' '}
                {t('All features and navigation are currently constrained by what the admin configured for this user.')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={restoreOriginalUser}
            className="btn-primary shrink-0 text-xs py-1.5 px-3 bg-amber-500 hover:bg-amber-400 text-black font-bold"
          >
            {t('Exit Preview & Return to Admin')}
          </button>
        </div>
      )}

      {/* Main Profile Header Banner */}
      <div
        className="relative overflow-hidden rounded-3xl border border-sky-400/25 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl"
        style={{
          backgroundColor: 'rgb(var(--navy-900) / 0.88)',
          backgroundImage:
            'radial-gradient(circle at top right, rgba(56, 189, 248, 0.15), transparent 60%), radial-gradient(circle at bottom left, rgba(99, 102, 241, 0.12), transparent 70%)',
        }}
      >
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-6 justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            {/* Avatar */}
            <div className="relative">
              <div
                className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl text-2xl font-black text-white shadow-xl ring-2 ring-white/20 ${
                  currentUser.role === 'admin'
                    ? 'bg-gradient-to-br from-purple-500 via-indigo-600 to-sky-600'
                    : currentUser.role === 'manager'
                      ? 'bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-600'
                      : 'bg-gradient-to-br from-emerald-400 via-teal-500 to-sky-600'
                }`}
              >
                {isArabic ? currentUser.avatarInitialsAr : currentUser.avatarInitials}
              </div>
              <span
                className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-navy-950 text-white ${
                  currentUser.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'
                }`}
                title={currentUser.status === 'active' ? t('Active') : t('Deactivated')}
              >
                {currentUser.status === 'active' ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <XCircle className="h-3.5 w-3.5" />
                )}
              </span>
            </div>

            {/* Profile Info */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-ink">
                  {displayName}
                </h1>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    currentUser.role === 'admin'
                      ? 'border border-purple-500/40 bg-purple-500/15 text-purple-300'
                      : currentUser.role === 'manager'
                        ? 'border border-sky-500/40 bg-sky-500/15 text-sky-300'
                        : 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                  }`}
                >
                  {currentUser.role === 'admin' ? (
                    <Shield className="h-3.5 w-3.5" />
                  ) : currentUser.role === 'manager' ? (
                    <Users className="h-3.5 w-3.5" />
                  ) : (
                    <Wrench className="h-3.5 w-3.5" />
                  )}
                  {t(
                    currentUser.role === 'admin'
                      ? 'Admin'
                      : currentUser.role === 'manager'
                        ? 'Maintenance Manager'
                        : 'Technician'
                  )}
                </span>
                <span className="rounded-full border border-line bg-navy-800/80 px-2 py-0.5 text-[10px] font-semibold text-ink-dim">
                  {currentUser.status === 'active' ? (
                    <span className="text-emerald-400 font-bold">{t('Active Account')}</span>
                  ) : (
                    <span className="text-red-400 font-bold">{t('Deactivated Account')}</span>
                  )}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-ink-dim pt-0.5">
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-sky-400" />
                  <span className="font-mono">{currentUser.email}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-indigo-400" />
                  <span>{displayDept}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Quick Metrics Badges */}
          <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-line/40">
            <div className="rounded-xl border border-line/60 bg-navy-800/70 px-3 py-1.5 text-left sm:text-right">
              <span className="text-[10px] uppercase font-semibold text-ink-faint block">
                {t('Permissions Granted')}
              </span>
              <span className="text-base font-bold font-mono text-sky-300">
                {activePermissions.length} / 28
              </span>
            </div>
            <div className="rounded-xl border border-line/60 bg-navy-800/70 px-3 py-1.5 text-left sm:text-right">
              <span className="text-[10px] uppercase font-semibold text-ink-faint block">
                {t('Assigned Equipment')}
              </span>
              <span className="text-base font-bold font-mono text-emerald-300">
                {currentUser.role === 'admin' || currentUser.role === 'manager'
                  ? `${machines.length} (${t('All Fleet')})`
                  : `${currentUser.assignedMachineIds?.length || 0} ${t('Units')}`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid Layout: Left Column (Permissions & Visibility Matrix) & Right Column (Operational Scope & Private Chatbot) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Permissions Configured by Admin */}
        <div className="lg:col-span-2 space-y-6">
          <Panel className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4 mb-5">
              <div>
                <h2 className="text-base font-bold text-ink flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-sky-400" />
                  {t('Permissions & Access Matrix Configured by Admin')}
                </h2>
                <p className="text-xs text-ink-dim mt-0.5">
                  {t('The features, pages, and actions below reflect what the Plant Administrator has permitted for your account.')}
                </p>
              </div>

              {/* Category Filter */}
              <div className="flex rounded-xl border border-line bg-navy-800/60 p-1 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setActiveCategory('all')}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                    activeCategory === 'all'
                      ? 'bg-sky-500 text-white shadow-sm'
                      : 'text-ink-dim hover:text-ink'
                  }`}
                >
                  {t('All')}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCategory('nav')}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                    activeCategory === 'nav'
                      ? 'bg-sky-500 text-white shadow-sm'
                      : 'text-ink-dim hover:text-ink'
                  }`}
                >
                  {t('Modules')}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCategory('ops')}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                    activeCategory === 'ops'
                      ? 'bg-sky-500 text-white shadow-sm'
                      : 'text-ink-dim hover:text-ink'
                  }`}
                >
                  {t('Actions')}
                </button>
              </div>
            </div>

            {/* Note box */}
            <div className="rounded-xl border border-sky-400/25 bg-sky-500/10 p-3.5 mb-6 text-xs text-ink-dim leading-relaxed flex items-start gap-3">
              <Sparkles className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sky-200">
                  {t('Administrative Governance Notice')}
                </p>
                <p className="mt-0.5">
                  {t('If you require access to a restricted section (e.g. AI Assistant, Work Orders, or Fleet Management), contact your authorized Plant Administrator to update your employee permissions.')}
                </p>
              </div>
            </div>

            {/* Permission Groups */}
            <div className="space-y-6">
              {PERMISSION_GROUPS.filter((group) => {
                if (activeCategory === 'nav') return group.id === 'nav_modules'
                if (activeCategory === 'ops') return group.id !== 'nav_modules'
                return true
              }).map((group) => {
                const groupTitle = isArabic ? group.titleAr : group.title
                const groupDesc = isArabic ? group.descriptionAr : group.description

                return (
                  <div key={group.id} className="space-y-3">
                    <div className="border-b border-line/40 pb-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                        {groupTitle}
                      </h3>
                      <p className="text-[11px] text-ink-faint mt-0.5">{groupDesc}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {group.permissions.map((p) => {
                        const isGranted = activePermissions.includes(p.key)
                        const permName = isArabic ? p.nameAr : p.name
                        const permDesc = isArabic ? p.descAr : p.desc

                        return (
                          <div
                            key={p.key}
                            className={`flex items-start justify-between gap-3 p-3 rounded-xl border transition-all ${
                              isGranted
                                ? 'border-sky-400/30 bg-navy-800/60 shadow-sm'
                                : 'border-line/30 bg-navy-950/40 opacity-60'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-xs text-ink truncate">
                                  {permName}
                                </span>
                                {p.isNavModule && (
                                  <span className="rounded bg-sky-500/20 text-sky-300 border border-sky-400/30 px-1 py-0.2 text-[9px] font-bold">
                                    {t('Tab')}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10.5px] text-ink-dim mt-0.5 leading-relaxed line-clamp-2">
                                {permDesc}
                              </p>
                            </div>

                            <span
                              className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                isGranted
                                  ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                                  : 'border border-line bg-navy-900 text-ink-faint'
                              }`}
                            >
                              {isGranted ? (
                                <>
                                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                  <span>{t('Allowed')}</span>
                                </>
                              ) : (
                                <>
                                  <Lock className="h-3 w-3" />
                                  <span>{t('Restricted')}</span>
                                </>
                              )}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>
        </div>

        {/* Right Column: Private Chatbot & Assigned Equipment */}
        <div className="space-y-6">
          {/* Isolated Chatbot Status Card */}
          <Panel className="p-5 relative overflow-hidden">
            <div className="flex items-center gap-2.5 mb-3 border-b border-line pb-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-sky-500/20 text-sky-400 border border-sky-400/30">
                <Bot className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-ink">
                  {t('Private AI Chatbot Session')}
                </h3>
                <p className="text-[10.5px] text-ink-faint">
                  {t('Strict per-user conversation isolation')}
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="rounded-xl border border-line/50 bg-navy-800/40 p-3 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-ink-dim">{t('Storage Isolation')}</span>
                  <span className="font-semibold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {t('Active (User Keyed)')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-ink-dim">{t('Saved Conversations')}</span>
                  <span className="font-bold font-mono text-sky-300">{savedChatsCount}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-ink-dim">{t('User Privacy')}</span>
                  <span className="text-ink-dim italic text-[10px]">
                    {t('Hidden from all other accounts')}
                  </span>
                </div>
              </div>

              {activePermissions.includes('assistant.use') ? (
                <Link
                  to="/assistant"
                  className="btn-primary w-full justify-center text-xs py-2 gap-1.5"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>{t('Open Private AI Assistant')}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-center text-xs text-red-300">
                  <Lock className="h-4 w-4 mx-auto mb-1 text-red-400" />
                  <p className="font-semibold">{t('Chatbot Access Restricted')}</p>
                  <p className="text-[10px] text-red-300/80 mt-0.5">
                    {t('The administrator has disabled AI Assistant for this profile.')}
                  </p>
                </div>
              )}
            </div>
          </Panel>

          {/* Operational Machine Assignments */}
          <Panel className="p-5">
            <div className="flex items-center justify-between border-b border-line pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Factory className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-ink">
                  {t('Assigned Equipment Scope')}
                </h3>
              </div>
              <span className="rounded-md border border-line bg-navy-800 px-2 py-0.5 text-[10px] font-mono text-ink-dim">
                {assignedMachines.length} {t('Machines')}
              </span>
            </div>

            <p className="text-xs text-ink-dim mb-3">
              {currentUser.role === 'admin' || currentUser.role === 'manager'
                ? t('You hold organizational fleet scope and have full visibility across all machinery.')
                : t('You are authorized by administration to service and inspect the following machinery units:')}
            </p>

            <div className="space-y-2 max-h-72 overflow-y-auto thin-scroll pr-1">
              {assignedMachines.length === 0 ? (
                <div className="rounded-xl border border-line/40 bg-navy-950/40 p-4 text-center text-xs text-ink-faint">
                  <Wrench className="h-4 w-4 mx-auto mb-1 opacity-40" />
                  {t('No equipment currently assigned by administrator.')}
                </div>
              ) : (
                assignedMachines.map((m) => (
                  <Link
                    key={m.id}
                    to={`/machines/${m.id}`}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-line/50 bg-navy-800/40 hover:border-sky-400/40 hover:bg-navy-800/80 transition-all text-xs group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono font-bold text-sky-300 shrink-0">
                        {m.id}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-ink truncate group-hover:text-sky-300 transition-colors">
                          {m.name}
                        </p>
                        <p className="text-[10px] text-ink-faint capitalize">{m.type}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          m.status === 'Operational'
                            ? 'bg-emerald-400'
                            : m.status === 'Warning'
                              ? 'bg-amber-400'
                              : 'bg-red-400'
                        }`}
                      />
                      <ExternalLink className="h-3 w-3 text-ink-faint group-hover:text-sky-400 transition-colors" />
                    </div>
                  </Link>
                ))
              )}
            </div>
          </Panel>

          {/* Account Metadata Card */}
          <Panel className="p-5 text-xs text-ink-dim space-y-2.5">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-ink-faint border-b border-line/40 pb-2">
              {t('Account & Security Metadata')}
            </h4>
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5">
                <User className="h-3 w-3 text-ink-faint" />
                {t('Employee ID')}
              </span>
              <span className="font-mono font-bold text-ink">{currentUser.id}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3 text-ink-faint" />
                {t('Member Since')}
              </span>
              <span className="font-mono">
                {new Date(currentUser.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-ink-faint" />
                {t('Last Session')}
              </span>
              <span className="font-mono">
                {new Date(currentUser.lastLoginAt).toLocaleTimeString()}
              </span>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
