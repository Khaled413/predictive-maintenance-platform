import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  ChevronDown,
  Clock,
  Languages,
  LogOut,
  Menu,
  QrCode,
  RefreshCw,
  ShieldAlert,
  User,
  Users,
  Volume2,
  VolumeX,
  Wrench,
  Zap,
} from 'lucide-react'
import { PAGE_META } from './routes'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { formatDateTime, cx } from '../../utils/helpers'
import type { MachineStatus } from '../../types'
import { usePreferences } from '../../context/PreferencesContext'
import QrScannerModal from '../ui/QrScannerModal'

interface TopHeaderProps {
  onMenu: () => void
}

export default function TopHeader({ onMenu }: TopHeaderProps) {
  const {
    lastUpdated,
    refreshTimestamp,
    notify,
    machines,
    alerts,
    isRealtimeConnected,
    audioMuted,
    setAudioMuted,
  } = useApp()
  const { currentUser, signOutUser, isSimulatedUser, restoreOriginalUser } = useAuth()
  const { language, toggleLanguage, t } = usePreferences()
  const location = useLocation()
  const navigate = useNavigate()
  const [profileOpen, setProfileOpen] = useState(false)
  const [qrScannerOpen, setQrScannerOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
          {t('DEMO MODE · simulated inputs / model outputs')}
        </span>
        <span
          className="top-header-demo rounded-md px-1.5 py-1 text-[8px] font-bold text-amber-300 sm:hidden"
          style={{
            backgroundImage:
              'linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(249, 115, 22, 0.1) 100%)',
            border: '1px solid rgba(251, 191, 36, 0.35)',
          }}
        >
          {t('DEMO')}
        </span>
        <div className="hidden items-center gap-1.5 rounded-lg border border-line bg-navy-800/60 px-2.5 py-1.5 text-[11px] font-medium text-ink-dim xl:flex">
          <Zap className="h-3.5 w-3.5 text-sky-400" />
          <span className="text-gradient font-semibold">
            {t('Predict · Prevent · Optimize')}
          </span>
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

        {/* Realtime Live Pulse */}
        <div
          className={cx(
            'hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium lg:flex transition-all shadow-sm',
            isRealtimeConnected
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
          )}
          title={
            isRealtimeConnected
              ? 'Supabase WebSocket Realtime Telemetry Connected'
              : 'Supabase Realtime Reconnecting...'
          }
        >
          <span className="relative flex h-2 w-2">
            {isRealtimeConnected && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            )}
            <span
              className={cx(
                'relative inline-flex h-2 w-2 rounded-full',
                isRealtimeConnected ? 'bg-emerald-400' : 'bg-amber-400'
              )}
            />
          </span>
          <span className="font-semibold text-[10.5px]">
            {isRealtimeConnected
              ? language === 'ar'
                ? 'البث الحي متصل'
                : 'Realtime Live'
              : language === 'ar'
                ? 'جارٍ الاتصال'
                : 'Reconnecting'}
          </span>
        </div>

        {/* Audio Alarms Mute Toggle */}
        <button
          type="button"
          onClick={() => {
            const next = !audioMuted
            setAudioMuted(next)
            notify(
              'info',
              next ? 'Audio Sirens Muted' : 'Audio Sirens Unmuted',
              next
                ? 'Sound alarms are now muted.'
                : 'Critical and warning sirens are now active.'
            )
          }}
          className="rounded-lg border border-line bg-navy-800/60 p-2 text-ink-dim transition-all hover:border-sky-400/40 hover:text-ink hover:scale-105 active:scale-95"
          title={
            audioMuted ? t('Unmute factory audio alarms') : t('Mute factory audio alarms')
          }
          aria-label="Toggle audio alerts"
        >
          {audioMuted ? (
            <VolumeX className="h-4 w-4 text-amber-400" />
          ) : (
            <Volume2 className="h-4 w-4 text-sky-400" />
          )}
        </button>

        {/* QR Scanner Trigger */}
        <button
          type="button"
          onClick={() => setQrScannerOpen(true)}
          className="rounded-lg border border-line bg-navy-800/60 p-2 text-ink-dim transition-all hover:border-sky-400/40 hover:text-ink hover:scale-105 active:scale-95"
          title={t('Scan machine QR code')}
          aria-label="Scan machine QR code"
        >
          <QrCode className="h-4 w-4 text-cyan-400" />
        </button>

        {/* Quick Language Toggle */}
        <button
          type="button"
          onClick={toggleLanguage}
          className="flex items-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-500/10 px-2.5 py-1.5 text-xs font-semibold text-sky-300 transition-all hover:bg-sky-500/20 hover:scale-105 active:scale-95 shadow-sm"
          title={language === 'en' ? t('Switch to Arabic') : t('Switch to English')}
          aria-label={language === 'en' ? t('Switch to Arabic') : t('Switch to English')}
        >
          <Languages className="h-4 w-4 text-sky-400" />
          <span className="font-mono text-[11px] font-bold tracking-wide">
            {language === 'en' ? 'عربي' : 'EN'}
          </span>
        </button>

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

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((prev) => !prev)}
            className="top-header-profile group flex items-center gap-2 rounded-lg border border-line bg-navy-800/60 py-1 pl-1 pr-2.5 transition-all hover:border-sky-400/40 hover:bg-navy-800 active:scale-95"
            aria-label="User profile and role switcher"
          >
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-bold text-white shadow-sm ring-1 ring-white/20 transition-transform group-hover:scale-105 ${
                currentUser?.role === 'admin'
                  ? 'bg-gradient-to-br from-purple-500 to-indigo-600'
                  : currentUser?.role === 'manager'
                    ? 'bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600'
                    : 'bg-gradient-to-br from-emerald-400 to-teal-600'
              }`}
            >
              {language === 'ar'
                ? (currentUser?.avatarInitialsAr ?? 'مخ')
                : (currentUser?.avatarInitials ?? 'EK')}
            </div>
            <div className="hidden text-left leading-none sm:block">
              <p className="text-[11.5px] font-semibold text-ink group-hover:text-sky-300 transition-colors">
                {language === 'ar' && currentUser?.nameAr
                  ? currentUser.nameAr
                  : (currentUser?.name ?? t('Eng. Khaled'))}
              </p>
              <p className="mt-0.5 text-[10px] text-ink-faint capitalize">
                {t(
                  currentUser?.role === 'admin'
                    ? 'Admin'
                    : currentUser?.role === 'manager'
                      ? 'Maintenance Manager'
                      : 'Technician'
                )}
              </p>
            </div>
            <ChevronDown
              className={`hidden h-3.5 w-3.5 text-ink-faint sm:block transition-transform duration-200 ${
                profileOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Profile & Role Switcher Dropdown */}
          {profileOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-line bg-navy-900/95 p-3 shadow-2xl backdrop-blur-2xl z-50 animate-fadeIn"
              style={{
                backgroundImage:
                  'linear-gradient(180deg, rgba(56, 189, 248, 0.08) 0%, rgba(99, 102, 241, 0.04) 50%, rgba(0, 0, 0, 0) 100%)',
              }}
            >
              <div className="border-b border-line pb-3 mb-2.5">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold text-white shadow-sm ring-1 ring-white/20 ${
                      currentUser?.role === 'admin'
                        ? 'bg-gradient-to-br from-purple-500 to-indigo-600'
                        : currentUser?.role === 'manager'
                          ? 'bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600'
                          : 'bg-gradient-to-br from-emerald-400 to-teal-600'
                    }`}
                  >
                    {language === 'ar'
                      ? currentUser?.avatarInitialsAr
                      : currentUser?.avatarInitials}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-xs text-ink truncate">
                      {language === 'ar' && currentUser?.nameAr
                        ? currentUser.nameAr
                        : currentUser?.name}
                    </p>
                    <p className="text-[10px] text-ink-faint truncate font-mono">
                      {currentUser?.email}
                    </p>
                  </div>
                </div>

                <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      currentUser?.role === 'admin'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : currentUser?.role === 'manager'
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {t(
                      currentUser?.role === 'admin'
                        ? 'Admin'
                        : currentUser?.role === 'manager'
                          ? 'Maintenance Manager'
                          : 'Technician'
                    )}
                  </span>
                  <span className="rounded-md border border-line bg-navy-800 px-2 py-0.5 text-[10px] text-ink-dim">
                    {currentUser?.status === 'active' ? (
                      <span className="text-emerald-400 font-semibold">
                        {t('Active')}
                      </span>
                    ) : (
                      <span className="text-red-400 font-semibold">
                        {t('Deactivated')}
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* Quick Links */}
              <div className="mt-2.5 pt-2 border-t border-line space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    navigate('/profile')
                    setProfileOpen(false)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-ink-dim hover:bg-navy-800 hover:text-sky-300 transition-colors font-medium"
                >
                  <User className="h-3.5 w-3.5 text-emerald-400" />
                  {t('My Profile & Permissions')}
                </button>

                {isSimulatedUser && (
                  <button
                    type="button"
                    onClick={() => {
                      restoreOriginalUser()
                      setProfileOpen(false)
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 transition-colors font-semibold"
                  >
                    <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
                    {t('Exit Preview (Back to Admin)')}
                  </button>
                )}

                {currentUser?.role === 'admin' && (
                  <button
                    type="button"
                    onClick={() => {
                      navigate('/users')
                      setProfileOpen(false)
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-ink-dim hover:bg-navy-800 hover:text-sky-300 transition-colors"
                  >
                    <Users className="h-3.5 w-3.5 text-sky-400" />
                    {t('User Management & RBAC')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    navigate('/settings')
                    setProfileOpen(false)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-ink-dim hover:bg-navy-800 hover:text-sky-300 transition-colors"
                >
                  <Wrench className="h-3.5 w-3.5 text-ink-faint" />
                  {t('Settings')}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setProfileOpen(false)
                    await signOutUser()
                    navigate('/')
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5 text-red-400" />
                  {t('Sign Out')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <QrScannerModal isOpen={qrScannerOpen} onClose={() => setQrScannerOpen(false)} />
    </header>
  )
}
