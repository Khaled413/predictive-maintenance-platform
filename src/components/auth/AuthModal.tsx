import React, { useState } from 'react'
import {
  Lock,
  Mail,
  Shield,
  X,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  ArrowRight,
  Database,
  Building2,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { usePreferences } from '../../context/PreferencesContext'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  initialMode?: 'signin' | 'reset' | 'request'
  onSuccess?: () => void
}

export default function AuthModal({
  isOpen,
  onClose,
  initialMode = 'signin',
  onSuccess,
}: AuthModalProps) {
  const { t } = usePreferences()
  const {
    signInWithEmail,
    requestPasswordReset,
    isSupabaseConnected,
    switchUser,
    users,
  } = useAuth()

  const [mode, setMode] = useState<'signin' | 'reset' | 'request'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Request Access state
  const [reqName, setReqName] = useState('')
  const [reqCompany, setReqCompany] = useState('')
  const [reqDepartment, setReqDepartment] = useState('')
  const [reqMachines, setReqMachines] = useState('5-25')

  if (!isOpen) return null

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMessage(null)
    setLoading(true)

    try {
      const res = await signInWithEmail(email, password)
      if (res.success) {
        setSuccessMessage('Authentication successful! Welcome to the platform.')
        setTimeout(() => {
          onClose()
          if (onSuccess) onSuccess()
        }, 800)
      } else {
        setError(res.error || 'Invalid credentials. Please try again.')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) {
      setError('Please provide your work email address.')
      return
    }
    setError(null)
    setLoading(true)

    try {
      const res = await requestPasswordReset(email)
      if (res.success) {
        setSuccessMessage(
          'Password reset instructions sent! Check your inbox to set a new password.'
        )
      } else {
        setError(res.error || 'Failed to initiate password recovery.')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setLoading(false)
    }
  }

  const handleRequestAccess = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    setTimeout(() => {
      setLoading(false)
      setSuccessMessage(
        `Access request submitted for ${reqName || email}! A plant administrator will review your organization request.`
      )
    }, 600)
  }

  // Quick-select demo accounts when offline/local mode
  const handleDemoLogin = (userId: string) => {
    switchUser(userId)
    setSuccessMessage('Logged in with demo credentials.')
    setTimeout(() => {
      onClose()
      if (onSuccess) onSuccess()
    }, 400)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-fadeIn"
      style={{ backgroundColor: 'rgba(5, 11, 24, 0.75)' }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-sky-400/25 p-6 shadow-2xl backdrop-blur-xl animate-fadeInScale"
        style={{
          backgroundColor: 'rgb(var(--navy-900) / 0.96)',
          backgroundImage:
            'radial-gradient(circle at top right, rgba(56, 189, 248, 0.12), transparent 70%), radial-gradient(circle at bottom left, rgba(99, 102, 241, 0.08), transparent 70%)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-line/60">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10 text-sky-400 shadow-[0_0_15px_-3px_rgba(56,189,248,0.3)]">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink">
                {mode === 'signin' && t('Enterprise Sign In')}
                {mode === 'reset' && t('Reset Password')}
                {mode === 'request' && t('Request Platform Access')}
              </h2>
              <div className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                <Database className="h-3 w-3 text-emerald-400" />
                <span>
                  {isSupabaseConnected ? 'Supabase Auth Protected' : 'Local RBAC Sandbox'}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-dim hover:bg-navy-800 hover:text-ink transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Status Alerts */}
        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMessage && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Mode: Sign In */}
        {mode === 'signin' && (
          <form onSubmit={handleSignIn} className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-dim">
                {t('Work Email')}
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                <input
                  type="email"
                  required
                  placeholder="engineer@plant.domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-line bg-navy-800/80 py-2.5 pl-9 pr-3 text-xs text-ink placeholder:text-ink-faint focus:border-sky-400/50 focus:outline-none focus:ring-1 focus:ring-sky-400/50"
                />
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-semibold text-ink-dim">{t('Password')}</label>
                <button
                  type="button"
                  onClick={() => {
                    setError(null)
                    setSuccessMessage(null)
                    setMode('reset')
                  }}
                  className="text-[11px] font-medium text-sky-400 hover:underline"
                >
                  {t('Forgot password?')}
                </button>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-line bg-navy-800/80 py-2.5 pl-9 pr-3 text-xs text-ink placeholder:text-ink-faint focus:border-sky-400/50 focus:outline-none focus:ring-1 focus:ring-sky-400/50"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-2.5 text-xs font-bold shadow-lg"
            >
              {loading ? t('Authenticating…') : t('Sign In to Platform')}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>

            {/* Offline Sandbox Quick Access Buttons */}
            {!isSupabaseConnected && (
              <div className="pt-2 border-t border-line/50">
                <p className="mb-2 text-[11px] font-semibold text-ink-faint">
                  {t('Quick Access Demo Accounts (Local Sandbox):')}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {users.slice(0, 3).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleDemoLogin(u.id)}
                      className="rounded-lg border border-line/60 bg-navy-800/60 p-2 text-left hover:border-sky-400/40 hover:bg-sky-500/10 transition-all text-[10px]"
                    >
                      <div className="font-bold text-ink truncate">{u.name}</div>
                      <div className="text-sky-300 capitalize">{u.role}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="text-center pt-2 text-xs text-ink-dim">
              <span>{t("Don't have an enterprise account?")} </span>
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setSuccessMessage(null)
                  setMode('request')
                }}
                className="font-semibold text-sky-400 hover:underline"
              >
                {t('Request Access')}
              </button>
            </div>
          </form>
        )}

        {/* Mode: Password Reset */}
        {mode === 'reset' && (
          <form onSubmit={handleResetPassword} className="mt-4 space-y-4">
            <p className="text-xs text-ink-dim leading-relaxed">
              {t(
                'Enter the email address registered with your industrial facility. We will send a secure password reset link.'
              )}
            </p>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-dim">
                {t('Registered Email')}
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                <input
                  type="email"
                  required
                  placeholder="engineer@plant.domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-line bg-navy-800/80 py-2.5 pl-9 pr-3 text-xs text-ink placeholder:text-ink-faint focus:border-sky-400/50 focus:outline-none focus:ring-1 focus:ring-sky-400/50"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-2.5 text-xs font-bold shadow-lg"
            >
              {loading ? t('Sending…') : t('Send Recovery Link')}
              <KeyRound className="h-3.5 w-3.5" />
            </button>

            <div className="text-center pt-1 text-xs text-ink-dim">
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setSuccessMessage(null)
                  setMode('signin')
                }}
                className="font-semibold text-sky-400 hover:underline"
              >
                {t('Back to Sign In')}
              </button>
            </div>
          </form>
        )}

        {/* Mode: Request Access */}
        {mode === 'request' && (
          <form onSubmit={handleRequestAccess} className="mt-4 space-y-3">
            <p className="text-xs text-ink-dim leading-relaxed">
              {t(
                'Account creation is invitation-only through your facility Administrator to enforce strict RBAC and equipment security.'
              )}
            </p>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-dim">
                {t('Full Name')}
              </label>
              <input
                type="text"
                required
                placeholder="Eng. Mohamed Ali"
                value={reqName}
                onChange={(e) => setReqName(e.target.value)}
                className="w-full rounded-xl border border-line bg-navy-800/80 py-2 px-3 text-xs text-ink placeholder:text-ink-faint focus:border-sky-400/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-dim">
                {t('Organization / Plant Name')}
              </label>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
                <input
                  type="text"
                  required
                  placeholder="Advanced Steel Rolling Mill"
                  value={reqCompany}
                  onChange={(e) => setReqCompany(e.target.value)}
                  className="w-full rounded-xl border border-line bg-navy-800/80 py-2 pl-9 pr-3 text-xs text-ink placeholder:text-ink-faint focus:border-sky-400/50 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-dim">
                  {t('Department')}
                </label>
                <input
                  type="text"
                  placeholder="Maintenance Dept"
                  value={reqDepartment}
                  onChange={(e) => setReqDepartment(e.target.value)}
                  className="w-full rounded-xl border border-line bg-navy-800/80 py-2 px-3 text-xs text-ink placeholder:text-ink-faint focus:border-sky-400/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-dim">
                  {t('Fleet Scale')}
                </label>
                <select
                  value={reqMachines}
                  onChange={(e) => setReqMachines(e.target.value)}
                  className="w-full rounded-xl border border-line bg-navy-800/80 py-2 px-3 text-xs text-ink focus:border-sky-400/50 focus:outline-none"
                >
                  <option value="1-5">1 - 5 Machines</option>
                  <option value="5-25">5 - 25 Machines</option>
                  <option value="25-100">25 - 100 Machines</option>
                  <option value="100+">100+ Fleet</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-2.5 text-xs font-bold shadow-lg"
            >
              {loading ? t('Submitting…') : t('Submit Enterprise Request')}
            </button>

            <div className="text-center pt-1 text-xs text-ink-dim">
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setSuccessMessage(null)
                  setMode('signin')
                }}
                className="font-semibold text-sky-400 hover:underline"
              >
                {t('Back to Sign In')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
