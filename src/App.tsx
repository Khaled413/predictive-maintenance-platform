import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { AppProvider } from './context/AppContext'
import { PreferencesProvider } from './context/PreferencesContext'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/auth/ProtectedRoute'
import AccessDeniedPage from './pages/AccessDeniedPage'

/**
 * Pages are code-split so the heavy charting bundle (Recharts) is only fetched
 * when an analytics view is opened.
 */
const OverviewPage = lazy(() => import('./pages/OverviewPage'))
const MachinesPage = lazy(() => import('./pages/MachinesPage'))
const MachineDetailsPage = lazy(() => import('./pages/MachineDetailsPage'))
const MaintenancePage = lazy(() => import('./pages/MaintenancePage'))
const QualityPage = lazy(() => import('./pages/QualityPage'))
const AssistantPage = lazy(() => import('./pages/AssistantPage'))
const AlertsPage = lazy(() => import('./pages/AlertsPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const UsersPage = lazy(() => import('./pages/UsersPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const LandingPage = lazy(() => import('./pages/LandingPage'))

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <PreferencesProvider>
          <BrowserRouter>
            <Routes>
              {/* Public Marketing Landing Page */}
              <Route path="/" element={<LandingPage />} />

              {/* Authenticated Industrial Platform */}
              <Route element={<AppLayout />}>
                <Route
                  path="/app"
                  element={
                    <ProtectedRoute permission="dashboard.view">
                      <OverviewPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/overview"
                  element={
                    <ProtectedRoute permission="dashboard.view">
                      <OverviewPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/machines"
                  element={
                    <ProtectedRoute permission="machines.read">
                      <MachinesPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/machines/:id"
                  element={
                    <ProtectedRoute permission="machines.read">
                      <MachineDetailsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/maintenance"
                  element={
                    <ProtectedRoute permission="maintenance.read">
                      <MaintenancePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/users"
                  element={
                    <ProtectedRoute permission="users.read">
                      <UsersPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/quality"
                  element={
                    <ProtectedRoute permission="models.read">
                      <QualityPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/assistant"
                  element={
                    <ProtectedRoute permission="assistant.use">
                      <AssistantPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/alerts"
                  element={
                    <ProtectedRoute permission="alerts.read">
                      <AlertsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/reports"
                  element={
                    <ProtectedRoute permission="reports.read">
                      <ReportsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute permission="settings.read">
                      <SettingsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <ProfilePage />
                    </ProtectedRoute>
                  }
                />
                <Route path="/access-denied" element={<AccessDeniedPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </PreferencesProvider>
      </AppProvider>
    </AuthProvider>
  )
}
