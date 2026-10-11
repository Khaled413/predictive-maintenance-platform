import { useEffect } from 'react'
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
  const {
    currentUser,
    checkPermission,
    checkAnyPermission,
    checkAllPermissions,
    logSecurityEvent,
  } = useAuth()

  // Evaluate permission
  let isAuthorized = true
  let requiredTag = ''

  if (currentUser?.status === 'deactivated') {
    isAuthorized = false
  } else if (permission) {
    isAuthorized = checkPermission(permission)
    requiredTag = permission
  } else if (permissions && permissions.length > 0) {
    isAuthorized = requireAll
      ? checkAllPermissions(permissions)
      : checkAnyPermission(permissions)
    requiredTag = permissions.join(', ')
  }

  useEffect(() => {
    if (!isAuthorized) {
      logSecurityEvent({
        action: 'route.access_denied',
        resourceType: 'route',
        outcome: 'DENY',
        details: `Access to protected route denied. Required: [${requiredTag}]. User role: ${currentUser?.role ?? 'None'}, status: ${currentUser?.status ?? 'Unknown'}.`,
      })
    }
  }, [isAuthorized, requiredTag, currentUser, logSecurityEvent])

  if (!isAuthorized) {
    return <AccessDeniedPage requiredPermission={requiredTag} />
  }

  return <>{children}</>
}
