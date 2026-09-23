// ---------------------------------------------------------------------------
// Domain types for Industrial AI Platform
// ---------------------------------------------------------------------------

export type MachineStatus = 'Operational' | 'Warning' | 'Critical' | 'Under Maintenance'
export type Severity = 'critical' | 'warning' | 'info' | 'success'
export type SensorLevel = 'green' | 'amber' | 'red'
export type MaintenanceStatus = 'Recommended' | 'Scheduled' | 'In Progress' | 'Completed'
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
}

export interface Machine {
  id: string
  name: string
  type: string
  status: MachineStatus
  healthScore: number
  failureRisk: number
  maintenanceStatus: string
  recommendation: string
  likelihood: string
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
  cost: number
  notes: string
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
}

export interface Inspection {
  id: string
  productId: string
  timestamp: string
  result: 'PASS' | 'FAIL'
  defectType: string
  confidence: number
  location: string
  image: string // gradient key or object/data URL
  box?: { top: number; left: number; w: number; h: number }
}

export type DocStatus = 'Processed' | 'Processing' | 'Failed'

export interface KnowledgeDoc {
  id: string
  name: string
  type: string
  size: string
  uploadDate: string
  status: DocStatus
  pages: number
  source: string
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
  messages: ChatMessage[]
}

export interface Thresholds {
  healthWarning: number
  healthCritical: number
  riskWarning: number
  riskCritical: number
}

export interface ToastMsg {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  message?: string
}