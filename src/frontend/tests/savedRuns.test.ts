import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseSavedRuns } from '../src/api/runs.ts'
import type { SteepestAscentRun } from '../src/types/run.ts'

function savedRun(): SteepestAscentRun {
  return {
    id: 'saved-run',
    created_at: '2026-10-22T00:00:00Z',
    random_seed: 42,
    configHash: 'same-config',
    config: {
      ship: { length: 1, width: 1, max_weight: 1 },
      vehicles: [],
      preserve_positions: false,
    },
    settings: { algorithm: 'hill_climbing', variant: 'steepest_ascent', iterations: 10 },
    result: {
      initial_arrangement: [],
      final_arrangement: [],
      unloaded_vehicle_ids: [],
      initial_objective: 0,
      final_objective: 0,
      objective_history: [
        { iteration: 0, objective: 0 },
        { iteration: 1, objective: 0 },
      ],
      runtime_ms: 1,
      iterations_completed: 1,
      neighbors_evaluated: 0,
      stop_reason: 'local_optimum',
    },
  }
}

test('saved results retain complete runs and disclose unsupported or legacy records', () => {
  const run = savedRun()
  const parsed = parseSavedRuns([
    run,
    { ...run, result: { ...run.result, initial_arrangement: null } },
    { ...run, settings: { algorithm: 'simulated_annealing' } },
    null,
  ])
  assert.deepEqual(parsed.runs, [run])
  assert.equal(parsed.unavailable, 3)
  assert.deepEqual(parseSavedRuns([]), { runs: [], unavailable: 0 })
})

test('saved results support all four hill climbing variants and their metadata', () => {
  const base = savedRun()
  const variants = ['steepest_ascent', 'stochastic', 'sideways', 'random_restart']
  const data = variants.map((variant) => ({
    ...base,
    settings: { ...base.settings, variant, max_sideways: 2, max_restart: 3 },
    result: {
      ...base.result,
      sideways_moves: 1,
      restarts_completed: 1,
      iterations_per_restart: [1, 0],
    },
  }))
  const parsed = parseSavedRuns(data)
  assert.equal(parsed.unavailable, 0)
  assert.deepEqual(
    parsed.runs.map((run) => run.settings.variant),
    variants
  )
  assert.deepEqual(parsed.runs[3].result.iterations_per_restart, [1, 0])
})

test('saved results reject malformed responses instead of reporting an empty history', () => {
  assert.throws(() => parseSavedRuns({ error: 'database unavailable' }))
})
