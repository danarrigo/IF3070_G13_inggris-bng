import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as THREE from 'three'
import type { Config, Vehicle } from '../src/types/config.ts'
import { buildScenario, disposeScenario, layoutVehicles } from '../src/components/scenarioScene.ts'

function vehicle(patch: Partial<Vehicle> = {}): Vehicle {
  return { id: 'vehicle-1', x: null, y: null, length: 4, width: 2, weight: 1000, eta: 0, shipping_fee: 500, ...patch }
}

function config(vehicles: Vehicle[]): Config {
  return { ship: { length: 20, width: 10, max_weight: 10000 }, vehicles }
}

function near(actual: number, expected: number) {
  assert(Math.abs(actual - expected) < 0.00001, `${actual} != ${expected}`)
}

test('maps grid X across the deck and Y along its length without shifting the origin', () => {
  const [first, last] = layoutVehicles(config([
    vehicle({ x: 0, y: 0 }), vehicle({ id: 'vehicle-2', x: 8, y: 16 }),
  ]))
  assert(first.placed && last.placed)
  near(first.x, -7.2)
  near(first.z, -3.6)
  near(last.x + last.length / 2, 9)
  near(last.z + last.width / 2, 4.5)
})

test('uses the same uniform scale for ship and vehicle dimensions', () => {
  const input = config([vehicle({ x: 0, y: 0 })])
  const [before] = layoutVehicles(input)
  input.ship.length *= 2
  input.ship.width *= 2
  const [after] = layoutVehicles(input)
  near(after.length, before.length / 2)
  near(after.width, before.width / 2)
})

test('stages every unplaced or partially positioned vehicle beside the ship without overlap', () => {
  const input = config(Array.from({ length: 20 }, (_, index) => vehicle({ id: String(index), x: index === 0 ? 0 : null })))
  const original = JSON.stringify(input)
  const layouts = layoutVehicles(input)
  assert.equal(layouts.length, 20)
  for (const [index, item] of layouts.entries()) {
    assert.equal(item.placed, false)
    assert(item.z - item.width / 2 > 4.5)
    for (const other of layouts.slice(index + 1)) {
      const overlap = Math.abs(item.x - other.x) < (item.length + other.length) / 2
        && Math.abs(item.z - other.z) < (item.width + other.width) / 2
      assert.equal(overlap, false)
    }
  }
  assert.equal(JSON.stringify(input), original)
})

test('keeps invalid placements visible rather than silently packing or clamping them', () => {
  const [item] = layoutVehicles(config([vehicle({ x: 20, y: 40 })]))
  assert(item.placed)
  assert(item.z > 4.5)
  assert(item.x > 9)
})

test('handles temporarily invalid dimensions while editing', () => {
  const input = config([vehicle()])
  input.ship.length = 0
  assert.deepEqual(layoutVehicles(input), [])
  const scene = buildScenario(input)
  assert.equal(scene.children.length, 0)
  disposeScenario(scene)
})

test('builds finite geometry for empty and populated configs and disposes it', () => {
  for (const input of [config([]), config([vehicle({ x: 0, y: 0 }), vehicle({ id: 'other' })])]) {
    const scene = buildScenario(input)
    const bounds = new THREE.Box3().setFromObject(scene)
    assert(!bounds.isEmpty())
    assert([bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z].every(Number.isFinite))
    disposeScenario(scene)
  }
})
