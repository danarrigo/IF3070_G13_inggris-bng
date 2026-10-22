import assert from 'node:assert/strict'
import { test } from 'node:test'
import { objectiveUnit, placementObjective } from '../src/objective.ts'
import { parseConfig } from '../src/api/config.ts'
import { sameConfig, configForPlacements } from '../src/components/runPresentation.ts'
import { arrangementConfig } from '../src/types/run.ts'
import type { Config } from '../src/types/config.ts'

function config(): Config {
  return {
    ship: { length: 1, width: 1, max_weight: 1 },
    preserve_positions: false,
    vehicles: [
      { id: 'a', x: null, y: null, length: 1, width: 1, weight: 1, eta: 10, shipping_fee: 1000 },
      { id: 'b', x: null, y: null, length: 1, width: 1, weight: 1, eta: 0, shipping_fee: 1 },
    ],
  }
}
const urgent = [{ vehicle_id: 'b', x: 0, y: 0, length: 1, width: 1 }]

test('ETA mode displays ETA-only points consistently, including replay', () => {
  const data = config()
  assert.equal(placementObjective(data, urgent), 1)
  assert.equal(objectiveUnit(data), 'million IDR')
  data.objective_mode = 'eta_priority'
  assert.equal(placementObjective(data, urgent), 11)
  assert.equal(placementObjective(data, []), 0)
  assert.equal(objectiveUnit(data), 'ETA priority points')
  data.vehicles[1].shipping_fee = 0
  assert.equal(placementObjective(data, urgent), 11)
  assert.equal(configForPlacements(data, urgent).objective_mode, 'eta_priority')
  assert.equal(arrangementConfig(data, urgent).objective_mode, 'eta_priority')
})

test('config parsing retains the objective and snapshot comparison detects changes', () => {
  const data = config()
  assert(sameConfig(data, { ...data, objective_mode: 'shipping_fee' }))
  const eta = parseConfig({ ...data, objective_mode: 'eta_priority' })
  assert.equal(eta.objective_mode, 'eta_priority')
  assert(!sameConfig(data, eta))
  assert.throws(() => parseConfig({ ...data, objective_mode: 'unknown' }))
})
