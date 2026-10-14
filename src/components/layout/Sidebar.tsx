import { NavLink } from 'react-router-dom'
import { Activity, Factory, Shield, Users, Wrench, X } from 'lucide-react'
import { NAV_ITEMS } from './routes'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { cx } from '../../utils/helpers'
import { usePreferences } from '../../context/PreferencesContext'

interface SidebarProps {
  mobileOpen: boolean
  onClose: () => void
}

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const { alerts } = useApp()
  const { currentUser, checkPermission } = useAuth()
  const { t } = usePreferences()
  const criticalActive = alerts.filter(
    (a) => a.severity === 'critical' && a.status === 'active'
  ).length

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (!item.requiredPermission) return true
    return checkPermission(item.requiredPermission)
  })

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-line backdrop-blur-xl transition-transform duration-300',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
        style={{
          backgroundColor: 'rgb(var(--navy-900) / 0.92)',
          backgroundImage:
            'linear-gradient(180deg, rgba(56, 189, 248, 0.06) 0%, rgba(99, 102, 241, 0.04) 32%, rgba(0, 0, 0, 0) 100%)',
        }}
      >
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-5">
          <div className="relative">
            <div
              className="relative flex h-9 w-9 items-center justify-center rounded-xl shadow-md ring-1 ring-white/20"
              style={{ backgroundImage: 'var(--grad-accent-strong)' }}
            >
              <Activity className="h-5 w-5 text-white" strokeWidth={2.4} />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-navy-900" />
            </div>
          </div>
          <div className="leading-tight">
            <p className="text-[13px] font-bold tracking-tight text-gradient">
              Industrial AI Platform
            </p>
            <p className="text-[10px] font-medium text-ink-faint">
              Machine Health &amp; Maintenance
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-navy-700 hover:text-ink lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="thin-scroll flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            {t('Main')}
          </p>
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) =>
                cx(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200',
                  isActive
                    ? 'text-sky-300 font-semibold'
                    : 'text-ink-dim hover:bg-navy-700/60 hover:text-ink hover:translate-x-1'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <>
                      <span
                        className="absolute inset-0 rounded-xl border border-sky-400/30"
                        style={{
                          backgroundImage:
                            'linear-gradient(90deg, rgba(56, 189, 248, 0.22) 0%, rgba(99, 102, 241, 0.14) 50%, rgba(56, 189, 248, 0.08) 100%)',
                        }}
                        aria-hidden
                      />
                      <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-cyan-300 via-sky-400 to-indigo-500" />
                    </>
                  )}
                  <item.icon
                    className={cx(
                      'h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-110',
                      isActive
                        ? 'text-sky-400'
                        : 'text-ink-faint group-hover:text-ink-dim'
                    )}
                    strokeWidth={1.9}
                  />
                  <span className="flex-1">{t(item.label)}</span>
                  {item.path === '/alerts' && criticalActive > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-gradient-to-r from-red-500 to-rose-600 px-1.5 text-[10px] font-bold text-white shadow-sm">
                      {criticalActive}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Active Role Card */}
        <div className="px-3 pt-1">
          <div className="flex items-center gap-2.5 rounded-xl border border-line/60 bg-navy-800/60 p-2.5">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                currentUser?.role === 'admin'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : currentUser?.role === 'manager'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              {currentUser?.role === 'admin' ? (
                <Shield className="h-3.5 w-3.5" />
              ) : currentUser?.role === 'manager' ? (
                <Users className="h-3.5 w-3.5" />
              ) : (
                <Wrench className="h-3.5 w-3.5" />
              )}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[11px] font-bold text-ink">
                {currentUser?.name}
              </p>
              <p className="truncate text-[9.5px] font-semibold text-sky-300 uppercase tracking-wider">
                {t(
                  currentUser?.role === 'admin'
                    ? 'Admin'
                    : currentUser?.role === 'manager'
                      ? 'Maintenance Manager'
                      : 'Technician'
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Bottom promo */}
        <div className="p-3">
          <div
            className="relative overflow-hidden rounded-2xl border border-sky-400/25 p-4 shadow-lg transition-transform hover:scale-[1.02]"
            style={{
              backgroundImage:
                'linear-gradient(160deg, rgba(56, 189, 248, 0.18) 0%, rgba(99, 102, 241, 0.14) 45%, rgba(168, 85, 247, 0.08) 100%), linear-gradient(180deg, rgb(var(--navy-700)) 0%, rgb(var(--navy-900)) 100%)',
            }}
          >
            <div className="absolute -right-4 -top-6 h-20 w-20 rounded-full bg-sky-500/20 blur-2xl" />
            <div className="absolute -bottom-8 -left-4 h-16 w-16 rounded-full bg-indigo-500/20 blur-2xl" />
            <div className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/20 ring-1 ring-sky-400/35 shadow-sm">
              <Factory className="h-4 w-4 text-sky-300" />
            </div>
            <p className="text-[12.5px] font-bold text-ink text-gradient">
              Industrial AI Platform
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-dim">
              Smart Maintenance for Higher Productivity
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-widest text-sky-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Predict · Prevent · Optimize
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
