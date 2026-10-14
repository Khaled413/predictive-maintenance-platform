import React, { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ShieldAlert, Loader2 } from 'lucide-react'
import type { Permission } from '../../types/auth'
import { useAuth } from '../../context/AuthContext'
import AccessDeniedPage from '../../pages/AccessDeniedPage'

interface ProtectedRouteProps {
  permission?: Permission
  permissions?: Permission[]
  requireAll?: boolean
  children?: React.ReactNode
}

export default function ProtectedRoute({
  permission,
  permissions,
  requireAll = false,
  children,
}: ProtectedRouteProps) {
  const location = useLocation()
  const {
    currentUser,
    isLoading,
    isConfigured,
    configError,
    checkPermission,
    checkAnyPermission,
    checkAllPermissions,
    logSecurityEvent,
  } = useAuth()

  // 1. Evaluate granular role permissions unconditionally at top
  let isAuthorized = true
  let requiredTag = ''

  if (permission) {
    isAuthorized = checkPermission(permission)
    requiredTag = permission
  } else if (permissions && permissions.length > 0) {
    isAuthorized = requireAll
      ? checkAllPermissions(permissions)
      : checkAnyPermission(permissions)
    requiredTag = permissions.join(', ')
  }

  useEffect(() => {
    if (!isLoading && isConfigured && currentUser && !isAuthorized) {
      logSecurityEvent({
        action: 'route.access_denied',
        resourceType: 'route',
        outcome: 'DENY',
        details: `Access to ${location.pathname} denied. Required: [${requiredTag}]. User: ${currentUser.email} (${currentUser.role}).`,
      })
    }
  }, [isLoading, isConfigured, isAuthorized, requiredTag, currentUser, location.pathname, logSecurityEvent])

  // 2. Initializing authentication state
  if (isLoading) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center bg-navy-950 text-ink">
        <div className="flex flex-col items-center gap-4 p-8">
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-2 border-sky-500/20" />
            <Loader2 className="absolute inset-0 h-12 w-12 animate-spin text-sky-400" />
          </div>
          <p className="font-mono text-xs tracking-wider text-sky-300 animate-pulse">
            VERIFYING INDUSTRIAL SECURITY CREDENTIALS…
          </p>
        </div>
      </div>
    )
  }

  // 3. Fail closed if Supabase is unconfigured
  if (!isConfigured) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center bg-navy-950 p-6 text-center text-ink">
        <div className="max-w-md rounded-2xl border border-red-500/40 bg-navy-900/90 p-8 shadow-2xl backdrop-blur-xl">
          <ShieldAlert className="mx-auto h-12 w-12 text-red-400" />
          <h2 className="mt-4 text-lg font-bold text-ink">Security Alert: Auth Unconfigured</h2>
          <p className="mt-2 text-xs text-ink-dim leading-relaxed">
            {configError ||
              'Supabase authentication credentials are required to access operational fleet telemetry.'}
          </p>
        </div>
      </div>
    )
  }

  // 4. Unauthenticated visitors are redirected to public landing page
  if (!currentUser) {
    return <Navigate to="/" state={{ from: location.pathname, requireAuth: true }} replace />
  }

  // 5. Deactivated accounts are prohibited immediately
  if (currentUser.status === 'deactivated') {
    return (
      <AccessDeniedPage
        reason="Your account has been deactivated by the plant administrator."
      />
    )
  }

  // 6. Granular permission boundary
  if (!isAuthorized) {
    return <AccessDeniedPage requiredPermission={requiredTag} />
  }

  return <>{children}</>
}
