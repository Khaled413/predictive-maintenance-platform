import type { DecisionThresholds, MachineStatus, PredictionResponse, Thresholds } from '../types'

export function toDecisionThresholds(thresholds: Thresholds): DecisionThresholds {
  return {
    health_warning: thresholds.healthWarning,
    health_critical: thresholds.healthCritical,
    risk_warning: thresholds.riskWarning,
    risk_critical: thresholds.riskCritical,
  }
}

export function statusForPrediction(
  prediction: Pick<PredictionResponse, 'health_score' | 'failure_probability'>,
  thresholds: Thresholds,
): Exclude<MachineStatus, 'Under Maintenance'> {
  const failureRisk = prediction.failure_probability * 100
  if (prediction.health_score <= thresholds.healthCritical || failureRisk >= thresholds.riskCritical) {
    return 'Critical'
  }
  if (prediction.health_score <= thresholds.healthWarning || failureRisk >= thresholds.riskWarning) {
    return 'Warning'
  }
  return 'Operational'
}

export function recommendationForStatus(status: Exclude<MachineStatus, 'Under Maintenance'>) {
  if (status === 'Critical') return 'Stop or reduce operation and inspect the machine immediately.'
  if (status === 'Warning') return 'Inspect the machine soon and schedule preventive maintenance.'
  return 'Continue normal operation and routine maintenance.'
}

/**
 * Four demo condition labels derived from the model's health score and the
 * same thresholds that decide the machine status, so the label can never
 * contradict the displayed status/recommendation:
 *   كويس      Operational (above the midpoint to 100)
 *   متوسط     Operational (above the warning threshold)
 *   مقبول     Warning     (between critical and warning thresholds)
 *   وحش       Critical    (at or below the critical threshold)
 */
export function healthBandLabel(
  score: number,
  thresholds: Pick<Thresholds, 'healthWarning' | 'healthCritical'> = {
    healthWarning: 70,
    healthCritical: 40,
  },
) {
  const goodFloor = thresholds.healthWarning + (100 - thresholds.healthWarning) / 2
  if (score > goodFloor) return 'Good condition'
  if (score > thresholds.healthWarning) return 'Medium condition'
  if (score > thresholds.healthCritical) return 'Acceptable condition'
  return 'Poor condition'
}

export function maintenanceStatusFromPrediction(
  status: Exclude<MachineStatus, 'Under Maintenance'>,
  nextMaintenance: string,
  now = Date.now(),
) {
  const dueAt = Date.parse(nextMaintenance)
  if (Number.isFinite(dueAt) && dueAt < now) return 'Overdue'
  if (status === 'Critical') return 'Immediate'
  if (status === 'Warning') return 'Due Soon'
  return 'On Schedule'
}
