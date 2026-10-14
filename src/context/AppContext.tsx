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
  ModelSystemStatus,
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
import { requestModelStatus, requestPrediction } from '../data/predictionApi'
import {
  balancedConditionCategories,
  hasReusableSimulatedInputs,
  machineTypeCode,
  simulateMachineInputs,
} from '../utils/simulatedInputs'
import {
  maintenanceStatusFromPrediction,
  recommendationForStatus,
  statusForPrediction,
} from '../utils/predictionThresholds'
import type { PredictionInputs, PredictionResponse } from '../types'
import { useAuth } from './AuthContext'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { notifyFaultTransitions } from '../utils/faultWebhook'
import { playCriticalAlarm, playWarningBeep, playSuccessChime } from '../utils/audioAlerts'

const STORAGE_KEY = 'iap-state-v4'

interface PersistedState {
  machines: Machine[]
  maintenance: MaintenanceRecord[]
  alerts: Alert[]
  inspections: Inspection[]
  documents: KnowledgeDoc[]
  thresholds: Thresholds
}

const UNAVAILABLE_MODEL_STATUS: ModelSystemStatus = {
  status: 'not_ready',
  models_loaded: false,
  failure_model: 'unavailable',
  failure_type_model: 'unavailable',
  anomaly_model: 'unavailable',
  model_version: null,
  last_prediction_at: null,
}

interface AppContextValue extends PersistedState {
  lastUpdated: string
  modelSystemStatus: ModelSystemStatus
  toasts: ToastMsg[]
  isRealtimeConnected: boolean
  audioMuted: boolean
  setAudioMuted: (muted: boolean) => void
  notify: (type: ToastMsg['type'], title: string, message?: string) => void
  dismissToast: (id: string) => void
  addMachine: (m: Machine) => void
  updateMachine: (id: string, patch: Partial<Machine>) => void
  deleteMachine: (id: string) => void
  addMaintenance: (r: MaintenanceRecord) => void
  createMaintenanceFromAlert: (alertId: string) => MaintenanceRecord | null
  updateMaintenance: (id: string, patch: Partial<MaintenanceRecord>) => void
  transitionMaintenance: (
    id: string,
    status: MaintenanceRecord['status'],
    completion?: Pick<
      MaintenanceRecord,
      | 'actualDowntimeHours'
      | 'actualCost'
      | 'failureCause'
      | 'technician'
      | 'completionNotes'
      | 'attachments'
    >
  ) => boolean
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
  regenerateDemoReadings: () => void
  predictMachine: (id: string, inputs: PredictionInputs) => Promise<boolean>
}

