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
    <div className="min-h-screen">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-h-screen min-w-0 flex-col lg:pl-60">
        <TopHeader onMenu={() => setMobileOpen(true)} />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1500px]">
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

      <div
        className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line p-2 shadow-card backdrop-blur-xl"
        style={{
          backgroundColor: 'rgb(var(--navy-900) / 0.88)',
          backgroundImage:
            'linear-gradient(180deg, rgba(56, 189, 248, 0.08) 0%, rgba(0, 0, 0, 0) 100%)',
        }}
      >
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-navy-800 text-ink-dim transition-all hover:border-sky-400/35 hover:bg-sky-500/15 hover:text-sky-300 active:scale-95"
          aria-label={
            theme === 'dark' ? t('Switch to light mode') : t('Switch to dark mode')
          }
          title={theme === 'dark' ? t('Switch to light mode') : t('Switch to dark mode')}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={toggleLanguage}
          className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-sky-300 transition-all active:scale-95"
          style={{
            backgroundImage:
              'linear-gradient(135deg, rgba(56, 189, 248, 0.18) 0%, rgba(99, 102, 241, 0.14) 100%)',
            border: '1px solid rgba(56, 189, 248, 0.28)',
          }}
          aria-label={language === 'en' ? t('Switch to Arabic') : t('Switch to English')}
          title={language === 'en' ? t('Switch to Arabic') : t('Switch to English')}
        >
          <Languages className="h-4 w-4" />
          <span data-no-translate>{language === 'en' ? 'AR' : 'EN'}</span>
        </button>
      </div>

      <Toasts />
    </div>
  )
}
