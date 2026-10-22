import { parseConfig } from './config.ts'
import { iterationChange } from '../iterationHistory.ts'
import type { Config } from '../types/config.ts'
import type {
  LiveRun,
  ObjectivePoint,
  SearchProgress,
  SteepestAscentRun,
  VehiclePlacement,
} from '../types/run.ts'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function integer(value: unknown, min = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min
}

function placement(value: unknown): value is VehiclePlacement {
  return (
    record(value) &&
    typeof value.vehicle_id === 'string' &&
    integer(value.x) &&
    integer(value.y) &&
    integer(value.length, 1) &&
    integer(value.width, 1)
  )
}

function objectivePoint(value: unknown): value is ObjectivePoint {
  return record(value) && integer(value.iteration) && integer(value.objective)
}

export function parseRun(data: unknown): SteepestAscentRun {
  if (
    !record(data) ||
    typeof data.id !== 'string' ||
    typeof data.created_at !== 'string' ||
    typeof data.configHash !== 'string' ||
    !integer(data.random_seed, -Number.MAX_SAFE_INTEGER) ||
    !record(data.settings) ||
    data.settings.algorithm !== 'hill_climbing' ||
    data.settings.variant !== 'steepest_ascent' ||
    !integer(data.settings.iterations, 1) ||
    !record(data.result)
  )
    throw new Error('Unexpected run response from the backend.')
  const result = data.result
  if (
    !Array.isArray(result.initial_arrangement) ||
    !result.initial_arrangement.every(placement) ||
    !Array.isArray(result.final_arrangement) ||
    !result.final_arrangement.every(placement) ||
    !Array.isArray(result.unloaded_vehicle_ids) ||
    !result.unloaded_vehicle_ids.every((id: unknown) => typeof id === 'string') ||
    !integer(result.initial_objective) ||
    !integer(result.final_objective) ||
    !Array.isArray(result.objective_history) ||
    result.objective_history.length === 0 ||
    !result.objective_history.every(objectivePoint) ||
    typeof result.runtime_ms !== 'number' ||
    !Number.isFinite(result.runtime_ms) ||
    result.runtime_ms < 0 ||
    !integer(result.iterations_completed) ||
    !integer(result.neighbors_evaluated) ||
    (result.stop_reason !== 'local_optimum' && result.stop_reason !== 'iteration_limit')
  ) {
    throw new Error('The backend returned incomplete run results.')
  }
  return {
    id: data.id,
    created_at: data.created_at,
    config: parseConfig(data.config),
    configHash: data.configHash,
    random_seed: data.random_seed,
    settings: {
      algorithm: 'hill_climbing',
      variant: 'steepest_ascent',
      iterations: data.settings.iterations,
    },
    result: {
      initial_arrangement: result.initial_arrangement,
      final_arrangement: result.final_arrangement,
      unloaded_vehicle_ids: result.unloaded_vehicle_ids,
      initial_objective: result.initial_objective,
      final_objective: result.final_objective,
      objective_history: result.objective_history,
      runtime_ms: result.runtime_ms,
      iterations_completed: result.iterations_completed,
      neighbors_evaluated: result.neighbors_evaluated,
      stop_reason: result.stop_reason,
    },
  }
}

export function parseProgress(data: unknown): SearchProgress {
  if (
    !record(data) ||
    !['initial', 'candidate', 'best', 'iteration'].includes(String(data.phase)) ||
    !integer(data.iteration) ||
    !integer(data.objective) ||
    !integer(data.current_objective) ||
    !Array.isArray(data.arrangement) ||
    !data.arrangement.every(placement) ||
    !integer(data.neighbors_evaluated) ||
    typeof data.runtime_ms !== 'number' ||
    !Number.isFinite(data.runtime_ms) ||
    data.runtime_ms < 0
  ) {
    throw new Error('Invalid live search update.')
  }
  const phase = data.phase
  if (phase !== 'initial' && phase !== 'candidate' && phase !== 'best' && phase !== 'iteration')
    throw new Error('Invalid search phase.')
  return {
    phase,
    iteration: data.iteration,
    objective: data.objective,
    current_objective: data.current_objective,
    arrangement: data.arrangement,
    neighbors_evaluated: data.neighbors_evaluated,
    runtime_ms: data.runtime_ms,
    config: phase === 'initial' ? parseConfig(data.config) : undefined,
  }
}