const AppContext = createContext<AppContextValue | null>(null)

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedState
      if (Array.isArray(parsed.machines) && parsed.machines.length) {
        const storedMachineIds = new Set(parsed.machines.map((machine) => machine.id))
        const legacyMachineIds = Array.from(
          { length: 6 },
          (_, index) => `M-${String(index + 1).padStart(3, '0')}`
        )
        const isLegacySixMachineFleet =
          parsed.machines.length === legacyMachineIds.length &&
          parsed.machines.every((machine) => machine.custom !== true) &&
          legacyMachineIds.every((id) => storedMachineIds.has(id))
        const missingSeedMachines = isLegacySixMachineFleet
          ? SEED_MACHINES.filter((machine) => !storedMachineIds.has(machine.id))
          : []
        const machinesToLoad = [...parsed.machines, ...missingSeedMachines]
        const storedMaintenance = parsed.maintenance ?? SEED_MAINTENANCE
        const restoredMachineIds = new Set(
          missingSeedMachines.map((machine) => machine.id)
        )
        const maintenanceToLoad = [
          ...storedMaintenance,
          ...SEED_MAINTENANCE.filter(
            (record) =>
              restoredMachineIds.has(record.machineId) &&
              !storedMaintenance.some((storedRecord) => storedRecord.id === record.id)
          ),
        ]
        const machinesNeedingDemoInputs = machinesToLoad.filter((machine) => {
          const modelTypeCode = machineTypeCode(machine.type)
          const hasProvidedInputs =
            machine.predictionInputs?.machine_input_source === 'provided' ||
            machine.predictionInputs?.sensor_input_source === 'provided'
          return (
            !hasProvidedInputs &&
            !hasReusableSimulatedInputs(
              machine.predictionInputs,
              machine.id,
              modelTypeCode
            )
          )
        })
        const demoConditions = balancedConditionCategories(
          machinesNeedingDemoInputs.length
        )
        let demoConditionIndex = 0
        return {
          machines: machinesToLoad.map((machine) => {
            const modelTypeCode = machineTypeCode(machine.type)
            const hasProvidedInputs =
              machine.predictionInputs?.machine_input_source === 'provided' ||
              machine.predictionInputs?.sensor_input_source === 'provided'
            const hasStoredDemoInputs = hasReusableSimulatedInputs(
              machine.predictionInputs,
              machine.id,
              modelTypeCode
            )
            const predictionInputs = hasProvidedInputs
              ? machine.predictionInputs
              : hasStoredDemoInputs
                ? machine.predictionInputs
                : simulateMachineInputs(
                    machine.id,
                    machine.type,
                    demoConditions[demoConditionIndex++]
                  )
            return {
              ...machine,
              modelTypeCode,
              prediction: undefined,
              predictionInputs,
              predictionStatus: 'loading' as const,
              predictionError: undefined,
              status: null,
              healthScore: null,
              failureRisk: null,
              recommendation: null,
              likelihood: null,
              history: (machine.history ?? []).map((point) => ({
                ...point,
                isDemo: point.isDemo ?? true,
              })),
              events: (machine.events ?? []).map((event) => ({
                ...event,
                isDemo: event.isDemo ?? true,
              })),
            }
          }),
          maintenance: maintenanceToLoad.map((record) => {
            const isDemo = record.isDemo ?? /^MT-\d{2}$/.test(record.id)
            const seedKind = isDemo
              ? SEED_MAINTENANCE.find((seed) => seed.id === record.id)?.maintenanceKind
              : undefined
            return {
              ...record,
              isDemo,
              maintenanceKind: record.maintenanceKind ?? seedKind,
            }
          }),
          alerts: (parsed.alerts ?? SEED_ALERTS)
            .filter((alert) => !/^AL-\d+$/.test(alert.id))
            .map((alert) => ({ ...alert, isDemo: alert.isDemo ?? true })),
          inspections: (parsed.inspections ?? SEED_INSPECTIONS).map((inspection) => ({
            ...inspection,
            isDemo: inspection.isDemo ?? true,
          })),
          documents: (parsed.documents ?? SEED_DOCUMENTS).map((document) => ({
            ...document,
            status:
              document.status === 'Processed' && !document.indexedDocumentId
                ? 'Metadata Only'
                : document.status,
            pages: document.pages ?? null,
            isDemo: document.isDemo ?? true,
          })),
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
  if (prediction.anomaly_flag !== true && prediction.status === 'Operational') return null
  const type =
    prediction.anomaly_flag === true ? 'ML Anomaly Detected' : 'ML Failure Risk'
  const failureType = prediction.failure_type ?? 'No failure type classified by the model'
  const maintenanceNote =
    machine.maintenanceStatus === 'Overdue'
      ? ' Maintenance is overdue; the model recommendation does not update the maintenance schedule.'
      : ''
  return {
    id: `ML-${machine.id}-${prediction.timestamp.replace(/[^0-9]/g, '')}`,
    machineId: machine.id,
    machineName: machine.name,
    severity: prediction.status === 'Critical' ? 'critical' : 'warning',
    type,
    message:
      prediction.anomaly_flag === true && prediction.anomaly_score !== null
        ? `Model anomaly score ${(prediction.anomaly_score * 100).toFixed(1)}%. Failure type: ${failureType}.${maintenanceNote}`
        : `Model estimates ${(prediction.failure_probability * 100).toFixed(1)}% failure probability. Failure type: ${failureType}.${maintenanceNote}`,
    timestamp: prediction.timestamp,
    status: 'active',
    recommendedAction: prediction.recommendation,
    isDemo:
      prediction.machine_input_source === 'simulated' ||
      prediction.sensor_input_source === 'simulated',
  }
}

function addPredictionAlert(
  alerts: Alert[],
  machine: Machine,
  prediction: PredictionResponse
): Alert[] {
  const alert = predictionAlert(machine, prediction)
  const previousAlert = alert
    ? alerts.find((existing) => existing.id === alert.id)
    : undefined
  const updatedAlerts = alerts.map((existing) =>
    existing.machineId === machine.id &&
    existing.isDemo &&
    existing.id.startsWith('ML-') &&
    existing.status !== 'resolved'
      ? { ...existing, status: 'resolved' as const }
      : existing
  )
  if (!alert) return updatedAlerts
  return [
    {
      ...alert,
      status:
        previousAlert && previousAlert.status !== 'resolved'
          ? previousAlert.status
          : alert.status,
    },
    ...updatedAlerts.filter((existing) => existing.id !== alert.id),
  ]
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { checkPermission, checkMachineAccess, checkOrderModify, logAudit } = useAuth()
  const [state, setState] = useState<PersistedState>(loadState)
  const [lastUpdated, setLastUpdated] = useState(() => new Date().toISOString())
  const [modelSystemStatus, setModelSystemStatus] = useState(UNAVAILABLE_MODEL_STATUS)
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false)
  const [audioMuted, setAudioMutedState] = useState(() => {
    try {
      return localStorage.getItem('iap-audio-muted') === 'true'
    } catch {
      return false
    }
  })
  const audioMutedRef = useRef(audioMuted)
  const setAudioMuted = useCallback((muted: boolean) => {
    setAudioMutedState(muted)
    audioMutedRef.current = muted
    try {
      localStorage.setItem('iap-audio-muted', String(muted))
    } catch {
      // ignore
    }
  }, [])
  const startupRequestsStarted = useRef(false)
  const predictionRequestTokens = useRef(new Map<string, symbol>())

  const refreshModelSystemStatus = useCallback(async () => {
    try {
      setModelSystemStatus(await requestModelStatus())
    } catch (error) {
      console.error('Could not retrieve ML model status:', error)
      setModelSystemStatus(UNAVAILABLE_MODEL_STATUS)
    }
  }, [])

  useEffect(() => {
    void refreshModelSystemStatus()
  }, [refreshModelSystemStatus])

  const predictMachine = useCallback(
    async (id: string, inputs: PredictionInputs) => {
      const requestToken = Symbol(id)
      predictionRequestTokens.current.set(id, requestToken)
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
            : machine
        ),
      }))

      try {
        const prediction: PredictionResponse = await requestPrediction(
          inputs,
          state.thresholds
        )
        if (prediction.machine_id !== id)
          throw new Error('Prediction response machine ID did not match')
        if (prediction.inputs.type !== inputs.type) {
          throw new Error('Prediction response model type did not match')
        }
        if (
          prediction.machine_input_source !== inputs.machine_input_source ||
          prediction.sensor_input_source !== inputs.sensor_input_source
        ) {
          throw new Error('Prediction response input sources did not match')
        }
        void refreshModelSystemStatus()
        setState((s) => {
          if (predictionRequestTokens.current.get(id) !== requestToken) return s
          const machine = s.machines.find((item) => item.id === id)
          if (!machine || machine.predictionInputs?.type !== inputs.type) return s
          const status = statusForPrediction(prediction, s.thresholds)
          const effectivePrediction: PredictionResponse = {
            ...prediction,
            status,
            recommendation: recommendationForStatus(status),
          }
          const history = [
            ...machine.history,
            {
              date: prediction.timestamp,
              health: prediction.health_score,
              risk: prediction.failure_probability * 100,
              ...(prediction.anomaly_score !== null
                ? { anomalyScore: prediction.anomaly_score * 100 }
                : {}),
              ...(prediction.anomaly_flag !== null
                ? { anomalyFlag: prediction.anomaly_flag }
                : {}),
              isDemo:
                prediction.machine_input_source === 'simulated' ||
                prediction.sensor_input_source === 'simulated',
            },
          ].sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
          const updatedMachine: Machine = {
            ...machine,
            predictionStatus: 'available',
            predictionError: undefined,
            prediction: effectivePrediction,
            predictionInputs: inputs,
            status: effectivePrediction.status,
            maintenanceStatus: maintenanceStatusFromPrediction(
              effectivePrediction.status
            ),
            healthScore: effectivePrediction.health_score,
            failureRisk: effectivePrediction.failure_probability * 100,
            recommendation: effectivePrediction.recommendation,
            likelihood: effectivePrediction.failure_type,
            history,
          }
          const alerts = addPredictionAlert(s.alerts, machine, effectivePrediction)
          return {
            ...s,
            machines: s.machines.map((item) => (item.id === id ? updatedMachine : item)),
            alerts,
          }
        })
        return predictionRequestTokens.current.get(id) === requestToken
      } catch (error) {
        const predictionError =
          error instanceof Error
            ? error.message
            : 'Prediction request failed unexpectedly'
        setState((s) => {
          if (predictionRequestTokens.current.get(id) !== requestToken) return s
          return {
            ...s,
            machines: s.machines.map((machine) =>
              machine.id === id
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
                : machine
            ),
          }
        })
        return false
      }
    },
    [refreshModelSystemStatus, state.thresholds]
  )

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

  // Sync with Supabase Database if configured
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return
    const client = supabase

    const syncFromSupabase = async () => {
      try {
        const { data: dbMachines } = await client.from('machines').select('*')
        if (dbMachines && dbMachines.length > 0) {
          setState((prev) => {
            const existingMap = new Map(prev.machines.map((m) => [m.id, m]))
            const mergedMachines: Machine[] = (dbMachines as any[]).map((dbM: any) => {
              const existing = existingMap.get(dbM.id)
              return {
                id: dbM.id,
                name: dbM.name,
                type: dbM.type,
                status: (dbM.status as any) || existing?.status || 'Operational',
                healthScore: dbM.health_score !== null ? Number(dbM.health_score) : (existing?.healthScore ?? 95),
                failureRisk: dbM.failure_risk !== null ? Number(dbM.failure_risk) : (existing?.failureRisk ?? 5),
                location: dbM.location || existing?.location || 'Plant Floor',
                manufacturer: dbM.manufacturer || existing?.manufacturer || 'Siemens Industrial',
                model: dbM.model || existing?.model || 'Series Standard',
                installationDate: existing?.installationDate || '2023-01-15',
                lastMaintenance: dbM.last_maintenance || existing?.lastMaintenance || new Date().toISOString(),
                nextMaintenance: dbM.next_maintenance || existing?.nextMaintenance || new Date().toISOString(),
                description: existing?.description || `${dbM.name} operational fleet unit`,
                recommendation: existing?.recommendation || 'Regular inspection schedule',
                likelihood: existing?.likelihood || 'Low',
                sensors: (Array.isArray(dbM.sensors) ? dbM.sensors : existing?.sensors) || [],
                history: existing?.history || [],
                sensorHistory: existing?.sensorHistory || [],
                events: existing?.events || [],
                modelTypeCode: existing?.modelTypeCode || 'M',
                predictionInputs: existing?.predictionInputs || ({} as any),
                predictionStatus: existing?.predictionStatus || 'available',
                maintenanceStatus: existing?.maintenanceStatus || 'Scheduled',
              } as Machine
            })
            return { ...prev, machines: mergedMachines }
          })
        }
      } catch (err) {
        console.warn('Supabase fleet sync notice:', err)
      }
    }

    void syncFromSupabase()
  }, [])

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // storage unavailable — ignore
    }
  }, [state])

  // Report machines that enter a fault state to the optional n8n webhook
  useEffect(() => {
    notifyFaultTransitions(state.machines)
  }, [state.machines])

  const dismissToast = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const notify = useCallback(
    (type: ToastMsg['type'], title: string, message?: string) => {
      const id = `toast-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      setToasts((t) => [...t.slice(-3), { id, type, title, message }])
      window.setTimeout(() => dismissToast(id), 4200)
    },
    [dismissToast]
  )

  const refreshTimestamp = useCallback(() => setLastUpdated(new Date().toISOString()), [])

  // Supabase Realtime Telemetry Subscription with Web Audio alerts
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setIsRealtimeConnected(true)
      return
    }
    const client = supabase

    const channel = client
      .channel('factory-realtime-telemetry')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'machines' },
        (payload: any) => {
          const newMachine = payload.new
          if (!newMachine?.id) return
          setState((prev) => ({
            ...prev,
            machines: prev.machines.map((m) =>
              m.id === newMachine.id
                ? {
                    ...m,
                    name: newMachine.name || m.name,
                    status: (newMachine.status as any) || m.status,
                    healthScore:
                      newMachine.health_score !== null
                        ? Number(newMachine.health_score)
                        : m.healthScore,
                    failureRisk:
                      newMachine.failure_risk !== null
                        ? Number(newMachine.failure_risk)
                        : m.failureRisk,
                    sensors: Array.isArray(newMachine.sensors)
                      ? newMachine.sensors
                      : m.sensors,
                  }
                : m
            ),
          }))

          if (newMachine.status === 'Critical') {
            if (!audioMutedRef.current) playCriticalAlarm()
            notify(
              'error',
              '🚨 Realtime Machine Alert',
              `${newMachine.name || newMachine.id} entered Critical condition!`
            )
          } else if (newMachine.status === 'Warning') {
            if (!audioMutedRef.current) playWarningBeep()
            notify(
              'warning',
              '⚠️ Machine Health Degraded',
              `${newMachine.name || newMachine.id} is now in Warning condition.`
            )
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'alerts' },
        (payload: any) => {
          const newAlert = payload.new
          if (!newAlert?.id) return
          if (payload.eventType === 'INSERT') {
            setState((prev) => {
              if (prev.alerts.some((a) => a.id === newAlert.id)) return prev
              const mapped: Alert = {
                id: newAlert.id,
                machineId: newAlert.machine_id,
                machineName: newAlert.machine_id,
                severity: newAlert.severity || 'warning',
                type: newAlert.type || 'Telemetry Fault',
                message: newAlert.message || 'Realtime alert triggered',
                timestamp: newAlert.timestamp || new Date().toISOString(),
                status: newAlert.status || 'active',
                recommendedAction:
                  newAlert.recommended_action || 'Inspect machine immediately',
                isDemo: false,
              }
              return {
                ...prev,
                alerts: [mapped, ...prev.alerts],
              }
            })
            if (newAlert.severity === 'critical') {
              if (!audioMutedRef.current) playCriticalAlarm()
              notify(
                'error',
                'CRITICAL Realtime Alert',
                newAlert.message || `Critical issue detected on ${newAlert.machine_id}`
              )
            } else {
              if (!audioMutedRef.current) playWarningBeep()
              notify(
                'warning',
                'Realtime Alert',
                newAlert.message || `Warning alert on ${newAlert.machine_id}`
              )
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'maintenance_orders' },
        (payload: any) => {
          const newOrder = payload.new
          if (!newOrder?.id) return
          if (payload.eventType === 'INSERT') {
            setState((prev) => {
              if (prev.maintenance.some((m) => m.id === newOrder.id)) return prev
              const mapped: MaintenanceRecord = {
                id: newOrder.id,
                machineId: newOrder.machine_id,
                machineName: newOrder.machine_id,
                machineType: 'Industrial Unit',
                type: newOrder.type || 'Preventive',
                reason: newOrder.reason || 'Work order generated',
                priority: newOrder.priority || 'Medium',
                date: newOrder.date || new Date().toISOString(),
                technician: newOrder.technician || 'Ahmed H.',
                status: newOrder.status || 'Scheduled',
                downtime: newOrder.actual_downtime_hours
                  ? `${newOrder.actual_downtime_hours}h`
                  : '—',
                cost: newOrder.actual_cost ? Number(newOrder.actual_cost) : null,
                notes: newOrder.notes || '',
                isDemo: false,
              }
              return {
                ...prev,
                maintenance: [mapped, ...prev.maintenance],
              }
            })
            if (!audioMutedRef.current) playSuccessChime()
            notify(
              'info',
              'New Work Order Dispatched',
              `Order ${newOrder.id} received in realtime.`
            )
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsRealtimeConnected(true)
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setIsRealtimeConnected(false)
        }
      })

    return () => {
      void client.removeChannel(channel)
    }
  }, [notify])

  const addMachine = useCallback(
    (m: Machine) => {
      if (!checkPermission('machines.create')) {
        notify('error', 'Access Denied', 'You do not have permission to create machines.')
        logAudit('machines.create', 'machine', m.id, 'denied', { name: m.name })
        return
      }
      setState((s) => ({
        ...s,
        machines: [...s.machines, m],
        alerts: m.prediction ? addPredictionAlert(s.alerts, m, m.prediction) : s.alerts,
      }))
      logAudit('machines.create', 'machine', m.id, 'allowed', { name: m.name })

      if (isSupabaseConfigured && supabase) {
        void (supabase as any).from('machines').insert({
          id: m.id,
          name: m.name,
          type: m.type,
          location: m.location,
          manufacturer: m.manufacturer,
          model: m.model,
          health_score: m.healthScore,
          failure_risk: m.failureRisk,
          sensors: m.sensors as any,
        })
      }
    },
    [checkPermission, logAudit, notify]
  )

  const updateMachine = useCallback(
    (id: string, patch: Partial<Machine>) => {
      if (!checkPermission('machines.update')) {
        notify('error', 'Access Denied', 'You do not have permission to update machine configurations.')
        logAudit('machines.update', 'machine', id, 'denied', { patch })
        return
      }
      if (!checkMachineAccess(id)) {
        notify('error', 'Access Denied', 'Machine is outside your operational scope.')
        logAudit('machines.update', 'machine', id, 'denied', { reason: 'outside_scope' })
        return
      }
      setState((s) => ({
        ...s,
        machines: s.machines.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      }))
      logAudit('machines.update', 'machine', id, 'allowed', { patchKeys: Object.keys(patch) })
    },
    [checkPermission, checkMachineAccess, logAudit, notify]
  )

  const deleteMachine = useCallback(
    (id: string) => {
      if (!checkPermission('machines.delete')) {
        notify('error', 'Access Denied', 'You do not have permission to delete machines.')
        logAudit('machines.delete', 'machine', id, 'denied')
        return
      }
      predictionRequestTokens.current.delete(id)
      setState((s) => ({
        ...s,
        machines: s.machines.filter((m) => m.id !== id),
        maintenance: s.maintenance.filter((r) => r.machineId !== id),
        alerts: s.alerts.filter((a) => a.machineId !== id),
      }))
      logAudit('machines.delete', 'machine', id, 'allowed')

      if (isSupabaseConfigured && supabase) {
        void supabase.from('machines').delete().eq('id', id)
      }
    },
    [checkPermission, logAudit, notify]
  )

  const addMaintenance = useCallback(
    (r: MaintenanceRecord) => {
      if (!checkPermission('maintenance.create')) {
        notify('error', 'Access Denied', 'You do not have permission to create maintenance orders.')
        logAudit('maintenance.create', 'maintenance', r.id, 'denied')
        return
      }
      setState((s) => ({
        ...s,
        maintenance: [{ ...r, isDemo: r.isDemo ?? false }, ...s.maintenance],
      }))
      logAudit('maintenance.create', 'maintenance', r.id, 'allowed', { machineId: r.machineId })

      if (isSupabaseConfigured && supabase) {
        void (supabase as any).from('maintenance_orders').insert({
          id: r.id,
          machine_id: r.machineId,
          title: r.type,
          description: r.reason,
          priority: r.priority,
          status: r.status,
          technician_name: r.technician,
          downtime: r.downtime,
          cost: r.cost,
          notes: r.notes,
        })
      }
    },
    [checkPermission, logAudit, notify]
  )

  const createMaintenanceFromAlert = useCallback(
    (alertId: string) => {
      const alert = state.alerts.find((item) => item.id === alertId)
      if (!alert) return null
      const existing = state.maintenance.find(
        (record) => record.originAlertId === alertId
      )
      if (existing) return existing
      const machine = state.machines.find((item) => item.id === alert.machineId)
      if (!machine) return null
      const priority: MaintenanceRecord['priority'] =
        alert.severity === 'critical'
          ? 'High'
          : alert.severity === 'warning'
            ? 'Medium'
            : 'Low'
      const record: MaintenanceRecord = {
        id: `MO-${alert.id}`,
        machineId: machine.id,
        machineName: machine.name,
        machineType: machine.type,
        type: /anomaly/i.test(alert.type) ? 'Inspection' : 'Predictive inspection',
        reason: alert.message,
        priority,
        date: new Date().toISOString(),
        technician: 'Unassigned',
        status: 'Scheduled',
        downtime: '—',
        cost: null,
        notes: alert.recommendedAction,
        maintenanceKind: 'preventive',
        isDemo: alert.isDemo ?? true,
        originAlertId: alert.id,
        predictionSnapshot: machine.prediction
          ? {
              failureProbability: machine.prediction.failure_probability,
              anomalyScore: machine.prediction.anomaly_score,
              healthScore: machine.prediction.health_score,
              status: machine.prediction.status,
              timestamp: machine.prediction.timestamp,
            }
          : undefined,
      }
      setState((s) => ({
        ...s,
        maintenance: s.maintenance.some((item) => item.originAlertId === alertId)
          ? s.maintenance
          : [record, ...s.maintenance],
      }))
      return record
    },
    [state.alerts, state.maintenance, state.machines]
  )

  const updateMaintenance = useCallback(
    (id: string, patch: Partial<MaintenanceRecord>) => {
      setState((s) => ({
        ...s,
        maintenance: s.maintenance.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      }))
    },
    []
  )

  const transitionMaintenance = useCallback(
    (
      id: string,
      status: MaintenanceRecord['status'],
      completion?: Pick<
        MaintenanceRecord,
        | 'actualDowntimeHours'
        | 'actualCost'
        | 'failureCause'
        | 'technician'
        | 'completionNotes'
        | 'attachments'
      >
    ) => {
      const record = state.maintenance.find((item) => item.id === id)
      if (!record) return false

      const requiredPerm = status === 'Completed' ? 'maintenance.complete' : 'maintenance.update'
      if (!checkPermission(requiredPerm)) {
        notify('error', 'Access Denied', `You do not have permission to transition this order to ${status}.`)
        logAudit(requiredPerm, 'maintenance', id, 'denied', { targetStatus: status })
        return false
      }

      if (!checkOrderModify(record)) {
        notify('error', 'Access Denied', 'You can only update maintenance orders assigned to you.')
        logAudit(requiredPerm, 'maintenance', id, 'denied', { reason: 'not_assigned_to_user', targetStatus: status })
        return false
      }

      const allowed: Record<MaintenanceRecord['status'], MaintenanceRecord['status'][]> =
        {
          Recommended: ['Scheduled', 'Cancelled'],
          Scheduled: ['In Progress', 'Cancelled'],
          'In Progress': ['Completed', 'Cancelled'],
          Completed: [],
          Cancelled: [],
        }
      if (!allowed[record.status].includes(status)) return false
      setState((s) => ({
        ...s,
        maintenance: s.maintenance.map((item) =>
          item.id === id
            ? {
                ...item,
                status,
                attachments: completion?.attachments
                  ? [...(item.attachments ?? []), ...completion.attachments]
                  : item.attachments,
                ...(status === 'Completed' && completion
                  ? {
                      actualDowntimeHours: completion.actualDowntimeHours,
                      ...(completion.actualDowntimeHours !== null
                        ? { downtime: `${completion.actualDowntimeHours}h` }
                        : {}),
                      actualCost: completion.actualCost,
                      failureCause: completion.failureCause,
                      technician: completion.technician,
                      completionNotes: completion.completionNotes,
                      notes: completion.completionNotes,
                    }
                  : {}),
              }
            : item
        ),
      }))
      logAudit(requiredPerm, 'maintenance', id, 'allowed', { fromStatus: record.status, targetStatus: status })
      return true
    },
    [checkPermission, checkOrderModify, logAudit, notify, state.maintenance]
  )

  const deleteMaintenance = useCallback(
    (id: string) => {
      if (!checkPermission('maintenance.update')) {
        notify('error', 'Access Denied', 'You do not have permission to delete maintenance records.')
        return
      }
      setState((s) => ({ ...s, maintenance: s.maintenance.filter((r) => r.id !== id) }))
    },
    [checkPermission, notify]
  )

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
    setState((s) => ({
      ...s,
      documents: s.documents.some(
        (document) =>
          document.id === d.id ||
          (!!d.indexedDocumentId && document.indexedDocumentId === d.indexedDocumentId)
      )
        ? s.documents
        : [{ ...d, isDemo: d.isDemo ?? false }, ...s.documents],
    }))
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

  const saveThresholds = useCallback(
    (t: Thresholds) => {
      if (!checkPermission('models.manage')) {
        notify('error', 'Access Denied', 'You do not have permission to modify model thresholds.')
        logAudit('models.manage', 'settings', 'thresholds', 'denied')
        return
      }
      logAudit('models.manage', 'settings', 'thresholds', 'allowed')
      setState((s) => {
      const machines = s.machines.map((machine) => {
        if (!machine.prediction) return machine
        const status = statusForPrediction(machine.prediction, t)
        const recommendation = recommendationForStatus(status)
        return {
          ...machine,
          status,
          maintenanceStatus: maintenanceStatusFromPrediction(status),
          recommendation,
          prediction: { ...machine.prediction, status, recommendation },
        }
      })
      const machineById = new Map(machines.map((machine) => [machine.id, machine]))
      let alerts = s.alerts
        .filter((alert) => {
          if (!alert.id.startsWith('ML-') || alert.status === 'resolved') return true
          const machine = machineById.get(alert.machineId)
          return (
            !machine?.prediction ||
            machine.prediction.anomaly_flag === true ||
            machine.prediction.status !== 'Operational'
          )
        })
        .map((alert) => {
          const machine = machineById.get(alert.machineId)
          if (!alert.id.startsWith('ML-') || !machine?.prediction) return alert
          return {
            ...alert,
            severity:
              machine.prediction.status === 'Critical'
                ? ('critical' as const)
                : ('warning' as const),
            recommendedAction: machine.prediction.recommendation,
          }
        })
      machines.forEach((machine) => {
        if (machine.prediction) {
          alerts = addPredictionAlert(alerts, machine, machine.prediction)
        }
      })
      return { ...s, machines, alerts, thresholds: t }
    })
  }, [checkPermission, logAudit, notify])

  const resetDemo = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    predictionRequestTokens.current.clear()
    const machines = SEED_MACHINES.map((machine) => ({
      ...machine,
      prediction: undefined,
      predictionStatus: 'loading' as const,
      status: null,
      healthScore: null,
      failureRisk: null,
      recommendation: null,
      likelihood: null,
    }))
    setState({
      machines,
      maintenance: SEED_MAINTENANCE,
      alerts: SEED_ALERTS,
      inspections: SEED_INSPECTIONS,
      documents: SEED_DOCUMENTS,
      thresholds: DEFAULT_THRESHOLDS,
    })
    setLastUpdated(new Date().toISOString())
    machines.forEach((machine) => {
      if (machine.predictionInputs) {
        void predictMachine(machine.id, machine.predictionInputs)
      }
    })
  }, [predictMachine])

  const regenerateDemoReadings = useCallback(async () => {
    const simulatedMachines = state.machines
      .filter(
        (machine) =>
          machine.predictionInputs?.machine_input_source === 'simulated' &&
          machine.predictionInputs.sensor_input_source === 'simulated'
      )
      .sort((left, right) => left.id.localeCompare(right.id))
    if (!simulatedMachines.length) {
      notify(
        'warning',
        'No demo machines found',
        'Only simulated machines can generate a new demo scenario.'
      )
      return
    }
    const demoConditions = balancedConditionCategories(simulatedMachines.length)
    const demoInputs = new Map(
      simulatedMachines.map((machine, index) => [
        machine.id,
        simulateMachineInputs(machine.id, machine.type, demoConditions[index]),
      ])
    )

    setState((s) => ({
      ...s,
      machines: s.machines.map((machine) => {
        const inputs = demoInputs.get(machine.id)
        return inputs
          ? {
              ...machine,
              modelTypeCode: inputs.type,
              predictionInputs: inputs,
              prediction: undefined,
              predictionStatus: 'loading',
              predictionError: undefined,
              status: null,
              maintenanceStatus: 'Prediction pending',
              healthScore: null,
              failureRisk: null,
              recommendation: null,
              likelihood: null,
            }
          : machine
      }),
    }))
    setLastUpdated(new Date().toISOString())
    const results = await Promise.all(
      [...demoInputs.entries()].map(([machineId, inputs]) =>
        predictMachine(machineId, inputs)
      )
    )
    const failedCount = results.filter((succeeded) => !succeeded).length
    if (failedCount) {
      notify(
        'warning',
        'Demo scenario partially evaluated',
        `${failedCount} of ${demoInputs.size} model predictions failed. Failed machines show unavailable results.`
      )
      return
    }
    notify(
      'success',
      'New demo predictions ready',
      `${demoInputs.size} simulated machines were recalculated by the trained models.`
    )
  }, [notify, predictMachine, state.machines])

  const value = useMemo<AppContextValue>(
    () => ({
      ...state,
      lastUpdated,
      modelSystemStatus,
      toasts,
      isRealtimeConnected,
      audioMuted,
      setAudioMuted,
      notify,
      dismissToast,
      addMachine,
      updateMachine,
      deleteMachine,
      addMaintenance,
      createMaintenanceFromAlert,
      updateMaintenance,
      transitionMaintenance,
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
      regenerateDemoReadings,
      predictMachine,
    }),
    [
      state,
      lastUpdated,
      modelSystemStatus,
      toasts,
      isRealtimeConnected,
      audioMuted,
      setAudioMuted,
      notify,
      dismissToast,
      addMachine,
      updateMachine,
      deleteMachine,
      addMaintenance,
      createMaintenanceFromAlert,
      updateMaintenance,
      transitionMaintenance,
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
      regenerateDemoReadings,
      predictMachine,
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- hooks must ship with their provider in the same module
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
