import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Lock,
  Mail,
  Shield,
  X,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  ArrowRight,
  Building2,
  Info,
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
  const navigate = useNavigate()
  const { t } = usePreferences()
  const { signInWithEmail, requestPasswordReset } = useAuth()

  const [mode, setMode] = useState<'signin' | 'reset' | 'request'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMessage(null)
    setLoading(true)

    try {
      const res = await signInWithEmail(email, password)
      if (res.success) {
        setSuccessMessage('Authentication verified. Accessing industrial workspace…')
        setTimeout(() => {
          onClose()
          navigate('/app')
          if (onSuccess) onSuccess()
        }, 600)
      } else {
        setError(
          res.error || 'Invalid credentials. Please verify your email and password.'
        )
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('Please provide your work email address.')
      return
    }
    setError(null)
    setLoading(true)

    try {
      const res = await requestPasswordReset(email)
      if (res.success) {
        setSuccessMessage(
          'Password recovery instructions dispatched. Please check your corporate inbox.'
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
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-ink-dim hover:bg-navy-800 hover:text-ink transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 border-b border-line pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-400/30 bg-gradient-to-br from-sky-500/20 to-indigo-600/20 text-sky-400 shadow-sm">
            {mode === 'signin' && <Shield className="h-5 w-5" />}
            {mode === 'reset' && <KeyRound className="h-5 w-5" />}
            {mode === 'request' && <Building2 className="h-5 w-5" />}
          </div>
          <div>
            <h2 className="text-base font-bold text-ink">
              {mode === 'signin' && t('Enterprise Authentication')}
              {mode === 'reset' && t('Password Recovery')}
              {mode === 'request' && t('Invitation-Only Access')}
            </h2>
            <p className="text-[11px] text-ink-dim">
              {mode === 'signin' && t('Sign in to access assigned machinery & telemetry')}
              {mode === 'reset' && t('Reset credentials via registered facility email')}
              {mode === 'request' && t('Enterprise governance and user provisioning')}
            </p>
          </div>
        </div>

        {/* Feedback alerts */}
        {error && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200 animate-shake">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        {successMessage && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div className="flex-1">{successMessage}</div>
          </div>
        )}

        {/* Mode: Sign In */}
        {mode === 'signin' && (
          <form onSubmit={handleSignIn} className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-dim">
                {t('Email')}
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
                <label className="text-xs font-semibold text-ink-dim">
                  {t('Password')}
                </label>
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
                {t('Access Policy')}
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

        {/* Mode: Access Policy / Request Access Information */}
        {mode === 'request' && (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 p-4 text-xs text-ink-dim leading-relaxed space-y-2">
              <div className="flex items-center gap-2 font-bold text-sky-300">
                <Info className="h-4 w-4 shrink-0 text-sky-400" />
                <span>{t('Strict Invitation-Only Governance')}</span>
              </div>
              <p>
                {t(
                  'To uphold manufacturing plant safety, critical equipment integrity, and Row Level Security, public registration is strictly disabled.'
                )}
              </p>
              <p>
                {t(
                  'All operator, manager, and technician accounts are provisioned exclusively through authorized Plant Administrators.'
                )}
              </p>
              <p className="text-ink font-medium">
                {t(
                  'Please contact your organization’s Plant Administrator or IT reliability lead to receive an onboarding invitation link.'
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setError(null)
                setSuccessMessage(null)
                setMode('signin')
              }}
              className="btn-primary w-full justify-center py-2.5 text-xs font-bold"
            >
              {t('Return to Sign In')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
