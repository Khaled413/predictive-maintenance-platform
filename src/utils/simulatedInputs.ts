import type {
  MachineTypeCode,
  DemoHealthBand,
  PredictionInputs,
  SimulationState,
} from '../types'

type ModelInputProfile = {
  air: number
  delta: number
  speed: number
  torque: number
  wear: number
}

const HEALTH_BANDS: DemoHealthBand[] = [
  'VERY_GOOD',
  'GOOD',
  'MEDIUM',
  'BELOW_AVERAGE',
  'POOR',
]
export const DEMO_HEALTH_BAND_COUNT = HEALTH_BANDS.length

const SENSOR_STATE_BY_HEALTH_BAND: Record<DemoHealthBand, SimulationState> = {
  VERY_GOOD: 'NORMAL',
  GOOD: 'NORMAL',
  MEDIUM: 'DEGRADING',
  BELOW_AVERAGE: 'DEGRADING',
  POOR: 'CRITICAL',
}

const MODEL_INPUT_PROFILES: Record<
  MachineTypeCode,
  Record<DemoHealthBand, ModelInputProfile>
> = {
  H: {
    VERY_GOOD: { air: 301.972, delta: 12.319, speed: 1504.874, torque: 30.893, wear: 126.125 },
    GOOD: { air: 295.051, delta: 10.17, speed: 1740.251, torque: 55.076, wear: 141.465 },
    MEDIUM: { air: 304.354, delta: 10.645, speed: 1220.673, torque: 55.278, wear: 227.439 },
    BELOW_AVERAGE: { air: 302.321, delta: 9.651, speed: 1326.154, torque: 63.769, wear: 185.677 },
    POOR: { air: 298.944, delta: 10.938, speed: 1254.748, torque: 74.698, wear: 153.463 },
  },
  L: {
    VERY_GOOD: { air: 301.735, delta: 13.83, speed: 1760.69, torque: 48.394, wear: 36.694 },
    GOOD: { air: 296.726, delta: 9.792, speed: 1631.205, torque: 55.954, wear: 14.147 },
    MEDIUM: { air: 301.441, delta: 9.793, speed: 1500.82, torque: 59.099, wear: 81.284 },
    BELOW_AVERAGE: { air: 296.847, delta: 12.332, speed: 1486.586, torque: 71.258, wear: 114.001 },
    POOR: { air: 303.841, delta: 10.173, speed: 1406.069, torque: 68.702, wear: 232.151 },
  },
  M: {
    VERY_GOOD: { air: 303.176, delta: 11.934, speed: 1392.994, torque: 59.179, wear: 53.999 },
    GOOD: { air: 301.863, delta: 12.049, speed: 1345.884, torque: 47.886, wear: 235.36 },
    MEDIUM: { air: 295.973, delta: 8.304, speed: 1339.23, torque: 28.738, wear: 37.044 },
    BELOW_AVERAGE: { air: 300.49, delta: 11.234, speed: 1757.902, torque: 64.052, wear: 146.66 },
    POOR: { air: 299.909, delta: 9.985, speed: 1325.063, torque: 72.296, wear: 246.892 },
  },
}

function machineNumber(machineId: string): number {
  const digits = machineId.match(/\d+$/)?.[0]
  return digits ? Number(digits) : 0
}

function machineVariation(machineId: string) {
  const digits = machineNumber(machineId)
  return {
    air: ((digits * 7) % 13 - 6) * 0.01,
    delta: ((digits * 5) % 11 - 5) * 0.02,
    speed: (digits * 7) % 17 - 8,
    torque: ((digits * 7) % 13 - 6) * 0.03,
    wear: (digits * 7) % 19 - 9,
  }
}

export function healthBandForMachine(machineId: string): DemoHealthBand {
  return HEALTH_BANDS[Math.max(0, machineNumber(machineId) - 1) % HEALTH_BANDS.length]
}

export function isDemoHealthBand(value: unknown): value is DemoHealthBand {
  return typeof value === 'string' && HEALTH_BANDS.includes(value as DemoHealthBand)
}

export function healthBandForSlot(slot: number): DemoHealthBand {
  const normalizedSlot = Math.max(0, Math.floor(slot))
  return HEALTH_BANDS[normalizedSlot % HEALTH_BANDS.length]
}

export function healthBandIndex(healthBand: DemoHealthBand): number {
  return HEALTH_BANDS.indexOf(healthBand)
}

function simulationStateForHealthBand(healthBand: DemoHealthBand): SimulationState {
  return SENSOR_STATE_BY_HEALTH_BAND[healthBand]
}

export function machineTypeCode(machineType: string): MachineTypeCode {
  const type = machineType.toLowerCase()
  if (type.includes('compressor') || type.includes('boiler')) return 'H'
  if (
    type.includes('conveyor') ||
    type.includes('packaging') ||
    type.includes('label')
  ) {
    return 'L'
  }
  return 'M'
}

export function simulateMachineInputs(
  machineId: string,
  machineType: string,
  simulationState?: SimulationState,
  healthBand: DemoHealthBand = healthBandForMachine(machineId),
): PredictionInputs {
  const type = machineTypeCode(machineType)
  const variation = machineVariation(machineId)
  const profile = MODEL_INPUT_PROFILES[type][healthBand]
  const air_temperature = Number((profile.air + variation.air).toFixed(2))
  const process_temperature = Number(
    (air_temperature + profile.delta + variation.delta).toFixed(2),
  )
  const rotational_speed = Math.round(profile.speed + variation.speed)
  const torque = Number((profile.torque + variation.torque).toFixed(2))
  const tool_wear = Math.round(profile.wear + variation.wear)

  return {
    machine_id: machineId,
    type,
    air_temperature,
    process_temperature,
    rotational_speed,
    torque,
    tool_wear,
    machine_input_source: 'simulated',
    sensor_input_source: 'simulated',
    simulation_state: simulationState ?? simulationStateForHealthBand(healthBand),
    demo_health_band: healthBand,
  }
}
