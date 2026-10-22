import { parseConfig } from './api/config.ts'
import { isHillClimbingVariant } from './types/run.ts'
import type { Config } from './types/config.ts'
import type { AnnealingSettings, GASettings, SteepestAscentRun } from './types/run.ts'

interface BaseImport {
  config: Config
  seed: number
  saveToOutput: boolean
}
export interface HCImport extends BaseImport {
  kind: 'hill_climbing'
  settings: SteepestAscentRun['settings']
  showNeighbors: boolean
}
export interface SAImport extends BaseImport {
  kind: 'simulated_annealing'
  settings: AnnealingSettings
  runCount: 1 | 3
}
export interface GAImport extends BaseImport {
  kind: 'genetic_algorithm'
  settings: GASettings
  recordDemo: boolean
}
export type ExperimentImport = HCImport | SAImport | GAImport | { kind: 'config'; config: Config }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error('Choose a JSON file from input/requests/ or input/config.json.')
  }
  return value
}
function number(
  data: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  fallback?: number,
  integer = true
): number {
  const value = data[key] ?? fallback
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  ) {
    throw new Error(`Invalid experiment parameter: ${key}.`)
  }
  return value
}
function flag(data: Record<string, unknown>, key: string): boolean {
  if (data[key] !== undefined && typeof data[key] !== 'boolean')
    throw new Error(`Invalid experiment parameter: ${key}.`)
  return data[key] === true
}

export function parseExperimentImport(value: unknown): ExperimentImport {
  const data = record(value)
  const config = parseConfig('ship' in data ? data : data.config)
  if (new Set(config.vehicles.map((vehicle) => vehicle.id)).size !== config.vehicles.length) {
    throw new Error('Vehicle IDs must be unique.')
  }
  if ('ship' in data) return { kind: 'config', config }
  if ('result' in data || 'experiments' in data)
    throw new Error('Choose an input request, not an output or experiment index.')
  const seed = number(data, 'random_seed', 0, 2 ** 32 - 1, 42)
  const saveToOutput = flag(data, 'save_to_output')
  const base = { config, seed, saveToOutput }
  if (data.settings === undefined) {
    const variant = data.variant ?? 'steepest_ascent'
    if (!isHillClimbingVariant(variant)) throw new Error('Invalid HC variant.')
    return {
      ...base,
      kind: 'hill_climbing',
      showNeighbors: flag(data, 'show_neighbors'),
      settings: {
        algorithm: 'hill_climbing',
        variant,
        iterations: number(data, 'iterations', 1, 10000, 100),
        max_sideways: number(data, 'max_sideways', 0, 10000, 100),
        max_restart: number(data, 'max_restart', 0, 1000, 10),
      },
    }
  }
  const settings = record(data.settings)
  const iterations = number(settings, 'iterations', 1, Number.MAX_SAFE_INTEGER)
  if (settings.algorithm === 'simulated_annealing') {
    const runCount = data.run_count ?? 1
    if (runCount !== 1 && runCount !== 3) throw new Error('SA run_count must be 1 or 3.')
    if (seed > 2 ** 32 - 4) throw new Error('SA seed is out of range.')
    return {
      ...base,
      kind: 'simulated_annealing',
      runCount,
      settings: {
        algorithm: 'simulated_annealing',
        iterations: number(settings, 'iterations', 1, 10000),
        initial_temperature: number(
          settings,
          'initial_temperature',
          Number.MIN_VALUE,
          1e12,
          undefined,
          false
        ),
        cooling_rate: number(
          settings,
          'cooling_rate',
          Number.MIN_VALUE,
          1 - Number.EPSILON,
          undefined,
          false
        ),
        minimum_temperature: number(settings, 'minimum_temperature', 1e-12, 1e12, 0.001, false),
        stagnation_window: number(settings, 'stagnation_window', 1, Number.MAX_SAFE_INTEGER, 100),
      },
    }
  }
  if (settings.algorithm === 'genetic_algorithm') {
    const recordDemo = flag(data, 'record_demo')
    const population = number(settings, 'population_size', 2, Number.MAX_SAFE_INTEGER)
    if (recordDemo && (population > 10 || iterations > 10 || config.vehicles.length > 30))
      throw new Error('The request exceeds GA demo recording limits.')
    return {
      ...base,
      kind: 'genetic_algorithm',
      recordDemo,
      settings: {
        algorithm: 'genetic_algorithm',
        iterations,
        population_size: population,
        crossover_rate: number(settings, 'crossover_rate', 0, 1, undefined, false),
        mutation_rate: number(settings, 'mutation_rate', 0, 1, undefined, false),
      },
    }
  }
  throw new Error('Unsupported experiment algorithm.')
}
