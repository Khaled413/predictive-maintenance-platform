import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type {
  Alert,
  DocStatus,
  Inspection,
  KnowledgeDoc,
  Machine,
  MaintenanceRecord,
  Thresholds,
  ToastMsg,
} from '../types'
import {
  DEFAULT_THRESHOLDS,
  SEED_ALERTS,
  SEED_DOCUMENTS,
  SEED_INSPECTIONS,
  SEED_MAINTENANCE,
  SEED_MACHINES,
} from '../data/mockData'

const STORAGE_KEY = 'iap-state-v3'

interface PersistedState {
  machines: Machine[]
  maintenance: MaintenanceRecord[]
  alerts: Alert[]
  inspections: Inspection[]
  documents: KnowledgeDoc[]
  thresholds: Thresholds
}

interface AppContextValue extends PersistedState {
  lastUpdated: string
  toasts: ToastMsg[]
  notify: (type: ToastMsg['type'], title: string, message?: string) => void
  dismissToast: (id: string) => void
  addMachine: (m: Machine) => void
  updateMachine: (id: string, patch: Partial<Machine>) => void
  deleteMachine: (id: string) => void
  addMaintenance: (r: MaintenanceRecord) => void
  updateMaintenance: (id: string, patch: Partial<MaintenanceRecord>) => void
  deleteMaintenance: (id: string) => void
  setAlertStatus: (id: string, status: Alert['status']) => void
  addAlert: (a: Alert) => void
  addInspection: (i: Inspection) => void
  addDocument: (d: KnowledgeDoc) => void
  deleteDocument: (id: string) => void
  setDocumentStatus: (id: string, status: DocStatus) => void
  saveThresholds: (t: Thresholds) => void
  refreshTimestamp: () => void
  resetDemo: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedState
      if (Array.isArray(parsed.machines) && parsed.machines.length) {
        return {
          machines: parsed.machines,
          maintenance: parsed.maintenance ?? SEED_MAINTENANCE,
          alerts: parsed.alerts ?? SEED_ALERTS,
          inspections: parsed.inspections ?? SEED_INSPECTIONS,
          documents: parsed.documents ?? SEED_DOCUMENTS,
          thresholds: { ...DEFAULT_THRESHOLDS, ...parsed.thresholds },
        }
      }
    }
  } catch {
    // fall through to seeds
  }
  return {
    machines: SEED_MACHINES,
    maintenance: SEED_MAINTENANCE,
    alerts: SEED_ALERTS,
    inspections: SEED_INSPECTIONS,
    documents: SEED_DOCUMENTS,
    thresholds: DEFAULT_THRESHOLDS,
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistedState>(loadState)
  const [lastUpdated, setLastUpdated] = useState(() => new Date().toISOString())
  const [toasts, setToasts] = useState<ToastMsg[]>([])

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // storage unavailable — ignore
    }
  }, [state])

  const dismissToast = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const notify = useCallback(
    (type: ToastMsg['type'], title: string, message?: string) => {
      const id = `toast-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      setToasts((t) => [...t.slice(-3), { id, type, title, message }])
      window.setTimeout(() => dismissToast(id), 4200)
    },
    [dismissToast],
  )

  const refreshTimestamp = useCallback(() => setLastUpdated(new Date().toISOString()), [])

  const addMachine = useCallback((m: Machine) => {
    setState((s) => ({ ...s, machines: [...s.machines, m] }))
  }, [])

  const updateMachine = useCallback((id: string, patch: Partial<Machine>) => {
    setState((s) => ({
      ...s,
      machines: s.machines.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }))
  }, [])

  const deleteMachine = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      machines: s.machines.filter((m) => m.id !== id),
      maintenance: s.maintenance.filter((r) => r.machineId !== id),
      alerts: s.alerts.filter((a) => a.machineId !== id),
    }))
  }, [])

  const addMaintenance = useCallback((r: MaintenanceRecord) => {
    setState((s) => ({ ...s, maintenance: [r, ...s.maintenance] }))
  }, [])

  const updateMaintenance = useCallback((id: string, patch: Partial<MaintenanceRecord>) => {
    setState((s) => ({
      ...s,
      maintenance: s.maintenance.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }))
  }, [])

  const deleteMaintenance = useCallback((id: string) => {
    setState((s) => ({ ...s, maintenance: s.maintenance.filter((r) => r.id !== id) }))
  }, [])

  const setAlertStatus = useCallback((id: string, status: Alert['status']) => {
    setState((s) => ({
      ...s,
      alerts: s.alerts.map((a) => (a.id === id ? { ...a, status } : a)),
    }))
  }, [])

  const addAlert = useCallback((a: Alert) => {
    setState((s) => ({ ...s, alerts: [a, ...s.alerts] }))
  }, [])

  const addInspection = useCallback((i: Inspection) => {
    setState((s) => ({ ...s, inspections: [i, ...s.inspections] }))
  }, [])

  const addDocument = useCallback((d: KnowledgeDoc) => {
    setState((s) => ({ ...s, documents: [d, ...s.documents] }))
  }, [])

  const deleteDocument = useCallback((id: string) => {
    setState((s) => ({ ...s, documents: s.documents.filter((d) => d.id !== id) }))
  }, [])

  const setDocumentStatus = useCallback((id: string, status: DocStatus) => {
    setState((s) => ({
      ...s,
      documents: s.documents.map((d) => (d.id === id ? { ...d, status } : d)),
    }))
  }, [])

  const saveThresholds = useCallback((t: Thresholds) => {
    setState((s) => ({ ...s, thresholds: t }))
  }, [])

  const resetDemo = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setState({
      machines: SEED_MACHINES,
      maintenance: SEED_MAINTENANCE,
      alerts: SEED_ALERTS,
      inspections: SEED_INSPECTIONS,
      documents: SEED_DOCUMENTS,
      thresholds: DEFAULT_THRESHOLDS,
    })
    setLastUpdated(new Date().toISOString())
  }, [])

  const value = useMemo<AppContextValue>(
    () => ({
      ...state,
      lastUpdated,
      toasts,
      notify,
      dismissToast,
      addMachine,
      updateMachine,
      deleteMachine,
      addMaintenance,
      updateMaintenance,
      deleteMaintenance,
      setAlertStatus,
      addAlert,
      addInspection,
      addDocument,
      deleteDocument,
      setDocumentStatus,
      saveThresholds,
      refreshTimestamp,
      resetDemo,
    }),
    [
      state,
      lastUpdated,
      toasts,
      notify,
      dismissToast,
      addMachine,
      updateMachine,
      deleteMachine,
      addMaintenance,
      updateMaintenance,
      deleteMaintenance,
      setAlertStatus,
      addAlert,
      addInspection,
      addDocument,
      deleteDocument,
      setDocumentStatus,
      saveThresholds,
      refreshTimestamp,
      resetDemo,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}