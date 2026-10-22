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

export const hillClimbingLabels = {
  steepest_ascent: 'Steepest Ascent',
  stochastic: 'Stochastic',
  sideways: 'Sideways Move',
  random_restart: 'Random Restart',
}
export type HillClimbingVariant = keyof typeof hillClimbingLabels
export function isHillClimbingVariant(value: unknown): value is HillClimbingVariant {
  return typeof value === 'string' && Object.hasOwn(hillClimbingLabels, value)
}
export const hillClimbingStopLabels = {
  local_optimum: 'No improving neighbor remains.',
  iteration_limit: 'Total iteration limit reached.',
  sideways_limit: 'Consecutive sideways-move limit reached.',
  restart_limit: 'Restart limit reached; returning the best state found.',
}
export type HillClimbingStopReason = keyof typeof hillClimbingStopLabels

export interface HillClimbingRun {
  id: string
  created_at: string
  config: Config
  configHash: string
  random_seed: number
  settings: {
    algorithm: 'hill_climbing'
    variant: HillClimbingVariant
    iterations: number
    max_sideways?: number
    max_restart?: number
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
    stop_reason: HillClimbingStopReason
    sideways_moves?: number
    restarts_completed?: number
    iterations_per_restart?: number[]
  }
}

export type SteepestAscentRun = HillClimbingRun

export interface SearchProgress {
  phase: 'initial' | 'candidate' | 'best' | 'iteration' | 'restart'
  iteration: number
  objective: number
  current_objective: number
  arrangement: VehiclePlacement[]
  neighbors_evaluated: number
  runtime_ms: number
  config?: Config
  variant?: HillClimbingVariant
  restarts_completed?: number
  sideways_moves?: number
}

export interface IterationChange {
  kind?: 'iteration' | 'restart'
  iteration: number
  objective: number
  updated: VehiclePlacement[]
  removed_vehicle_ids: string[]
}

export interface IterationComparison {
  state_changed: boolean
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
  variant: HillClimbingVariant
  restarts_completed: number
  sideways_moves: number
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
