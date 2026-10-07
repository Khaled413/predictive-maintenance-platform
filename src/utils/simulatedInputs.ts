import type { MachineTypeCode, PredictionInputs, SimulationState } from '../types'

/**
 * Demo condition categories shown on the dashboard:
 *   GOOD → كويس · MEDIUM → متوسط · ACCEPTABLE → مقبول · BAD → وحش
 *
 * Each category maps to a fixed input profile calibrated against the trained
 * failure model (ml/models) so that, for every machine type and across the
 * full reading jitter below, the model returns:
 *   GOOD       health > 85      → Operational
 *   MEDIUM     70 < health ≤ 85 → Operational
 *   ACCEPTABLE 40 < health ≤ 70 → Warning
 *   BAD        health ≤ 40      → Critical
 * Displayed health, status and recommendation always come from the model; the
 * category only selects which inputs are sent to it.
 * (Validation: ml/tests/test_service.py and scripts/smoke.mjs)
 */
export type ConditionCategory = 'GOOD' | 'MEDIUM' | 'ACCEPTABLE' | 'BAD'

export function hasReusableSimulatedInputs(
  inputs: PredictionInputs | undefined,
  machineId: string,
  type: MachineTypeCode,
): inputs is PredictionInputs {
  return inputs?.machine_id === machineId &&
    inputs.type === type &&
    inputs.machine_input_source === 'simulated' &&
    inputs.sensor_input_source === 'simulated' &&
    ['NORMAL', 'DEGRADING', 'CRITICAL'].includes(inputs.simulation_state) &&
    [
      inputs.air_temperature,
      inputs.process_temperature,
      inputs.rotational_speed,
      inputs.torque,
      inputs.tool_wear,
    ].every(Number.isFinite)
}

type ScenarioProfile = {
  air: number
  delta: number
  speed: number
  torque: number
  wear: number
}

const CONDITION_CATEGORIES: ConditionCategory[] = ['GOOD', 'MEDIUM', 'ACCEPTABLE', 'BAD']

const CONDITION_PROFILES: Record<MachineTypeCode, Record<ConditionCategory, ScenarioProfile>> = {
  H: {
    GOOD: { air: 298, delta: 8, speed: 1700, torque: 40, wear: 80 },
    MEDIUM: { air: 301.5, delta: 8.2, speed: 1600, torque: 56, wear: 190 },
    ACCEPTABLE: { air: 300.6, delta: 8.8, speed: 1380, torque: 47.6, wear: 246 },
    BAD: { air: 304, delta: 9.2, speed: 1271, torque: 68.6, wear: 161 },
  },
  L: {
    GOOD: { air: 298, delta: 8, speed: 1700, torque: 40, wear: 80 },
    MEDIUM: { air: 301.5, delta: 8.6, speed: 1550, torque: 56, wear: 110 },
    ACCEPTABLE: { air: 302.4, delta: 8.6, speed: 1317, torque: 59.4, wear: 179 },
    BAD: { air: 298.5, delta: 10.9, speed: 1360, torque: 60.9, wear: 187 },
  },
  M: {
    GOOD: { air: 298, delta: 8, speed: 1700, torque: 40, wear: 80 },
    MEDIUM: { air: 300.5, delta: 8.2, speed: 1550, torque: 56, wear: 150 },
    ACCEPTABLE: { air: 302, delta: 8.5, speed: 1381, torque: 58.4, wear: 201 },
    BAD: { air: 299.91, delta: 9.99, speed: 1325, torque: 72.3, wear: 247 },
  },
}

const SIMULATION_STATE_BY_CONDITION: Record<ConditionCategory, SimulationState> = {
  GOOD: 'NORMAL',
  MEDIUM: 'DEGRADING',
  ACCEPTABLE: 'DEGRADING',
  BAD: 'CRITICAL',
}

/**
 * Reading spread around each profile. GOOD keeps a wide operating spread;
 * ACCEPTABLE uses tighter jitter because its calibrated inputs sit closer to
 * the warning/critical band edges. Corner and Monte-Carlo checks against the
 * trained model confirmed every draw stays inside its target health band.
 */
const OFFSET_SPAN: Record<ConditionCategory, number> = {
  GOOD: 4,
  MEDIUM: 0,
  ACCEPTABLE: 0,
  BAD: 0,
}

const JITTER: Record<ConditionCategory, ScenarioProfile> = {
  GOOD: { air: 0.03, delta: 0.05, speed: 2, torque: 0.1, wear: 2 },
  MEDIUM: { air: 0.03, delta: 0.05, speed: 2, torque: 0.1, wear: 2 },
  ACCEPTABLE: { air: 0.02, delta: 0.02, speed: 1, torque: 0.05, wear: 1 },
  BAD: { air: 0.03, delta: 0.05, speed: 2, torque: 0.1, wear: 2 },
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function shuffled<T>(items: T[]): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

/** Single random condition for one machine (e.g. when adding a machine). */
export function randomConditionCategory(): ConditionCategory {
  return CONDITION_CATEGORIES[Math.floor(Math.random() * CONDITION_CATEGORIES.length)]
}

/**
 * Balanced, shuffled condition list for a fleet refresh. Every category is
 * represented (as evenly as the fleet size allows) and the assignment order is
 * random, so each refresh shows كويس / متوسط / مقبول / وحش readings while the
 * trained model still decides each machine's status and recommendation.
 */
export function balancedConditionCategories(count: number): ConditionCategory[] {
  const machineCount = Math.max(0, Math.floor(count))
  const base = Math.floor(machineCount / CONDITION_CATEGORIES.length)
  const remainder = machineCount % CONDITION_CATEGORIES.length
  const bonusCategories = new Set(shuffled(CONDITION_CATEGORIES).slice(0, remainder))
  const categories = CONDITION_CATEGORIES.flatMap((category) =>
    Array<ConditionCategory>(base + (bonusCategories.has(category) ? 1 : 0)).fill(category),
  )
  return shuffled(categories)
}

export function machineTypeCode(machineType: string): MachineTypeCode {
  const type = machineType.toLowerCase()
  if (type.includes('compressor') || type.includes('boiler')) return 'H'
  if (type.includes('conveyor') || type.includes('packaging') || type.includes('label')) {
    return 'L'
  }
  return 'M'
}

export function simulateMachineInputs(
  machineId: string,
  machineType: string,
  condition?: ConditionCategory,
): PredictionInputs {
  const type = machineTypeCode(machineType)
  const category = condition ?? randomConditionCategory()
  const profile = CONDITION_PROFILES[type][category]
  const jitter = JITTER[category]
  const offset = randomBetween(0, OFFSET_SPAN[category])
  const air_temperature = Number(
    (profile.air + offset * 0.35 + randomBetween(-jitter.air, jitter.air)).toFixed(2),
  )
  const temperatureDelta =
    profile.delta + offset * 0.2 + randomBetween(-jitter.delta, jitter.delta)
  const process_temperature = Number((air_temperature + temperatureDelta).toFixed(2))
  const rotational_speed = Math.round(
    profile.speed + offset * 20 + randomBetween(-jitter.speed, jitter.speed),
  )
  const torque = Number(
    (profile.torque + offset * 1.2 + randomBetween(-jitter.torque, jitter.torque)).toFixed(2),
  )
  const tool_wear = Math.round(
    profile.wear + offset * 8 + randomBetween(-jitter.wear, jitter.wear),
  )

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
    simulation_state: SIMULATION_STATE_BY_CONDITION[category],
  }
}
