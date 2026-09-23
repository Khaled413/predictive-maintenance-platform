import React, { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { PreferencesProvider } from './context/PreferencesContext'
import AppLayout from './components/layout/AppLayout'

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

export default function App() {
  return (
    <AppProvider>
      <PreferencesProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/machines" element={<MachinesPage />} />
              <Route path="/machines/:id" element={<MachineDetailsPage />} />
              <Route path="/maintenance" element={<MaintenancePage />} />
              <Route path="/quality" element={<QualityPage />} />
              <Route path="/assistant" element={<AssistantPage />} />
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </PreferencesProvider>
    </AppProvider>
  )
}
