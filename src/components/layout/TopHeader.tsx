import { useLocation, useNavigate } from 'react-router-dom'
import { Bell, ChevronDown, Clock, Menu, RefreshCw, Zap } from 'lucide-react'
import { PAGE_META } from './routes'
import { useApp } from '../../context/AppContext'
import { formatDateTime, cx } from '../../utils/helpers'
import type { MachineStatus } from '../../types'
import { usePreferences } from '../../context/PreferencesContext'

interface TopHeaderProps {
  onMenu: () => void
}

export default function TopHeader({ onMenu }: TopHeaderProps) {
  const { lastUpdated, refreshTimestamp, notify, machines, alerts } = useApp()
  const { language, t } = usePreferences()
  const location = useLocation()
  const navigate = useNavigate()

  let meta = PAGE_META[location.pathname]
  if (!meta && location.pathname.startsWith('/machines/')) {
    const id = decodeURIComponent(location.pathname.split('/')[2] ?? '')
    const m = machines.find((x) => x.id === id)
    meta = {
      title: m ? `${m.id} · ${t('Machine Profile')}` : t('Machine Profile'),
      subtitle: m
        ? `${m.name} — ${m.type}`
        : t('Detailed machine telemetry and analysis'),
    }
  }
  if (!meta) meta = { title: 'Overview', subtitle: '' }
  if (!location.pathname.startsWith('/machines/')) {
    meta = { title: t(meta.title), subtitle: t(meta.subtitle) }
  }

  const critical = machines.filter((m) => m.status === 'Critical').length
  const warning = machines.filter((m) => m.status === 'Warning').length
  const predicted = machines.filter((machine) => machine.status !== null).length
  const status: MachineStatus | null =
    predicted !== machines.length || predicted === 0
      ? null
      : critical > 0
        ? 'Critical'
        : warning > 0
          ? 'Warning'
          : 'Operational'
  const statusDot =
    status === 'Operational'
      ? 'bg-emerald-400'
      : status === 'Warning'
        ? 'bg-amber-400'
        : 'bg-red-400'
  const activeAlerts = alerts.filter((a) => a.status === 'active').length

  return (
    <header
      className="sticky top-0 z-30 flex h-16 min-w-0 items-center gap-2 border-b border-line px-3 backdrop-blur-xl sm:gap-4 sm:px-6 relative"
      style={{
        backgroundColor: 'rgb(var(--navy-900) / 0.78)',
        backgroundImage:
          'linear-gradient(180deg, rgba(56, 189, 248, 0.08) 0%, rgba(99, 102, 241, 0.03) 50%, rgba(0, 0, 0, 0) 100%)',
      }}
    >
      {/* Bottom glowing accent line */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[1.5px] bg-gradient-to-r from-transparent via-sky-400/40 via-indigo-500/30 to-transparent"
      />

      <button
        type="button"
        onClick={onMenu}
        className="rounded-lg p-2 text-ink-dim transition-colors hover:bg-navy-700 hover:text-ink lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15.5px] font-bold tracking-tight text-ink">
          {meta.title}
        </h1>
        <p className="truncate text-[11.5px] text-ink-faint">{meta.subtitle}</p>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <span
          className="hidden rounded-lg px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-amber-300 sm:inline transition-all"
          style={{
            backgroundImage:
              'linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(249, 115, 22, 0.1) 100%)',
            border: '1px solid rgba(251, 191, 36, 0.35)',
            boxShadow: '0 0 12px -3px rgba(251, 191, 36, 0.25)',
          }}
        >
          DEMO MODE · simulated inputs / model outputs
        </span>
        <span
          className="top-header-demo rounded-md px-1.5 py-1 text-[8px] font-bold text-amber-300 sm:hidden"
          style={{
            backgroundImage:
              'linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(249, 115, 22, 0.1) 100%)',
            border: '1px solid rgba(251, 191, 36, 0.35)',
          }}
        >
          DEMO
        </span>
        <div className="hidden items-center gap-1.5 rounded-lg border border-line bg-navy-800/60 px-2.5 py-1.5 text-[11px] font-medium text-ink-dim xl:flex">
          <Zap className="h-3.5 w-3.5 text-sky-400" />
          <span className="text-gradient font-semibold">Predict · Prevent · Optimize</span>
        </div>

        <div className="hidden items-center gap-2 rounded-lg border border-line bg-navy-800/60 px-3 py-1.5 md:flex">
          <Clock className="h-3.5 w-3.5 text-ink-faint" />
          <div className="leading-none">
            <p className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-faint">
              {t('Last Updated')}
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-ink font-mono">
              {formatDateTime(lastUpdated)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              refreshTimestamp()
              notify(
                'info',
                'Local data refreshed',
                'The dashboard timestamp was updated; no live telemetry connection is configured.'
              )
            }}
            className="rounded-md p-1 text-ink-faint transition-all hover:bg-navy-700 hover:text-sky-300 active:scale-95"
            aria-label="Refresh data"
            title="Refresh data"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        <div
          className={cx(
            'top-header-status flex min-w-0 max-w-[132px] items-center gap-1.5 rounded-lg border px-2 py-1.5 sm:max-w-none sm:gap-2 sm:px-3 shadow-sm transition-all',
            status === null
              ? 'border-amber-400/25 bg-amber-400/5'
              : status === 'Operational'
                ? 'border-emerald-400/30 bg-emerald-400/10'
                : status === 'Warning'
                  ? 'border-amber-400/30 bg-amber-400/10'
                  : 'border-red-400/35 bg-red-400/15'
          )}
        >
          <div className="relative flex h-2.5 w-2.5 items-center justify-center shrink-0">
            <span
              className={cx(
                'inline-flex h-2 w-2 rounded-full',
                status === null ? 'bg-amber-400' : statusDot
              )}
            />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="hidden truncate text-[9.5px] font-semibold uppercase tracking-wider text-ink-faint sm:block">
              {status ? t('Prediction Status') : 'Model Predictions'}
            </p>
            <p
              className={cx(
                'truncate text-[10px] font-semibold sm:mt-0.5 sm:text-[11.5px]',
                status === null
                  ? 'text-amber-300'
                  : status === 'Operational'
                    ? 'text-emerald-300 font-bold'
                    : status === 'Warning'
                      ? 'text-amber-300 font-bold'
                      : 'text-red-300 font-bold'
              )}
            >
              {status ??
                (machines.some((machine) => machine.predictionStatus === 'loading')
                  ? 'Loading predictions'
                  : 'ML prediction service unavailable')}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/alerts')}
          className="relative rounded-lg border border-line bg-navy-800/60 p-2 text-ink-dim transition-all hover:border-sky-400/40 hover:text-ink hover:scale-105 active:scale-95"
          aria-label="Open alerts"
          title="Alerts center"
        >
          <Bell className="h-4 w-4" />
          {activeAlerts > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-r from-red-500 to-rose-600 px-1 text-[9px] font-bold text-white ring-2 ring-navy-900 shadow-sm">
              {activeAlerts}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="top-header-profile group flex items-center gap-2 rounded-lg border border-line bg-navy-800/60 py-1 pl-1 pr-2.5 transition-all hover:border-sky-400/40 hover:bg-navy-800 active:scale-95"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-600 text-[11px] font-bold text-white shadow-sm ring-1 ring-white/20 transition-transform group-hover:scale-105">
            {language === 'ar' ? 'مخ' : 'EK'}
          </div>
          <div className="hidden text-left leading-none sm:block">
            <p className="text-[11.5px] font-semibold text-ink group-hover:text-sky-300 transition-colors">
              {t('Eng. Khaled')}
            </p>
            <p className="mt-0.5 text-[10px] text-ink-faint">
              {t('Maintenance Manager')}
            </p>
          </div>
          <ChevronDown className="hidden h-3.5 w-3.5 text-ink-faint sm:block transition-transform group-hover:translate-y-0.5" />
        </button>
      </div>
    </header>
  )
}
