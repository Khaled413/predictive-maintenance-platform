import type { Machine, MaintenanceRecord } from '../types'

export const DATA_FRESHNESS_STALE_AFTER_MS = 5 * 60 * 1000
export const DASHBOARD_TREND_DAYS = 7
export const TREND_CHANGE_THRESHOLD = 2

export function hasProvidedPrediction(machine: Machine) {
  return (
    machine.predictionStatus === 'available' &&
    machine.healthScore !== null &&
    machine.prediction?.machine_input_source === 'provided' &&
    machine.prediction.sensor_input_source === 'provided' &&
    dataFreshness(machine.prediction.latest_reading_at) === 'fresh'
  )
}

export function dataFreshness(timestamp: string | null | undefined, now = Date.now()) {
  const time = timestamp ? Date.parse(timestamp) : Number.NaN
  if (!Number.isFinite(time) || time > now) return 'unavailable' as const
  return now - time <= DATA_FRESHNESS_STALE_AFTER_MS
    ? ('fresh' as const)
    : ('stale' as const)
}

export function durationHours(value: string): number | null {
  const matches = [
    ...value
      .toLowerCase()
      .matchAll(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?|h|m)\b/g),
  ]
  if (!matches.length) return null
  const remainder = value
    .toLowerCase()
    .replace(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?|h|m)\b/g, '')
    .trim()
  if (remainder) return null
  const total = matches.reduce((sum, match) => {
    const amount = Number(match[1])
    const unit = match[2]
    return sum + (unit.startsWith('m') ? amount / 60 : amount)
  }, 0)
  return Number.isFinite(total) ? total : null
}

export function fleetHealth(machines: Machine[]) {
  const provided = machines.filter(hasProvidedPrediction)
  const available = provided.length
    ? provided
    : machines.filter(
        (machine) =>
          machine.predictionStatus === 'available' &&
          machine.healthScore !== null &&
          machine.failureRisk !== null &&
          machine.prediction?.machine_input_source === 'simulated' &&
          machine.prediction.sensor_input_source === 'simulated'
      )
  const counts = {
    healthy: available.filter((machine) => machine.status === 'Operational').length,
    warning: available.filter((machine) => machine.status === 'Warning').length,
    critical: available.filter((machine) => machine.status === 'Critical').length,
  }
  return {
    availableCount: available.length,
    totalCount: machines.length,
    averageHealth: available.length
      ? Math.round(
          available.reduce((sum, machine) => sum + (machine.healthScore ?? 0), 0) /
            available.length
        )
      : null,
    isDemo: provided.length === 0 && available.length > 0,
    ...counts,
  }
}

export interface OperationalKpis {
  mtbfHours: number | null
  mttrHours: number | null
  failureRate: number | null
  downtimeHours: number | null
  preventiveMaintenancePercent: number | null
}

export function operationalKpis(records: MaintenanceRecord[]): OperationalKpis {
  const operationalRecords = records.filter((record) => !record.isDemo)
  const completed = operationalRecords.filter(
    (record) =>
      record.status === 'Completed' &&
      record.actualDowntimeHours !== null &&
      record.actualDowntimeHours !== undefined &&
      Number.isFinite(record.actualDowntimeHours)
  )
  const classified = operationalRecords.filter(
    (record) =>
      record.maintenanceKind === 'preventive' || record.maintenanceKind === 'corrective'
  )
  const downtimeHours = completed.length
    ? completed.reduce((sum, record) => sum + (record.actualDowntimeHours ?? 0), 0)
    : null
  return {
    mtbfHours: null,
    mttrHours: downtimeHours !== null ? downtimeHours / completed.length : null,
    failureRate: null,
    downtimeHours,
    preventiveMaintenancePercent: classified.length
      ? (classified.filter((record) => record.maintenanceKind === 'preventive').length /
          classified.length) *
        100
      : null,
  }
}

export function healthTrendDirection(points: { health: number }[]) {
  if (points.length < 2) return 'unavailable' as const
  const change = points[points.length - 1].health - points[0].health
  if (change > TREND_CHANGE_THRESHOLD) return 'improving' as const
  if (change < -TREND_CHANGE_THRESHOLD) return 'deteriorating' as const
  return 'stable' as const
}
