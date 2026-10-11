import { Suspense, useState } from 'react'
import { Moon, Sun, Languages } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopHeader from './TopHeader'
import Toasts from '../ui/Toasts'
import PageSkeleton from '../ui/PageSkeleton'
import { usePreferences } from '../../context/PreferencesContext'

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { theme, language, toggleTheme, toggleLanguage, t } = usePreferences()

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* Decorative ambient gradient orbs */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div className="absolute -right-32 -top-32 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-cyan-500/4 via-blue-600/3 to-transparent blur-[120px]" />
        <div className="absolute -left-32 top-1/3 h-[450px] w-[450px] rounded-full bg-gradient-to-tr from-purple-600/3 via-indigo-500/3 to-transparent blur-[120px]" />
        <div className="absolute bottom-10 right-1/4 h-[380px] w-[380px] rounded-full bg-gradient-to-r from-teal-500/3 via-sky-500/3 to-transparent blur-[120px]" />
      </div>

      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="relative z-10 flex min-h-screen min-w-0 flex-col lg:pl-60">
        <TopHeader onMenu={() => setMobileOpen(true)} />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1500px] animate-fadeInScale">
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
        <footer className="border-t border-line px-6 py-4 text-center text-[11px] text-ink-faint">
          {t('Industrial AI Platform')} · {t('Machine Health & Maintenance Dashboard')} ·{' '}
          {t(
            'DEMO MODE · predictions use simulated inputs; displayed sensor readings are illustrative only'
          )}
        </footer>
      </div>

      {/* Floating Theme & Language Quick-Switcher */}
      <div
        className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-sky-400/25 p-1.5 shadow-[0_14px_34px_-6px_rgba(0,0,0,0.65)] backdrop-blur-2xl transition-all hover:scale-105"
        style={{
          backgroundColor: 'rgb(var(--navy-900) / 0.94)',
          backgroundImage:
            'linear-gradient(135deg, rgba(56, 189, 248, 0.12) 0%, rgba(99, 102, 241, 0.08) 50%, rgba(168, 85, 247, 0.06) 100%)',
        }}
      >
        <button
          type="button"
          onClick={toggleTheme}
          className="group flex h-9 w-9 items-center justify-center rounded-full border border-line bg-navy-800 text-ink-dim transition-all hover:border-sky-400/40 hover:bg-sky-500/20 hover:text-sky-300 active:scale-95"
          aria-label={
            theme === 'dark' ? t('Switch to light mode') : t('Switch to dark mode')
          }
          title={theme === 'dark' ? t('Switch to light mode') : t('Switch to dark mode')}
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 transition-transform duration-300 group-hover:rotate-45 text-amber-300" />
          ) : (
            <Moon className="h-4 w-4 transition-transform duration-300 group-hover:-rotate-12 text-sky-400" />
          )}
        </button>
        <button
          type="button"
          onClick={toggleLanguage}
          className="group flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-sky-300 transition-all hover:brightness-110 active:scale-95"
          style={{
            backgroundImage:
              'linear-gradient(135deg, rgba(56, 189, 248, 0.22) 0%, rgba(99, 102, 241, 0.2) 100%)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            boxShadow: '0 0 12px -2px rgba(56, 189, 248, 0.25)',
          }}
          aria-label={language === 'en' ? t('Switch to Arabic') : t('Switch to English')}
          title={language === 'en' ? t('Switch to Arabic') : t('Switch to English')}
        >
          <Languages className="h-3.5 w-3.5 transition-transform duration-300 group-hover:scale-110" />
          <span data-no-translate className="font-mono text-[11px] font-bold tracking-wider">
            {language === 'en' ? 'AR' : 'EN'}
          </span>
        </button>
      </div>

      <Toasts />
    </div>
  )
}
