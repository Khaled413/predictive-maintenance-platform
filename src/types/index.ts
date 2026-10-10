// ---------------------------------------------------------------------------
// Domain types for Industrial AI Platform
// ---------------------------------------------------------------------------

export type MachineStatus = 'Operational' | 'Warning' | 'Critical' | 'Under Maintenance'
export type PredictionStatus = 'loading' | 'available' | 'unavailable'
export type MachineTypeCode = 'H' | 'L' | 'M'
export type SimulationState = 'NORMAL' | 'DEGRADING' | 'CRITICAL'
export type Severity = 'critical' | 'warning' | 'info' | 'success'
export type SensorLevel = 'green' | 'amber' | 'red'
export type MaintenanceStatus =
  'Recommended' | 'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled'
export type MaintenancePriority = 'High' | 'Medium' | 'Low'

export interface SensorReading {
  name: string
  unit: string
  value: number
  min: number
  max: number
  level: SensorLevel
  trend: 'up' | 'down' | 'flat'
}

export interface HistoryPoint {
  date: string
  health: number
  risk: number
  anomalyScore?: number
  anomalyFlag?: boolean
  isDemo?: boolean
}

export interface PredictionInputs {
  machine_id: string
  type: MachineTypeCode
  air_temperature: number
  process_temperature: number
  rotational_speed: number
  torque: number
  tool_wear: number
  machine_input_source: 'simulated' | 'provided'
  sensor_input_source: 'simulated' | 'provided'
  simulation_state: SimulationState
  sensor_window?: {
    timestamp?: string
    [channel: string]: number | string | null | undefined
  }[]
}

export interface PredictionResponse {
  machine_id: string
  inputs: Omit<PredictionInputs, 'machine_id' | 'sensor_window'>
  machine_input_source: 'simulated' | 'provided'
  sensor_input_source: 'simulated' | 'provided'
  failure_probability: number
  failure_type: string | null
  anomaly_score: number | null
  anomaly_flag: boolean | null
  health_score: number
  status: Exclude<MachineStatus, 'Under Maintenance'>
  recommendation: string
  prediction_source: 'Trained ML Models'
  data_source: 'Simulated Sensor Data' | 'Provided Sensor Data'
  machine_inputs_simulated: boolean
  sensor_inputs_simulated: boolean
  anomaly_features_used: string[]
  anomaly_model_inputs: Record<string, number | null>
  anomaly_input_reading_count: number
  latest_reading_at: string
  timestamp: string
}

export interface ModelSystemStatus {
  status: 'ok' | 'not_ready'
  models_loaded: boolean
  failure_model: 'ready' | 'unavailable'
  failure_type_model: 'ready' | 'unavailable'
  anomaly_model: 'ready' | 'unavailable'
  model_version: string | null
  last_prediction_at: string | null
}

export interface SensorSeries {
  name: string
  unit: string
  data: { date: string; value: number }[]
}

export type EventType = 'Maintenance' | 'Inspection' | 'Sensor Anomaly' | 'Failure'

export interface EventMarker {
  date: string
  type: EventType
  note: string
  isDemo?: boolean
}

export interface Machine {
  id: string
  name: string
  type: string
  status: MachineStatus | null
  healthScore: number | null
  failureRisk: number | null
  maintenanceStatus: string
  recommendation: string | null
  likelihood: string | null
  location: string
  manufacturer: string
  model: string
  installationDate: string
  lastMaintenance: string
  nextMaintenance: string
  description: string
  sensors: SensorReading[]
  history: HistoryPoint[]
  sensorHistory: SensorSeries[]
  events: EventMarker[]
  custom?: boolean
  modelTypeCode: MachineTypeCode
  predictionStatus: PredictionStatus
  predictionError?: string
  prediction?: PredictionResponse
  predictionInputs: PredictionInputs
}

export interface MaintenanceRecord {
  id: string
  machineId: string
  machineName: string
  machineType: string
  type: string
  reason: string
  priority: MaintenancePriority
  date: string
  technician: string
  status: MaintenanceStatus
  downtime: string
  cost: number | null
  notes: string
  originAlertId?: string
  predictionSnapshot?: {
    failureProbability: number
    anomalyScore: number | null
    healthScore: number
    status: Exclude<MachineStatus, 'Under Maintenance'>
    timestamp: string
  }
  actualDowntimeHours?: number | null
  actualCost?: number | null
  failureCause?: string
  completionNotes?: string
  maintenanceKind?: 'preventive' | 'corrective'
  isDemo?: boolean
}

export interface Alert {
  id: string
  machineId: string
  machineName: string
  severity: Severity
  type: string
  message: string
  timestamp: string
  status: 'active' | 'acknowledged' | 'resolved'
  recommendedAction: string
  isDemo?: boolean
}

export interface Inspection {
  id: string
  productId: string
  timestamp: string
  result: 'PASS' | 'FAIL'
  defectType: string
  confidence?: number
  anomalyScore?: number
  predictionSource?: 'PatchCore'
  location: string
  image: string // gradient key or object/data URL
  box?: { top: number; left: number; w: number; h: number }
  isDemo?: boolean
}

export type DocStatus = 'Processed' | 'Processing' | 'Failed' | 'Metadata Only'

export interface KnowledgeDoc {
  id: string
  name: string
  type: string
  size: string
  uploadDate: string
  status: DocStatus
  pages: number | null
  source: string
  indexedDocumentId?: string
  chunkCount?: number
  isDemo?: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
  timestamp: string
}

export interface Conversation {
  id: string
  title: string
  updated: string
  context: 'factory' | 'machine' | 'knowledge' | 'document'
  contextLabel?: string
  machineId?: string
  documentId?: string
  messages: ChatMessage[]
}

export interface Thresholds {
  healthWarning: number
  healthCritical: number
  riskWarning: number
  riskCritical: number
}

export interface DecisionThresholds {
  health_warning: number
  health_critical: number
  risk_warning: number
  risk_critical: number
}

export interface ToastMsg {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  message?: string
}
