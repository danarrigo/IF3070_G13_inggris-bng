import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseRun } from '../src/api/optimization.ts'
import {
  configForRunView,
  describeNeighbor,
  sameConfig,
} from '../src/components/runPresentation.ts'

function runPayload() {
  return {
    id: 'run-1',
    created_at: '2026-10-22T00:00:00Z',
    configHash: 'hash',
    random_seed: 42,
    config: {
      ship: { length: 10, width: 10, max_weight: 100 },
      preserve_positions: false,
      vehicles: [
        { id: 'a', x: null, y: null, length: 4, width: 2, weight: 10, eta: 0, shipping_fee: 50 },
        { id: 'b', x: null, y: null, length: 2, width: 1, weight: 10, eta: 0, shipping_fee: 70 },
      ],
    },
    settings: { algorithm: 'hill_climbing', variant: 'steepest_ascent', iterations: 100 },
    result: {
      initial_arrangement: [{ vehicle_id: 'a', x: 0, y: 0, length: 4, width: 2 }],
      final_arrangement: [{ vehicle_id: 'a', x: 3, y: 2, length: 2, width: 4 }],
      unloaded_vehicle_ids: ['b'],
      initial_objective: 50,
      final_objective: 50,
      objective_history: [
        { iteration: 0, objective: 50 },
        { iteration: 1, objective: 50 },
      ],
      runtime_ms: 12.5,
      iterations_completed: 1,
      neighbors_evaluated: 10,
      stop_reason: 'local_optimum',
    },
  }
}

test('parses complete execution results and rejects missing initial state or malformed metrics', () => {
  const payload = runPayload()
  const run = parseRun(payload)
  assert.equal(run.result.final_objective, 50)
  assert.throws(() =>
    parseRun({ ...payload, result: { ...payload.result, initial_arrangement: null } })
  )
  assert.throws(() => parseRun({ ...payload, result: { ...payload.result, runtime_ms: -1 } }))
  assert.throws(() =>
    parseRun({ ...payload, result: { ...payload.result, iterations_completed: '1' } })
  )
})

test('renders actual initial/final placements, rotation, and unloaded vehicles without editing snapshot', () => {
  const run = parseRun(runPayload())
  const before = JSON.stringify(run)
  const initial = configForRunView(run, 'initial')
  const final = configForRunView(run, 'final')
  assert.equal(initial.preserve_positions, true)
  assert.deepEqual([initial.vehicles[0].x, initial.vehicles[0].y], [0, 0])
  assert.deepEqual(
    [final.vehicles[0].x, final.vehicles[0].y, final.vehicles[0].length, final.vehicles[0].width],
    [3, 2, 2, 4]
  )
  assert.equal(final.vehicles[1].x, null)
  assert.equal(final.vehicles[1].y, null)
  final.ship.width = 99
  assert.equal(JSON.stringify(run), before)
})

test('labels the actual sampled move, rotation, load, unload, and swap', () => {
  const run = parseRun(runPayload())
  const before = run.result.initial_arrangement
  assert.equal(describeNeighbor(run.config, before, [{ ...before[0], x: 1 }]), 'Move V1')
  assert.equal(describeNeighbor(run.config, before, run.result.final_arrangement), 'Rotate V1')
  assert.equal(describeNeighbor(run.config, [], before), 'Load V1')
  assert.equal(describeNeighbor(run.config, before, []), 'Unload V1')
  assert.equal(
    describeNeighbor(run.config, before, [{ ...before[0], vehicle_id: 'b' }]),
    'Swap V1 + V2'
  )
})

test('config comparison is independent of JSON property order but detects changed values', () => {
  const config = parseRun(runPayload()).config
  const reordered = {
    preserve_positions: config.preserve_positions,
    vehicles: config.vehicles.map(({ shipping_fee, eta, ...rest }) => ({
      shipping_fee,
      eta,
      ...rest,
    })),
    ship: { max_weight: 100, width: 10, length: 10 },
  }
  assert(sameConfig(config, reordered))
  reordered.ship.width = 11
  assert(!sameConfig(config, reordered))
})
