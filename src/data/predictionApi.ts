import type { PredictionInputs, PredictionResponse } from '../types'

function isPredictionResponse(value: unknown): value is PredictionResponse {
  if (!value || typeof value !== 'object') return false
  const result = value as Partial<PredictionResponse>
  const inputs = result.inputs
  return (
    typeof result.machine_id === 'string' &&
    !!inputs &&
    (inputs.type === 'H' || inputs.type === 'L' || inputs.type === 'M') &&
    typeof inputs.air_temperature === 'number' &&
    typeof inputs.process_temperature === 'number' &&
    typeof inputs.rotational_speed === 'number' &&
    typeof inputs.torque === 'number' &&
    typeof inputs.tool_wear === 'number' &&
    ['NORMAL', 'DEGRADING', 'CRITICAL'].includes(inputs.simulation_state) &&
    typeof result.failure_probability === 'number' &&
    result.failure_probability >= 0 &&
    result.failure_probability <= 1 &&
    typeof result.anomaly_score === 'number' &&
    result.anomaly_score >= 0 &&
    result.anomaly_score <= 1 &&
    typeof result.anomaly_flag === 'boolean' &&
    typeof result.health_score === 'number' &&
    result.health_score >= 0 &&
    result.health_score <= 100 &&
    ['Operational', 'Warning', 'Critical'].includes(result.status ?? '') &&
    typeof result.recommendation === 'string' &&
    (result.failure_type === null || typeof result.failure_type === 'string') &&
    typeof result.timestamp === 'string' &&
    result.prediction_source === 'Trained ML Models' &&
    ['Simulated Sensor Data', 'Provided Sensor Data'].includes(result.data_source ?? '')
  )
}

export async function requestPrediction(inputs: PredictionInputs): Promise<PredictionResponse> {
  const response = await fetch('/api/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inputs),
  })

  if (!response.ok) {
    throw new Error(`Prediction request failed (${response.status})`)
  }

  const result: unknown = await response.json()
  if (!isPredictionResponse(result)) {
    throw new Error('Prediction service returned an invalid response')
  }
  return result
}
