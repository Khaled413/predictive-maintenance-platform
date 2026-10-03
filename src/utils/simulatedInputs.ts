import type {
  MachineTypeCode,
  PredictionInputs,
  SimulationState,
} from '../types'

const SCENARIO_PROFILES: Record<
  SimulationState,
  { air: number; delta: number; speed: number; torque: number; wear: number }
> = {
  NORMAL: { air: 298, delta: 8, speed: 1700, torque: 40, wear: 80 },
  DEGRADING: { air: 301, delta: 11, speed: 1450, torque: 60, wear: 150 },
  CRITICAL: { air: 303, delta: 11, speed: 1250, torque: 65, wear: 200 },
}

const SIMULATION_STATES: SimulationState[] = ['NORMAL', 'DEGRADING', 'CRITICAL']
export const SIMULATION_STATE_COUNT = SIMULATION_STATES.length

function machineOffset(machineId: string): number {
  const digits = machineId.match(/\d+$/)?.[0]
  return digits ? Number(digits) % 5 : 0
}

function initialState(machineId: string): SimulationState {
  return SIMULATION_STATES[machineOffset(machineId) % SIMULATION_STATES.length]
}

export function simulationStateForSlot(slot: number): SimulationState {
  const normalizedSlot = Math.max(0, Math.floor(slot))
  return SIMULATION_STATES[normalizedSlot % SIMULATION_STATES.length]
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
  simulationState: SimulationState = initialState(machineId),
): PredictionInputs {
  const type = machineTypeCode(machineType)
  const offset = machineOffset(machineId)
  const profile = SCENARIO_PROFILES[simulationState]
  const air_temperature = Number((profile.air + offset * 0.35).toFixed(2))
  const process_temperature = Number(
    (air_temperature + profile.delta + offset * 0.2).toFixed(2),
  )
  const rotational_speed = profile.speed + offset * 20
  const torque = Number((profile.torque + offset * 1.2).toFixed(2))
  const tool_wear = profile.wear + offset * 8

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
    simulation_state: simulationState,
  }
}
