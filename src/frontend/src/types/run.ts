import type { Config } from './config.ts'

export interface GASettings {
  algorithm: 'genetic_algorithm'
  iterations: number
  population_size: number
  crossover_rate: number
  mutation_rate: number
}

export interface Placement {
  vehicle_id: string
  x: number
  y: number
  length: number
  width: number
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
  kind: 'population' | 'elite' | 'roulette' | 'crossover' | 'validation' | 'mutation' | 'admission' | 'generation'
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

export interface DemoTrace { version: 1; steps: DemoStep[] }

export interface Job {
  id: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  stage: 'queued' | 'initializing' | 'searching' | 'cancelling' | 'saving' | 'completed' | 'failed' | 'cancelled'
  request: JobRequest
  generation: number
  elapsed_ms: number
  initial_arrangement: Placement[] | null
  population_history: PopulationPoint[]
  run: Run | null
  error: string | null
}
