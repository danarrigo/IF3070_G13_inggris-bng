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

export interface GASettings {
  algorithm: 'genetic_algorithm'
  iterations: number
  population_size: number
  crossover_rate: number
  mutation_rate: number
}

export interface PopulationPoint {
  generation: number
  maximum: number
  average: number
}

export interface Run {
  id: string
  created_at: string
  config: Config
  random_seed: number
  settings: GASettings
  result: {
    demo_recorded?: boolean
    demo_trace?: DemoTrace | null
    initial_arrangement?: Placement[] | null
    final_arrangement: Placement[]
    initial_objective: number
    final_objective: number
    runtime_ms: number
    generations_completed?: number | null
    population_history?: PopulationPoint[]
  }
}

export interface JobRequest {
  config: Config
  settings: GASettings
  random_seed: number
  record_demo?: boolean
}

export interface DemoIndividual {
  id: string
  fitness: number
  arrangement: Placement[]
}

export interface DemoStep {
  kind:
    | 'population'
    | 'elite'
    | 'roulette'
    | 'crossover'
    | 'validation'
    | 'mutation'
    | 'admission'
    | 'generation'
  generation: number
  pair: number | null
  child: number | null
  message: string
  individuals: DemoIndividual[]
  parent_ids: string[]
  parents: Placement[][]
  arrangement: Placement[] | null
  before: Placement[] | null
  fitness: number[]
  selected_index: number | null
  draw: number | null
  draw_kind: 'weighted' | 'uniform' | 'rate' | null
  rate: number | null
  cut: number | null
  attempt: number | null
  accepted: boolean | null
  retained_children: number[]
  errors: string[]
  changed_vehicle_ids: string[]
  operation: string | null
}

export interface DemoTrace {
  version: 1
  steps: DemoStep[]
}

export interface Job {
  id: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  stage:
    | 'queued'
    | 'initializing'
    | 'searching'
    | 'cancelling'
    | 'saving'
    | 'completed'
    | 'failed'
    | 'cancelled'
  request: JobRequest
  generation: number
  elapsed_ms: number
  initial_arrangement: Placement[] | null
  population_history: PopulationPoint[]
  run: Run | null
  error: string | null
}

export type Placement = VehiclePlacement

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
  const loaded = new Map(placements.map((item) => [item.vehicle_id, item]))
  return {
    ...config,
    ship: { ...config.ship },
    preserve_positions: true,
    vehicles: config.vehicles.map((vehicle) => {
      const placement = loaded.get(vehicle.id)
      return placement
        ? {
            ...vehicle,
            x: placement.x,
            y: placement.y,
            length: placement.length,
            width: placement.width,
          }
        : { ...vehicle, x: null, y: null }
    }),
  }
}