export function advanceLiveRun(
  previous: LiveRun | null,
  update: SearchProgress,
  seed: number
): LiveRun {
  if (update.phase === 'initial') {
    if (
      previous ||
      update.iteration !== 0 ||
      !update.config ||
      update.current_objective !== update.objective
    )
      throw new Error('Invalid initial search update.')
    return {
      config: update.config,
      random_seed: seed,
      initial_arrangement: update.arrangement,
      arrangement: update.arrangement,
      initial_objective: update.objective,
      objective: update.objective,
      objective_history: [{ iteration: 0, objective: update.objective }],
      iteration: 0,
      evaluating_iteration: 1,
      iteration_changes: [],
      best_candidate: null,
      best_objective: null,
      neighbor_preview: null,
      neighbors_evaluated: update.neighbors_evaluated,
      runtime_ms: update.runtime_ms,
      phase: update.phase,
    }
  }
  if (!previous || update.iteration !== previous.iteration + 1)
    throw new Error('Live search updates arrived out of order.')
  if (update.phase === 'candidate') {
    if (
      update.current_objective !== previous.objective ||
      update.objective > (previous.best_objective ?? previous.objective)
    )
      throw new Error('Invalid neighbor update.')
    return {
      ...previous,
      phase: update.phase,
      evaluating_iteration: update.iteration,
      neighbor_preview: {
        arrangement: update.arrangement,
        objective: update.objective,
        kind: 'candidate',
      },
      neighbors_evaluated: update.neighbors_evaluated,
      runtime_ms: update.runtime_ms,
    }
  }
  if (update.phase === 'best') {
    if (
      update.current_objective !== previous.objective ||
      update.objective <= (previous.best_objective ?? previous.objective)
    )
      throw new Error('Invalid best-neighbor update.')
    return {
      ...previous,
      phase: update.phase,
      evaluating_iteration: update.iteration,
      best_candidate: update.arrangement,
      best_objective: update.objective,
      neighbor_preview: {
        arrangement: update.arrangement,
        objective: update.objective,
        kind: 'best',
      },
      neighbors_evaluated: update.neighbors_evaluated,
      runtime_ms: update.runtime_ms,
    }
  }
  if (
    update.current_objective !== update.objective ||
    update.objective !== (previous.best_objective ?? previous.objective)
  )
    throw new Error('Invalid committed-state update.')
  return {
    ...previous,
    phase: update.phase,
    arrangement: update.arrangement,
    objective: update.objective,
    iteration: update.iteration,
    evaluating_iteration: update.iteration + 1,
    iteration_changes: [
      ...previous.iteration_changes,
      iterationChange(previous.arrangement, update.arrangement, update.iteration, update.objective),
    ],
    best_candidate: null,
    best_objective: null,
    neighbor_preview: null,
    objective_history: [
      ...previous.objective_history,
      { iteration: update.iteration, objective: update.objective },
    ],
    neighbors_evaluated: update.neighbors_evaluated,
    runtime_ms: update.runtime_ms,
  }
}

export async function executeSteepestAscent(
  config: Config,
  randomSeed: number,
  iterations: number
): Promise<SteepestAscentRun> {
  let response: Response
  try {
    response = await fetch('/api/optimization/hill-climbing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config, random_seed: randomSeed, iterations }),
    })
  } catch {
    throw new Error('Backend unavailable. Start FastAPI and MongoDB, then try again.')
  }
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = record(data) && typeof data.detail === 'string' ? data.detail : null
    throw new Error(
      detail ?? `Run failed (${response.status}). Check that FastAPI and MongoDB are running.`
    )
  }
  return parseRun(data)
}
