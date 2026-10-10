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
        : 'bg-red-400 animate-pulseSoft'
  const activeAlerts = alerts.filter((a) => a.status === 'active').length

  return (
    <header
      className="sticky top-0 z-30 flex h-16 min-w-0 items-center gap-2 border-b border-line px-3 backdrop-blur-xl sm:gap-4 sm:px-6"
      style={{
        backgroundColor: 'rgb(var(--navy-900) / 0.72)',
        backgroundImage:
          'linear-gradient(180deg, rgba(56, 189, 248, 0.05) 0%, rgba(0, 0, 0, 0) 100%)',
      }}
    >
      <button
        type="button"
        onClick={onMenu}
        className="rounded-lg p-2 text-ink-dim hover:bg-navy-700 hover:text-ink lg:hidden"
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
        <span className="hidden rounded-lg border border-amber-400/25 bg-amber-400/5 px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-amber-300 sm:inline">
          DEMO MODE · simulated inputs / model outputs
        </span>
        <span className="top-header-demo rounded-md border border-amber-400/25 bg-amber-400/5 px-1.5 py-1 text-[8px] font-bold text-amber-300 sm:hidden">
          DEMO
        </span>
        <div className="hidden items-center gap-1.5 rounded-lg border border-line bg-navy-800/60 px-2.5 py-1.5 text-[11px] font-medium text-ink-dim xl:flex">
          <Zap className="h-3.5 w-3.5 text-sky-400" />
          Predict · Prevent · Optimize
        </div>

        <div className="hidden items-center gap-2 rounded-lg border border-line bg-navy-800/60 px-3 py-1.5 md:flex">
          <Clock className="h-3.5 w-3.5 text-ink-faint" />
          <div className="leading-none">
            <p className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-faint">
              {t('Last Updated')}
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-ink">
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
            className="rounded-md p-1 text-ink-faint transition-colors hover:bg-navy-700 hover:text-sky-300"
            aria-label="Refresh data"
            title="Refresh data"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        <div
          className={cx(
            'top-header-status flex min-w-0 max-w-[132px] items-center gap-1.5 rounded-lg border px-2 py-1.5 sm:max-w-none sm:gap-2 sm:px-3',
            status === null
              ? 'border-amber-400/25 bg-amber-400/5'
              : status === 'Operational'
                ? 'border-emerald-400/25 bg-emerald-400/5'
                : status === 'Warning'
                  ? 'border-amber-400/25 bg-amber-400/5'
                  : 'border-red-400/30 bg-red-400/10'
          )}
        >
          <span
            className={cx(
              'h-2 w-2 rounded-full',
              status === null ? 'bg-amber-400 animate-pulseSoft' : statusDot
            )}
          />
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
                    ? 'text-emerald-300'
                    : status === 'Warning'
                      ? 'text-amber-300'
                      : 'text-red-300'
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
          className="relative rounded-lg border border-line bg-navy-800/60 p-2 text-ink-dim transition-colors hover:border-sky-400/30 hover:text-ink"
          aria-label="Open alerts"
          title="Alerts center"
        >
          <Bell className="h-4 w-4" />
          {activeAlerts > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white ring-2 ring-navy-900">
              {activeAlerts}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="top-header-profile flex items-center gap-2 rounded-lg border border-line bg-navy-800/60 py-1 pl-1 pr-2 transition-colors hover:border-sky-400/30"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-sky-500/80 to-blue-700 text-[11px] font-bold text-white">
            {language === 'ar' ? 'مخ' : 'EK'}
          </div>
          <div className="hidden text-left leading-none sm:block">
            <p className="text-[11.5px] font-semibold text-ink">{t('Eng. Khaled')}</p>
            <p className="mt-0.5 text-[10px] text-ink-faint">
              {t('Maintenance Manager')}
            </p>
          </div>
          <ChevronDown className="hidden h-3.5 w-3.5 text-ink-faint sm:block" />
        </button>
      </div>
    </header>
  )
}
