import type { PredictionInputs, PredictionResponse, Thresholds } from '../types'
import {
  recommendationForStatus,
  statusForPrediction,
  toDecisionThresholds,
} from '../utils/predictionThresholds'

function isPredictionResponse(value: unknown): value is PredictionResponse {
  if (!value || typeof value !== 'object') return false
  const result = value as Partial<PredictionResponse>
  const inputs = result.inputs
  const anomalyModelInputs = result.anomaly_model_inputs
  return (
    typeof result.machine_id === 'string' &&
    !!inputs &&
    (inputs.type === 'H' || inputs.type === 'L' || inputs.type === 'M') &&
    typeof inputs.air_temperature === 'number' &&
    typeof inputs.process_temperature === 'number' &&
    typeof inputs.rotational_speed === 'number' &&
    typeof inputs.torque === 'number' &&
    typeof inputs.tool_wear === 'number' &&
    ['simulated', 'provided'].includes(inputs.machine_input_source ?? '') &&
    ['simulated', 'provided'].includes(inputs.sensor_input_source ?? '') &&
    ['NORMAL', 'DEGRADING', 'CRITICAL'].includes(inputs.simulation_state) &&
    result.machine_input_source === inputs.machine_input_source &&
    result.sensor_input_source === inputs.sensor_input_source &&
    result.machine_inputs_simulated === (inputs.machine_input_source === 'simulated') &&
    result.sensor_inputs_simulated === (inputs.sensor_input_source === 'simulated') &&
    typeof result.anomaly_input_reading_count === 'number' &&
    result.anomaly_input_reading_count >= 0 &&
    (inputs.sensor_input_source === 'simulated'
      ? result.anomaly_score === null &&
        result.anomaly_flag === null &&
        result.anomaly_input_reading_count === 0
      : result.anomaly_score !== null &&
        result.anomaly_flag !== null &&
        result.anomaly_input_reading_count > 0) &&
    typeof result.latest_reading_at === 'string' &&
    !Number.isNaN(Date.parse(result.latest_reading_at)) &&
    typeof result.failure_probability === 'number' &&
    result.failure_probability >= 0 &&
    result.failure_probability <= 1 &&
    (result.anomaly_score === null ||
      (typeof result.anomaly_score === 'number' &&
        result.anomaly_score >= 0 &&
        result.anomaly_score <= 1)) &&
    (result.anomaly_flag === null || typeof result.anomaly_flag === 'boolean') &&
    typeof result.health_score === 'number' &&
    result.health_score >= 0 &&
    result.health_score <= 100 &&
    ['Operational', 'Warning', 'Critical'].includes(result.status ?? '') &&
    typeof result.recommendation === 'string' &&
    (result.failure_type === null || typeof result.failure_type === 'string') &&
    Array.isArray(result.anomaly_features_used) &&
    result.anomaly_features_used.every((feature) => typeof feature === 'string') &&
    !!anomalyModelInputs &&
    typeof anomalyModelInputs === 'object' &&
    Object.keys(anomalyModelInputs).length === result.anomaly_features_used.length &&
    result.anomaly_features_used.every(
      (feature) =>
        Object.prototype.hasOwnProperty.call(anomalyModelInputs, feature) &&
        (anomalyModelInputs[feature] === null ||
          typeof anomalyModelInputs[feature] === 'number')
    ) &&
    typeof result.timestamp === 'string' &&
    result.prediction_source === 'Trained ML Models' &&
    result.data_source ===
      (inputs.sensor_input_source === 'simulated'
        ? 'Simulated Sensor Data'
        : 'Provided Sensor Data')
  )
}

export async function requestPrediction(
  inputs: PredictionInputs,
  thresholds: Thresholds
): Promise<PredictionResponse> {
  const requestInputs = { ...inputs }
  const request = (includeThresholds: boolean) =>
    fetch('/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...requestInputs,
        ...(includeThresholds
          ? { decision_thresholds: toDecisionThresholds(thresholds) }
          : {}),
      }),
    })
  let response = await request(true)

  if (!response.ok) {
    const responseBody = await response.text()
    if (response.status !== 422 || !isUnsupportedThresholdField(responseBody)) {
      throw new Error(
        `Prediction request failed (${response.status})${responseBody ? `: ${responseBody}` : ''}`
      )
    }
    response = await request(false)
    if (!response.ok) {
      const retryBody = await response.text()
      throw new Error(
        `Prediction request failed (${response.status})${retryBody ? `: ${retryBody}` : ''}`
      )
    }
  }

  const result: unknown = await response.json()
  if (!isPredictionResponse(result)) {
    throw new Error('Prediction service returned an invalid response')
  }
  for (const key of [
    'type',
    'air_temperature',
    'process_temperature',
    'rotational_speed',
    'torque',
    'tool_wear',
    'machine_input_source',
    'sensor_input_source',
    'simulation_state',
  ] as const) {
    if (result.inputs[key] !== inputs[key]) {
      throw new Error(`Prediction response input did not match: ${key}`)
    }
  }
  const status = statusForPrediction(result, thresholds)
  return { ...result, status, recommendation: recommendationForStatus(status) }
}

function isUnsupportedThresholdField(responseBody: string) {
  let payload: unknown
  try {
    payload = JSON.parse(responseBody)
  } catch {
    return false
  }
  if (!payload || typeof payload !== 'object' || !('detail' in payload)) return false
  const details = payload.detail
  if (!Array.isArray(details)) return false
  return details.some((detail: unknown) => {
    if (!detail || typeof detail !== 'object') return false
    const error = detail as { loc?: unknown; type?: unknown; msg?: unknown }
    return (
      Array.isArray(error.loc) &&
      error.loc.includes('decision_thresholds') &&
      (error.type === 'extra_forbidden' ||
        (typeof error.msg === 'string' &&
          /extra (inputs|fields) (are )?not permitted/i.test(error.msg)))
    )
  })
}

export async function requestModelStatus(): Promise<
  import('../types').ModelSystemStatus
> {
  const response = await fetch('/api/health', { cache: 'no-store' })
  if (!response.ok) throw new Error(`Model status request failed (${response.status})`)
  const result: unknown = await response.json()
  if (!result || typeof result !== 'object') {
    throw new Error('Model service returned an invalid health response')
  }
  const status = result as Partial<import('../types').ModelSystemStatus>
  if (
    (status.status !== 'ok' && status.status !== 'not_ready') ||
    typeof status.models_loaded !== 'boolean' ||
    !['ready', 'unavailable'].includes(status.failure_model ?? '') ||
    (status.failure_type_model !== undefined &&
      !['ready', 'unavailable'].includes(status.failure_type_model)) ||
    !['ready', 'unavailable'].includes(status.anomaly_model ?? '') ||
    !(status.model_version === null || typeof status.model_version === 'string') ||
    !(
      status.last_prediction_at === null ||
      (typeof status.last_prediction_at === 'string' &&
        !Number.isNaN(Date.parse(status.last_prediction_at)))
    )
  ) {
    throw new Error('Model service returned an invalid health response')
  }
  return {
    ...status,
    failure_type_model:
      status.failure_type_model ?? (status.models_loaded ? 'ready' : 'unavailable'),
  } as import('../types').ModelSystemStatus
}
