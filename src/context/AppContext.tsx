import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import { requestPrediction } from '../data/predictionApi'
import { machineTypeCode, simulateMachineInputs } from '../utils/simulatedInputs'
import type { PredictionInputs, PredictionResponse } from '../types'

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
  predictMachine: (id: string, inputs: PredictionInputs) => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedState
      if (Array.isArray(parsed.machines) && parsed.machines.length) {
        return {
          machines: parsed.machines.map((machine) => {
            const modelTypeCode = machineTypeCode(machine.type)
            const predictionInputs =
              machine.predictionInputs?.type === modelTypeCode &&
              machine.predictionInputs.machine_input_source === 'simulated' &&
              machine.predictionInputs.sensor_input_source === 'simulated'
                ? machine.predictionInputs
                : simulateMachineInputs(machine.id, machine.type)
            const prediction =
              machine.prediction?.prediction_source === 'Trained ML Models' &&
              typeof machine.prediction.machine_inputs_simulated === 'boolean' &&
              typeof machine.prediction.sensor_inputs_simulated === 'boolean' &&
              Array.isArray(machine.prediction.anomaly_features_used) &&
              typeof machine.prediction.anomaly_model_inputs === 'object' &&
              typeof machine.prediction.anomaly_input_reading_count === 'number'
              ? machine.prediction
              : undefined
            return {
              ...machine,
              modelTypeCode,
              prediction,
              predictionInputs,
              predictionStatus: 'loading' as const,
              predictionError: undefined,
              status: null,
              healthScore: null,
              failureRisk: null,
              recommendation: null,
              likelihood: null,
              history: prediction ? machine.history ?? [] : [],
            }
          }),
          maintenance: parsed.maintenance ?? SEED_MAINTENANCE,
          alerts: (parsed.alerts ?? SEED_ALERTS).filter((alert) => !/^AL-\d+$/.test(alert.id)),
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

function predictionAlert(machine: Machine, prediction: PredictionResponse): Alert | null {
  if (!prediction.anomaly_flag && prediction.failure_probability < 0.5) return null
  const type = prediction.anomaly_flag ? 'ML Anomaly Detected' : 'ML Failure Risk'
  const failureType = prediction.failure_type ?? 'No failure type classified by the model'
  const maintenanceNote = machine.maintenanceStatus === 'Overdue'
    ? ' Maintenance is overdue; the model recommendation does not update the maintenance schedule.'
    : ''
  return {
    id: `ML-${machine.id}-${prediction.timestamp.replace(/[^0-9]/g, '')}`,
    machineId: machine.id,
    machineName: machine.name,
    severity: prediction.status === 'Critical' ? 'critical' : 'warning',
    type,
    message: prediction.anomaly_flag
      ? `Model anomaly score ${(prediction.anomaly_score * 100).toFixed(1)}%. Failure type: ${failureType}.${maintenanceNote}`
      : `Model estimates ${(prediction.failure_probability * 100).toFixed(1)}% failure probability. Failure type: ${failureType}.${maintenanceNote}`,
    timestamp: prediction.timestamp,
    status: 'active',
    recommendedAction: prediction.recommendation,
  }
}

function addPredictionAlert(alerts: Alert[], machine: Machine, prediction: PredictionResponse): Alert[] {
  const alert = predictionAlert(machine, prediction)
  if (
    !alert ||
    alerts.some(
      (existing) =>
        existing.machineId === machine.id &&
        existing.type === alert.type &&
        existing.status !== 'resolved',
    )
  ) return alerts
  return [alert, ...alerts]
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistedState>(loadState)
  const [lastUpdated, setLastUpdated] = useState(() => new Date().toISOString())
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const startupRequestsStarted = useRef(false)

  const predictMachine = useCallback(async (id: string, inputs: PredictionInputs) => {
    setState((s) => ({
      ...s,
      machines: s.machines.map((machine) =>
        machine.id === id
          ? {
              ...machine,
              modelTypeCode: inputs.type,
              predictionStatus: 'loading',
              predictionError: undefined,
              predictionInputs: inputs,
            }
          : machine,
      ),
    }))

    try {
      const prediction: PredictionResponse = await requestPrediction(inputs)
      if (prediction.machine_id !== id) throw new Error('Prediction response machine ID did not match')
      if (prediction.inputs.type !== inputs.type) {
        throw new Error('Prediction response model type did not match')
      }
      if (
        prediction.machine_input_source !== inputs.machine_input_source ||
        prediction.sensor_input_source !== inputs.sensor_input_source
      ) {
        throw new Error('Prediction response input sources did not match')
      }
      setState((s) => {
        const machine = s.machines.find((item) => item.id === id)
        if (!machine || machine.predictionInputs?.type !== inputs.type) return s
        const history = [
          ...machine.history,
          {
            date: prediction.timestamp,
            health: prediction.health_score,
            risk: prediction.failure_probability * 100,
          },
        ].sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
        const updatedMachine: Machine = {
          ...machine,
          predictionStatus: 'available',
          predictionError: undefined,
          prediction,
          predictionInputs: inputs,
          status: prediction.status,
          healthScore: prediction.health_score,
          failureRisk: prediction.failure_probability * 100,
          recommendation: prediction.recommendation,
          likelihood: prediction.failure_type,
          history,
        }
        const alerts = addPredictionAlert(s.alerts, machine, prediction)
        return {
          ...s,
          machines: s.machines.map((item) => (item.id === id ? updatedMachine : item)),
          alerts,
        }
      })
    } catch (error) {
      const predictionError =
        error instanceof Error ? error.message : 'Prediction request failed unexpectedly'
      setState((s) => ({
        ...s,
        machines: s.machines.map((machine) =>
          machine.id === id && machine.predictionInputs?.type === inputs.type
            ? {
                ...machine,
                predictionStatus: 'unavailable',
                predictionError,
                prediction: undefined,
                status: null,
                healthScore: null,
                failureRisk: null,
                recommendation: null,
                likelihood: null,
              }
            : machine,
        ),
      }))
    }
  }, [])

  useEffect(() => {
    if (startupRequestsStarted.current) return
    startupRequestsStarted.current = true
    state.machines.forEach((machine) => {
      if (machine.predictionStatus === 'loading') {
        if (machine.predictionInputs) {
          void predictMachine(machine.id, machine.predictionInputs)
        }
      }
    })
    // Startup requests intentionally run once; added machines request explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    setState((s) => ({
      ...s,
      machines: [...s.machines, m],
      alerts: m.prediction ? addPredictionAlert(s.alerts, m, m.prediction) : s.alerts,
    }))
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
    SEED_MACHINES.forEach((machine) => {
      if (machine.predictionInputs) {
        void predictMachine(machine.id, machine.predictionInputs)
      }
    })
  }, [predictMachine])

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
      predictMachine,
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
      predictMachine,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}