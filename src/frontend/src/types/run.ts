import type { Config } from './config.ts'

export interface VehiclePlacement {
  vehicle_id: string
  x: number
  y: number
  length: number
  width: number
}

export interface ObjectivePoint {
  iteration: number
  objective: number
}

export interface SteepestAscentRun {
  id: string
  created_at: string
  config: Config
  configHash: string
  random_seed: number
  settings: {
    algorithm: 'hill_climbing'
    variant: 'steepest_ascent'
    iterations: number
  }
  result: {
    initial_arrangement: VehiclePlacement[]
    final_arrangement: VehiclePlacement[]
    unloaded_vehicle_ids: string[]
    initial_objective: number
    final_objective: number
    objective_history: ObjectivePoint[]
    runtime_ms: number
    iterations_completed: number
    neighbors_evaluated: number
    stop_reason: 'local_optimum' | 'iteration_limit'
  }
}

export interface SearchProgress {
  phase: 'initial' | 'candidate' | 'best' | 'iteration'
  iteration: number
  objective: number
  current_objective: number
  arrangement: VehiclePlacement[]
  neighbors_evaluated: number
  runtime_ms: number
  config?: Config
}

export interface IterationChange {
  iteration: number
  objective: number
  updated: VehiclePlacement[]
  removed_vehicle_ids: string[]
}

export interface IterationComparison {
  iteration: number
  before: VehiclePlacement[]
  after: VehiclePlacement[]
  before_objective: number
  after_objective: number
}

export interface NeighborPreview {
  arrangement: VehiclePlacement[]
  objective: number
  kind: 'candidate' | 'best'
}

export interface LiveRun {
  config: Config
  random_seed: number
  initial_arrangement: VehiclePlacement[]
  arrangement: VehiclePlacement[]
  initial_objective: number
  objective: number
  objective_history: ObjectivePoint[]
  iteration: number
  evaluating_iteration: number
  iteration_changes: IterationChange[]
  best_candidate: VehiclePlacement[] | null
  best_objective: number | null
  neighbor_preview: NeighborPreview | null
  neighbors_evaluated: number
  runtime_ms: number
  phase: SearchProgress['phase']
}

export type SceneView = 'configuration' | 'initial' | 'final' | 'live' | 'before' | 'after'
