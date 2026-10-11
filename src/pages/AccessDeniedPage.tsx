import { ShieldAlert, ArrowLeft, UserCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { usePreferences } from '../context/PreferencesContext'

interface AccessDeniedPageProps {
  requiredPermission?: string
  resourceName?: string
}

export default function AccessDeniedPage({
  requiredPermission,
  resourceName,
}: AccessDeniedPageProps) {
  const navigate = useNavigate()
  const { currentUser, switchUser, users } = useAuth()
  const { t, language } = usePreferences()

  // Find an admin or manager to recommend for testing
  const authorizedUser = users.find(
    (u) => (u.role === 'admin' || u.role === 'manager') && u.status === 'active'
  )

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-12 text-center animate-fadeInScale">
      <div className="relative mb-6">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-500/20 via-rose-500/10 to-red-600/20 shadow-lg shadow-red-950/40"
          style={{ backdropFilter: 'blur(12px)' }}
        >
          <ShieldAlert className="h-10 w-10 text-red-400" />
        </div>
        <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-navy-900 border border-red-400 text-[11px] font-bold text-red-300">
          403
        </span>
      </div>

      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
        {t('Access Denied')}
      </h1>

      <p className="mt-2.5 max-w-md text-sm text-ink-dim leading-relaxed">
        {t(
          'You do not have the required authorization to view this resource. Your current organizational role has restricted access.'
        )}
      </p>

      {/* Role and permission details pill */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2 max-w-lg rounded-xl border border-line/60 bg-navy-800/60 p-3 text-xs text-ink-dim shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-ink-faint">{t('Current Role')}:</span>
          <span className="font-semibold text-sky-300 capitalize">
            {currentUser?.role ?? 'Guest'}
          </span>
        </div>
        {requiredPermission && (
          <>
            <span className="text-ink-faint">·</span>
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="text-ink-faint">{t('Required Permission')}:</span>
              <span className="rounded bg-navy-950 px-1.5 py-0.5 text-amber-300 border border-amber-400/20">
                {requiredPermission}
              </span>
            </div>
          </>
        )}
        {resourceName && (
          <>
            <span className="text-ink-faint">·</span>
            <div className="flex items-center gap-1.5">
              <span className="text-ink-faint">{t('Target')}:</span>
              <span className="font-medium text-ink">{resourceName}</span>
            </div>
          </>
        )}
      </div>

      {currentUser?.status === 'deactivated' && (
        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200 max-w-md">
          {t('This account has been deactivated. Please contact an administrator to reactivate your access.')}
        </div>
      )}

      {/* Quick Action buttons */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="btn-ghost flex items-center gap-2"
        >
          <ArrowLeft className={`h-4 w-4 ${language === 'ar' ? 'rotate-180' : ''}`} />
          {t('Return to Dashboard')}
        </button>

        {authorizedUser && currentUser?.role === 'technician' && (
          <button
            type="button"
            onClick={() => switchUser(authorizedUser.id)}
            className="btn-primary flex items-center gap-2"
          >
            <UserCheck className="h-4 w-4" />
            {t('Switch to Manager for Testing')}
          </button>
        )}
      </div>
    </div>
  )
}
