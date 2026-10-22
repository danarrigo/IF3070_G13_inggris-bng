import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Config } from '../src/types/config.ts'
import { arrangementConfig, vehicleColor } from '../src/components/runView.ts'

test('maps actual placements by ID including rotation and stages absent vehicles without mutating config', () => {
  const config: Config = {
    ship: { length: 10, width: 8, max_weight: 100 }, preserve_positions: false,
    vehicles: ['a', 'b'].map(id => ({ id, length: 4, width: 2, weight: 10,
      eta: 0, shipping_fee: 20, x: 5, y: 5 })),
  }
  const before = JSON.stringify(config)
  const shown = arrangementConfig(config, [{ vehicle_id: 'b', x: 1, y: 2, length: 2, width: 4 }])
  assert.equal(shown.vehicles[0].x, null)
  assert.equal(shown.vehicles[0].y, null)
  assert.deepEqual([shown.vehicles[1].x, shown.vehicles[1].y, shown.vehicles[1].length, shown.vehicles[1].width], [1, 2, 2, 4])
  assert.equal(JSON.stringify(config), before)
  assert.equal(shown.preserve_positions, true)
})

test('colors remain attached to vehicle IDs across arrangements', () => {
  const ids = ['vehicle-a', 'vehicle-b', 'vehicle-c']
  const original = new Map(ids.map(id => [id, vehicleColor(id)]))
  for (const id of ids.toReversed()) assert.equal(vehicleColor(id), original.get(id))
})
