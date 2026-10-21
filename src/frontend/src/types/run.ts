import type { Config } from './config.ts'

export interface Placement {
  vehicle_id: string
  x: number
  y: number
  length: number
  width: number
}

export interface AnnealingSettings {
  algorithm: 'simulated_annealing'
  iterations: number
  initial_temperature: number
  cooling_rate: number
  minimum_temperature: number
  stagnation_window: number
}

export interface AnnealingPoint {
  iteration: number
  temperature: number
  objective: number
  best_objective: number
  delta: number | null
  log_acceptance: number | null
  exponential: number | null
  acceptance_probability: number
  accepted: boolean
  candidate_found: boolean
}

export interface Snapshot {
  iteration: number
  objective: number
  arrangement: Placement[]
}

export interface SearchRun {
  id: string
  created_at: string
  configHash: string
  config: Config
  random_seed: number
  settings: AnnealingSettings
  result: {
    initial_arrangement: Placement[]
    final_arrangement: Placement[]
    last_arrangement: Placement[]
    unloaded_vehicle_ids: string[]
    initial_objective: number
    final_objective: number
    best_objective: number
    iterations_completed: number
    runtime_ms: number
    stuck_count: number
    stop_reason: string
    annealing_history: AnnealingPoint[]
    snapshots: Snapshot[]
  }
}

export function arrangementConfig(config: Config, placements: Placement[]): Config {
  const loaded = new Map(placements.map(item => [item.vehicle_id, item]))
  return {
    ship: { ...config.ship },
    preserve_positions: true, // Display actual search placements, regardless of start mode.
    vehicles: config.vehicles.map(vehicle => {
      const placement = loaded.get(vehicle.id)
      return placement
        ? { ...vehicle, x: placement.x, y: placement.y, length: placement.length, width: placement.width }
        : { ...vehicle, x: null, y: null }
    }),
  }
}
