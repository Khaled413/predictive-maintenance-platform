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

