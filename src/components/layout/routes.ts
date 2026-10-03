import {
  BarChart3,
  BellRing,
  Bot,
  Factory,
  LayoutDashboard,
  ScanLine,
  Settings,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  end?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { path: '/machines', label: 'Machines', icon: Factory },
  { path: '/maintenance', label: 'Maintenance', icon: Wrench },
  { path: '/quality', label: 'Quality Inspection', icon: ScanLine },
  { path: '/assistant', label: 'AI Assistant', icon: Bot },
  { path: '/alerts', label: 'Alerts', icon: BellRing },
  { path: '/reports', label: 'Reports', icon: BarChart3 },
  { path: '/settings', label: 'Settings', icon: Settings },
]

export const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  '/': {
    title: 'Overview',
    subtitle: 'Real-time fleet health and predictive maintenance summary',
  },
  '/machines': {
    title: 'Machines',
    subtitle: 'Manage your equipment fleet and sensor configurations',
  },
  '/maintenance': {
    title: 'Maintenance',
    subtitle: 'Plan, track and complete maintenance work orders',
  },
  '/quality': {
    title: 'AI Quality Inspection',
    subtitle: 'Automated visual inspection with defect detection',
  },
  '/assistant': {
    title: 'Industrial AI Assistant',
    subtitle: 'Ask questions about machines, maintenance, production data, and uploaded documents.',
  },
  '/alerts': {
    title: 'Alerts Center',
    subtitle: 'Actionable alerts across machines, maintenance and quality',
  },
  '/reports': {
    title: 'Reports & Analytics',
    subtitle: 'Performance, reliability and quality analytics',
  },
  '/settings': {
    title: 'Settings',
    subtitle: 'Configure platform thresholds, notifications and AI behavior',
  },
}