import { NavLink } from 'react-router-dom'
import { Activity, Factory, X } from 'lucide-react'
import { NAV_ITEMS } from './routes'
import { useApp } from '../../context/AppContext'
import { cx } from '../../utils/helpers'
import { usePreferences } from '../../context/PreferencesContext'

interface SidebarProps {
  mobileOpen: boolean
  onClose: () => void
}

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const { alerts } = useApp()
  const { t } = usePreferences()
  const criticalActive = alerts.filter(
    (a) => a.severity === 'critical' && a.status === 'active'
  ).length

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
          <div
            className="relative flex h-9 w-9 items-center justify-center rounded-xl shadow-[0_6px_18px_-6px_rgba(37,99,235,0.8)]"
            style={{ backgroundImage: 'var(--grad-accent-strong)' }}
          >
            <Activity className="h-5 w-5 text-white" strokeWidth={2.4} />
            <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-navy-900" />
          </div>
          <div className="leading-tight">
            <p className="text-[13px] font-bold tracking-tight text-gradient">
              Industrial AI Platform
            </p>
            <p className="text-[10.5px] font-medium text-ink-faint">
              Machine Health &amp; Maintenance
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg p-1.5 text-ink-faint hover:bg-navy-700 hover:text-ink lg:hidden"
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
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) =>
                cx(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150',
                  isActive
                    ? 'text-sky-300'
                    : 'text-ink-dim hover:bg-navy-700/60 hover:text-ink'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <>
                      <span
                        className="absolute inset-0 rounded-xl border border-sky-400/20"
                        style={{
                          backgroundImage:
                            'linear-gradient(90deg, rgba(56, 189, 248, 0.16) 0%, rgba(99, 102, 241, 0.1) 50%, rgba(56, 189, 248, 0.06) 100%)',
                        }}
                        aria-hidden
                      />
                      <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-sky-300 to-blue-500" />
                    </>
                  )}
                  <item.icon
                    className={cx(
                      'h-[18px] w-[18px]',
                      isActive
                        ? 'text-sky-400'
                        : 'text-ink-faint group-hover:text-ink-dim'
                    )}
                    strokeWidth={1.9}
                  />
                  <span className="flex-1">{t(item.label)}</span>
                  {item.path === '/alerts' && criticalActive > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-red-500/20 px-1.5 text-[10px] font-bold text-red-300 ring-1 ring-red-500/30">
                      {criticalActive}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom promo */}
        <div className="p-3">
          <div
            className="relative overflow-hidden rounded-2xl border border-sky-400/15 p-4"
            style={{
              backgroundImage:
                'linear-gradient(160deg, rgba(56, 189, 248, 0.14) 0%, rgba(99, 102, 241, 0.1) 45%, rgba(0, 0, 0, 0) 100%), linear-gradient(180deg, rgb(var(--navy-700)) 0%, rgb(var(--navy-900)) 100%)',
            }}
          >
            <div className="absolute -right-4 -top-6 h-20 w-20 rounded-full bg-sky-500/10 blur-2xl" />
            <div className="absolute -bottom-8 -left-4 h-16 w-16 rounded-full bg-indigo-500/10 blur-2xl" />
            <div className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 ring-1 ring-sky-400/25">
              <Factory className="h-4 w-4 text-sky-300" />
            </div>
            <p className="text-[12.5px] font-semibold text-ink">Industrial AI Platform</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-dim">
              Smart Maintenance for Higher Productivity
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-widest text-sky-400/80">
              <span className="h-1 w-1 animate-pulseSoft rounded-full bg-emerald-400" />
              Predict · Prevent · Optimize
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
