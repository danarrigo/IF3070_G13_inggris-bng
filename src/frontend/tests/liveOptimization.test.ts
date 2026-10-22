import assert from 'node:assert/strict'
import { test } from 'node:test'
import { advanceLiveRun, parseProgress } from '../src/api/optimization.ts'
import { createSearchPlayback } from '../src/components/searchPlayback.ts'
import { compareIteration } from '../src/iterationHistory.ts'
import type { LiveRun, SearchProgress } from '../src/types/run.ts'

function initial(): SearchProgress {
  return parseProgress({
    phase: 'initial',
    iteration: 0,
    objective: 10,
    current_objective: 10,
    arrangement: [{ vehicle_id: 'a', x: 0, y: 0, length: 1, width: 1 }],
    neighbors_evaluated: 0,
    runtime_ms: 0,
    config: {
      ship: { length: 1, width: 1, max_weight: 1 },
      preserve_positions: true,
      vehicles: [
        { id: 'a', x: 0, y: 0, length: 1, width: 1, weight: 1, eta: 0, shipping_fee: 10 },
        { id: 'b', x: null, y: null, length: 1, width: 1, weight: 1, eta: 0, shipping_fee: 30 },
      ],
    },
  })
}

function best(): SearchProgress {
  return parseProgress({
    phase: 'best',
    iteration: 1,
    objective: 30,
    current_objective: 10,
    arrangement: [{ vehicle_id: 'b', x: 0, y: 0, length: 1, width: 1 }],
    neighbors_evaluated: 2,
    runtime_ms: 1,
  })
}

function frames(): LiveRun[] {
  const first = advanceLiveRun(null, initial(), 42)
  const candidate = advanceLiveRun(first, best(), 42)
  const accepted = advanceLiveRun(
    candidate,
    { ...best(), phase: 'iteration', current_objective: 30 },
    42
  )
  return [first, candidate, accepted]
}

test('best-so-far previews do not change committed placements or objective history', () => {
  const [first, candidate, accepted] = frames()
  assert.equal(candidate.objective, 10)
  assert.equal(candidate.best_objective, 30)
  assert.strictEqual(candidate.arrangement, first.arrangement)
  assert.deepEqual(candidate.objective_history, [{ iteration: 0, objective: 10 }])
  assert.equal(accepted.arrangement[0].vehicle_id, 'b')
  assert.equal(accepted.best_candidate, null)
  assert.deepEqual(accepted.objective_history, [
    { iteration: 0, objective: 10 },
    { iteration: 1, objective: 30 },
  ])
  assert.equal(first.initial_arrangement[0].vehicle_id, 'a')
})

test('replays before/after states for every committed iteration, including no improvement', () => {
  const [first, candidate, accepted] = frames()
  assert.deepEqual(first.iteration_changes, [])
  assert.deepEqual(candidate.iteration_changes, [])
  const finished = advanceLiveRun(
    accepted,
    {
      ...best(),
      phase: 'iteration',
      iteration: 2,
      current_objective: 30,
    },
    42
  )
  const original = JSON.stringify(finished)
  const improvement = compareIteration(
    finished.initial_arrangement,
    10,
    finished.iteration_changes,
    1
  )
  assert(improvement)
  assert.deepEqual(improvement.before, first.arrangement)
  assert.deepEqual(improvement.after, accepted.arrangement)
  assert.equal(improvement.after_objective - improvement.before_objective, 20)
  assert.deepEqual(finished.iteration_changes[1].updated, [])
  assert.deepEqual(finished.iteration_changes[1].removed_vehicle_ids, [])
  const last = compareIteration(finished.initial_arrangement, 10, finished.iteration_changes, null)
  assert(last)
  assert.equal(last.iteration, 2)
  assert.deepEqual(last.before, last.after)
  assert.equal(last.before_objective, last.after_objective)
  assert.equal(compareIteration(first.initial_arrangement, 10, [], null), null)
  assert.equal(
    compareIteration(finished.initial_arrangement, 10, finished.iteration_changes, 3),
    null
  )
  assert.equal(JSON.stringify(finished), original)
})

test('candidate previews never commit rejected states or replace the best neighbor', () => {
  const [first, bestSoFar] = frames()
  const update = parseProgress({ ...best(), phase: 'candidate', objective: 0, arrangement: [] })
  const sampled = advanceLiveRun(bestSoFar, update, 42)
  assert.equal(sampled.neighbor_preview?.kind, 'candidate')
  assert.equal(sampled.neighbor_preview?.objective, 0)
  assert.strictEqual(sampled.arrangement, first.arrangement)
  assert.strictEqual(sampled.objective_history, first.objective_history)
  assert.strictEqual(sampled.iteration_changes, first.iteration_changes)
  assert.equal(sampled.best_objective, 30)
  assert.equal(sampled.best_candidate?.[0].vehicle_id, 'b')
  const accepted = advanceLiveRun(
    sampled,
    { ...best(), phase: 'iteration', current_objective: 30 },
    42
  )
  assert.equal(accepted.arrangement[0].vehicle_id, 'b')
  assert.equal(accepted.neighbor_preview, null)
  assert.throws(() => advanceLiveRun(bestSoFar, { ...update, objective: 40 }, 42))
})

