import type {
  MachineTypeCode,
  PredictionInputs,
  SimulationState,
} from '../types'
import { seededRandom } from './helpers'

function stableSeed(value: string): number {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash) || 1
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
): PredictionInputs {
  const type = machineTypeCode(machineType)
  const seed = stableSeed(machineId)
  const rand = seededRandom(seed)
  const stateIndex = seed % 10
  const simulation_state: SimulationState =
    stateIndex < 5 ? 'NORMAL' : stateIndex < 8 ? 'DEGRADING' : 'CRITICAL'
  const stress = simulation_state === 'NORMAL' ? 0 : simulation_state === 'DEGRADING' ? 1 : 2
  const air_temperature = Number((295 + stress * 4 + rand() * 3).toFixed(2))
  const process_temperature = Number((air_temperature + 8 + stress * 2 + rand() * 4).toFixed(2))
  const rotational_speed = Math.round(2400 - stress * 350 + rand() * 220)
  const torque = Number((35 + stress * 12 + (2800 - rotational_speed) * 0.018 + rand() * 4).toFixed(2))
  const tool_wear = Math.round(35 + stress * 80 + rand() * 35)

  return {
    machine_id: machineId,
    type,
    air_temperature,
    process_temperature,
    rotational_speed,
    torque,
    tool_wear,
    simulation_state,
  }
}
