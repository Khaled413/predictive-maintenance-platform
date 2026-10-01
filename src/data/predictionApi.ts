import type { PredictionInputs, PredictionResponse } from '../types'

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
    result.anomaly_input_reading_count > 0 &&
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
    Array.isArray(result.anomaly_features_used) &&
    result.anomaly_features_used.every((feature) => typeof feature === 'string') &&
    !!anomalyModelInputs &&
    typeof anomalyModelInputs === 'object' &&
    Object.keys(anomalyModelInputs).length === result.anomaly_features_used.length &&
    result.anomaly_features_used.every(
      (feature) =>
        Object.prototype.hasOwnProperty.call(anomalyModelInputs, feature) &&
        (anomalyModelInputs[feature] === null ||
          typeof anomalyModelInputs[feature] === 'number'),
    ) &&
    typeof result.timestamp === 'string' &&
    result.prediction_source === 'Trained ML Models' &&
    result.data_source ===
      (inputs.sensor_input_source === 'simulated'
        ? 'Simulated Sensor Data'
        : 'Provided Sensor Data')
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
  return result
}