test('playback shows every candidate and best-so-far frame without coalescing', async () => {
  const [first, bestSoFar, accepted] = frames()
  const candidate: LiveRun = {
    ...bestSoFar,
    phase: 'candidate',
    neighbor_preview: { arrangement: [], objective: 0, kind: 'candidate' },
  }
  const rendered: LiveRun[] = []
  const playback = createSearchPlayback((frame) => rendered.push(frame), 0)
  const displayed = [
    first,
    bestSoFar,
    candidate,
    { ...candidate, neighbors_evaluated: 20 },
    accepted,
  ].map((frame) => playback.push(frame))
  await Promise.all(displayed)
  await playback.drain()
  assert.deepEqual(
    rendered.map((frame) => frame.phase),
    ['initial', 'best', 'candidate', 'candidate', 'iteration']
  )
  assert.equal(rendered[3].neighbors_evaluated, 20)
  playback.dispose()
})

test('stochastic accepts an improving choice below the scanned maximum', () => {
  const update = initial()
  update.config!.vehicles.push({ ...update.config!.vehicles[1], id: 'c', shipping_fee: 20 })
  const first = advanceLiveRun(null, { ...update, variant: 'stochastic' }, 42)
  const highest = advanceLiveRun(first, best(), 42)
  const accepted = advanceLiveRun(
    highest,
    {
      ...best(),
      phase: 'iteration',
      objective: 20,
      current_objective: 20,
      arrangement: [{ ...best().arrangement[0], vehicle_id: 'c' }],
    },
    42
  )
  assert.equal(accepted.objective, 20)
  assert.equal(accepted.arrangement[0].vehicle_id, 'c')
})

test('restart resets the current state while retaining correct before/after replay', () => {
  const first = advanceLiveRun(null, { ...initial(), variant: 'random_restart' }, 42)
  const highest = advanceLiveRun(first, best(), 42)
  const committed = advanceLiveRun(
    highest,
    { ...best(), phase: 'iteration', current_objective: 30 },
    42
  )
  const restarted = advanceLiveRun(
    committed,
    { ...initial(), phase: 'restart', iteration: 1, restarts_completed: 1 },
    42
  )
  const nextBest = advanceLiveRun(restarted, { ...best(), iteration: 2, restarts_completed: 1 }, 42)
  const next = advanceLiveRun(
    nextBest,
    { ...best(), phase: 'iteration', iteration: 2, current_objective: 30, restarts_completed: 1 },
    42
  )
  assert.equal(next.restarts_completed, 1)
  assert.deepEqual(
    next.objective_history.map((point) => point.objective),
    [10, 30, 10, 30]
  )
  const replay = compareIteration(
    next.initial_arrangement,
    next.initial_objective,
    next.iteration_changes,
    2
  )
  assert(replay)
  assert.equal(replay.before[0].vehicle_id, 'a')
  assert.equal(replay.after[0].vehicle_id, 'b')
  assert.equal(next.iteration_changes.filter((change) => change.kind !== 'restart').length, 2)
})

test('sideways replay distinguishes equal scores from identical arrangements', () => {
  const update = initial()
  update.config!.vehicles[1].shipping_fee = 10
  const first = advanceLiveRun(null, { ...update, variant: 'sideways' }, 42)
  const next = advanceLiveRun(
    first,
    { ...best(), phase: 'iteration', objective: 10, current_objective: 10, sideways_moves: 1 },
    42
  )
  const replay = compareIteration(
    next.initial_arrangement,
    next.initial_objective,
    next.iteration_changes,
    1
  )
  assert.equal(next.sideways_moves, 1)
  assert.equal(replay?.state_changed, true)
  assert.equal(replay?.before_objective, replay?.after_objective)
})

test('rejects malformed, regressing, or out-of-order updates', () => {
  assert.throws(() => parseProgress({ ...best(), runtime_ms: -1 }))
  assert.throws(() => parseProgress({ ...best(), phase: 'unknown' }))
  assert.throws(() => advanceLiveRun(null, best(), 42))
  const [first, candidate] = frames()
  assert.throws(() => advanceLiveRun(first, { ...best(), iteration: 2 }, 42))
  assert.throws(() => advanceLiveRun(candidate, { ...best(), objective: 20 }, 42))
  assert.throws(() =>
    advanceLiveRun(
      candidate,
      { ...best(), phase: 'iteration', current_objective: 20, objective: 20 },
      42
    )
  )
})

test('speed changes reschedule the current frame and keep every frame in order', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const [first, candidate] = frames()
  const rendered: LiveRun[] = []
  const playback = createSearchPlayback((frame) => rendered.push(frame))
  const firstDone = playback.push(first)
  const lastDone = playback.push(candidate)
  playback.setSpeed(8)
  context.mock.timers.tick(60)
  await firstDone
  assert.equal(rendered.length, 2)
  playback.setSpeed(0.25)
  context.mock.timers.tick(100)
  let finished = false
  void lastDone.then(() => {
    finished = true
  })
  await Promise.resolve()
  assert.equal(finished, false)
  playback.setSpeed(8)
  context.mock.timers.tick(60)
  await lastDone
  assert.equal(finished, true)
  assert.throws(() => playback.setSpeed(0))
  playback.dispose()
})

test('playback retains a long sequence and disposal releases pending acknowledgements', async () => {
  const [first, , accepted] = frames()
  const rendered: LiveRun[] = []
  const playback = createSearchPlayback((frame) => rendered.push(frame), 0)
  void playback.push(first)
  for (let iteration = 1; iteration <= 30; iteration++)
    void playback.push({ ...accepted, iteration })
  await playback.drain()
  assert.deepEqual(
    rendered.slice(1).map((frame) => frame.iteration),
    Array.from({ length: 30 }, (_, index) => index + 1)
  )
  const current = playback.push(first)
  const pending = playback.push(accepted)
  playback.dispose()
  await Promise.all([current, pending, playback.drain()])
  assert.equal(rendered.at(-1)?.phase, 'initial')
})
