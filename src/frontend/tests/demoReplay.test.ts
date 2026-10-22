import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DemoStep, DemoTrace } from '../src/types/run.ts'
import { geneParent, pairParents, rouletteSegments, sourcePopulation } from '../src/components/demoReplay.ts'

function demoStep(patch: Partial<DemoStep>): DemoStep {
  return { kind: 'population', generation: 0, pair: null, child: null, message: '',
    individuals: [], parent_ids: [], parents: [], arrangement: null, before: null,
    fitness: [], selected_index: null, draw: null, draw_kind: null, rate: null,
    cut: null, attempt: null, accepted: null, retained_children: [], errors: [],
    changed_vehicle_ids: [], operation: null, ...patch }
}

test('roulette bar follows fitness proportions including zero-weight and uniform fallback', () => {
  const weighted = rouletteSegments([0, 30, 70])
  assert.deepEqual(weighted.map(s => s.probability), [0, .3, .7])
  assert.equal(weighted[2].start, .3)
  assert.equal(weighted[2].end, 1)
  assert.deepEqual(rouletteSegments([0, 0]).map(s => s.probability), [.5, .5])
  assert.deepEqual(rouletteSegments([]), [])
})

test('complementary child genes switch parent at the recorded cut', () => {
  assert.deepEqual([0, 1, 2, 3].map(i => geneParent(i, 2, 1)), [1, 1, 2, 2])
  assert.deepEqual([0, 1, 2, 3].map(i => geneParent(i, 2, 2)), [2, 2, 1, 1])
})

test('replay resolves parents by generation and pair, including retry steps without copied parents', () => {
  const individuals = [{ id: 'G0-I1', fitness: 50, arrangement: [] }]
  const parents = [[], []]
  const trace: DemoTrace = { version: 1, steps: [
    demoStep({ kind: 'population', generation: 0, individuals }),
    demoStep({ kind: 'crossover', generation: 0, pair: 1, parents }),
    demoStep({ kind: 'crossover', generation: 1, pair: 1, parents: [] }),
  ] }
  const step = demoStep({ kind: 'validation', generation: 0, pair: 1 })
  assert.equal(sourcePopulation(trace, step), individuals)
  assert.equal(pairParents(trace, step), parents)
  assert.deepEqual(sourcePopulation(trace, { ...step, generation: 3 }), [])
})
