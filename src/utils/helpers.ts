import type { MachineStatus, SensorLevel, Severity } from '../types'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function clamp(n: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, n))
}

export function formatInt(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function timeAgo(iso: string): string {
  const sec = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.floor(hr / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  return `${mo}mo ago`
}

/** Deterministic pseudo-random generator (for reproducible demo data). */
export function seededRandom(seed: number): () => number {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

// ---------------------------------------------------------------------------
// Status / tone helpers
// ---------------------------------------------------------------------------

export function healthTone(score: number): 'ok' | 'warn' | 'danger' {
  if (score >= 75) return 'ok'
  if (score >= 55) return 'warn'
  return 'danger'
}

export function riskTone(risk: number): 'ok' | 'warn' | 'danger' {
  if (risk <= 40) return 'ok'
  if (risk <= 65) return 'warn'
  return 'danger'
}

export const statusBadge: Record<
  MachineStatus,
  { dot: string; text: string; pill: string }
> = {
  Operational: {
    dot: 'bg-emerald-400',
    text: 'text-emerald-300',
    pill: 'bg-emerald-400/10 border-emerald-400/25',
  },
  Warning: {
    dot: 'bg-amber-400',
    text: 'text-amber-300',
    pill: 'bg-amber-400/10 border-amber-400/25',
  },
  Critical: {
    dot: 'bg-red-400',
    text: 'text-red-300',
    pill: 'bg-red-400/10 border-red-400/30',
  },
  'Under Maintenance': {
    dot: 'bg-sky-400',
    text: 'text-sky-300',
    pill: 'bg-sky-400/10 border-sky-400/25',
  },
}

export const severityClasses: Record<
  Severity,
  { text: string; pill: string; ring: string }
> = {
  critical: {
    text: 'text-red-300',
    pill: 'bg-red-500/10 border-red-500/30',
    ring: 'text-red-400',
  },
  warning: {
    text: 'text-amber-300',
    pill: 'bg-amber-500/10 border-amber-500/30',
    ring: 'text-amber-400',
  },
  info: {
    text: 'text-sky-300',
    pill: 'bg-sky-500/10 border-sky-500/30',
    ring: 'text-sky-400',
  },
  success: {
    text: 'text-emerald-300',
    pill: 'bg-emerald-500/10 border-emerald-500/30',
    ring: 'text-emerald-400',
  },
}

export const sensorLevelClasses: Record<
  SensorLevel,
  { bar: string; text: string; dot: string }
> = {
  green: { bar: 'bg-emerald-400', text: 'text-emerald-300', dot: 'bg-emerald-400' },
  amber: { bar: 'bg-amber-400', text: 'text-amber-300', dot: 'bg-amber-400' },
  red: { bar: 'bg-red-400', text: 'text-red-300', dot: 'bg-red-400' },
}

export const HEALTH_CIRCLE_COLORS = {
  ok: { track: 'rgba(52,211,153,0.12)', stroke: '#34D399', text: 'text-emerald-300' },
  warn: { track: 'rgba(251,191,36,0.12)', stroke: '#FBBF24', text: 'text-amber-300' },
  danger: { track: 'rgba(248,113,113,0.12)', stroke: '#F87171', text: 'text-red-300' },
}

export const riskBarColors = {
  ok: 'bg-emerald-400',
  warn: 'bg-amber-400',
  danger: 'bg-red-400',
}

export const riskTextColors = {
  ok: 'text-emerald-300',
  warn: 'text-amber-300',
  danger: 'text-red-300',
}

/** Recent ISO date for a number of hours ago. */
export function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString()
}

export function daysAgo(d: number): string {
  return new Date(Date.now() - d * 86_400_000).toISOString()
}

export function nowIso(): string {
  return new Date().toISOString()
}
