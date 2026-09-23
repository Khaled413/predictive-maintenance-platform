import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { cx } from '../../utils/helpers'

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const STYLES = {
  success: 'border-emerald-400/30 text-emerald-300',
  error: 'border-red-400/30 text-red-300',
  warning: 'border-amber-400/30 text-amber-300',
  info: 'border-sky-400/30 text-sky-300',
}

export default function Toasts() {
  const { toasts, dismissToast } = useApp()

  if (!toasts.length) return null

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-80 flex-col gap-2.5">
      {toasts.map((t) => {
        const Icon = ICONS[t.type]
        return (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto animate-fadeUp rounded-xl border bg-navy-800/95 p-3.5 shadow-panel backdrop-blur-xl',
              STYLES[t.type],
            )}
          >
            <div className="flex items-start gap-2.5">
              <Icon className="mt-0.5 h-4.5 w-4.5 shrink-0 h-[18px] w-[18px]" />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-semibold text-ink">{t.title}</p>
                {t.message && (
                  <p className="mt-0.5 text-[11.5px] leading-snug text-ink-dim">{t.message}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                className="rounded p-1 text-ink-faint transition-colors hover:text-ink"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}