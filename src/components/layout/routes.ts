import {
  BarChart3,
  BellRing,
  Bot,
  Factory,
  LayoutDashboard,
  ScanLine,
  Settings,
  Users,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Permission } from '../../types/auth'

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  end?: boolean
  requiredPermission?: Permission
}

export const NAV_ITEMS: NavItem[] = [
  {
    path: '/app',
    label: 'Overview',
    icon: LayoutDashboard,
    end: true,
    requiredPermission: 'dashboard.view',
  },
  {
    path: '/machines',
    label: 'Machines',
    icon: Factory,
    requiredPermission: 'machines.read',
  },
  {
    path: '/maintenance',
    label: 'Maintenance',
    icon: Wrench,
    requiredPermission: 'maintenance.read',
  },
  {
    path: '/users',
    label: 'Users & RBAC',
    icon: Users,
    requiredPermission: 'users.read',
  },
  {
    path: '/quality',
    label: 'Quality Inspection',
    icon: ScanLine,
    requiredPermission: 'models.read',
  },
  {
    path: '/assistant',
    label: 'AI Assistant',
    icon: Bot,
    requiredPermission: 'assistant.use',
  },
  { path: '/alerts', label: 'Alerts', icon: BellRing, requiredPermission: 'alerts.read' },
  {
    path: '/reports',
    label: 'Reports',
    icon: BarChart3,
    requiredPermission: 'reports.read',
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: Settings,
    requiredPermission: 'settings.read',
  },
]

export const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  '/': {
    title: 'Overview',
    subtitle: 'Real-time fleet health and predictive maintenance summary',
  },
  '/app': {
    title: 'Overview',
    subtitle: 'Real-time fleet health and predictive maintenance summary',
  },
  '/overview': {
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
  '/users': {
    title: 'User Management & RBAC',
    subtitle:
      'Manage platform users, roles, machine authorizations, and security audit trail',
  },
  '/quality': {
    title: 'AI Quality Inspection',
    subtitle: 'Automated visual inspection with defect detection',
  },
  '/assistant': {
    title: 'Industrial AI Assistant',
    subtitle:
      'Ask questions about machines, maintenance, production data, and uploaded documents.',
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
  '/profile': {
    title: 'Employee Profile & Permissions',
    subtitle:
      'View your profile details, assigned machinery, and permissions granted by administration',
  },
}
