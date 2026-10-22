import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as THREE from 'three'
import { buildScenario, disposeScenario, layoutVehicles } from '../src/components/scenarioScene.ts'
import { createSceneTransition } from '../src/components/sceneTransition.ts'
import type { Config } from '../src/types/config.ts'

function config(): Config {
  return {
    ship: { length: 10, width: 10, max_weight: 100 },
    preserve_positions: true,
    vehicles: [{ id: 'a', x: 0, y: 0, length: 4, width: 2, weight: 10, eta: 0, shipping_fee: 10 }],
  }
}

function body(scene: THREE.Group) {
  const mesh = scene.getObjectByName('paint-165')
  assert(mesh instanceof THREE.InstancedMesh)
  return mesh
}

function transform(mesh: THREE.InstancedMesh) {
  const matrix = new THREE.Matrix4()
  mesh.getMatrixAt(0, matrix)
  const position = new THREE.Vector3(),
    scale = new THREE.Vector3(),
    rotation = new THREE.Quaternion()
  matrix.decompose(position, rotation, scale)
  return { matrix, position, scale, rotation }
}

test('moves and rotates cars between actual states without changing their physical dimensions', () => {
  const before = config()
  const after = structuredClone(before)
  Object.assign(after.vehicles[0], { x: 2, y: 3, length: 2, width: 4 })
  const previous = buildScenario(before)
  const next = buildScenario(after)
  const source = transform(body(previous))
  const target = transform(body(next))
  assert(source.scale.distanceTo(target.scale) < 0.00001)
  assert(source.rotation.angleTo(target.rotation) > 1)
  const animate = createSceneTransition(previous, next)
  assert(animate)
  assert(transform(body(next)).matrix.equals(source.matrix))
  animate(0.5)
  const halfway = transform(body(next))
  assert(halfway.position.x > source.position.x && halfway.position.x < target.position.x)
  assert(halfway.rotation.angleTo(source.rotation) > 0)
  assert(halfway.rotation.angleTo(target.rotation) > 0)
  animate(1)
  assert(transform(body(next)).matrix.equals(target.matrix))
  disposeScenario(previous)
  disposeScenario(next)
})

test('unchanged states do not create an animation', () => {
  const previous = buildScenario(config())
  const next = buildScenario(config())
  assert.equal(createSceneTransition(previous, next), null)
  disposeScenario(previous)
  disposeScenario(next)
})

test('ghosts contain only changed cars, keep full staging coordinates, and release shared resources', () => {
  const source = config()
  source.vehicles[0].x = null
  source.vehicles[0].y = null
  source.vehicles.push({ ...source.vehicles[0], id: 'b' })
  const ghost = buildScenario(source, {
    vehiclesOnly: true,
    vehicleIds: new Set(['b']),
    ghost: true,
  })
  assert(ghost.children.every((object) => object instanceof THREE.InstancedMesh))
  const paint = ghost.getObjectByName('paint-232')
  assert(paint instanceof THREE.InstancedMesh)
  const actual = transform(paint).position
  const expected = layoutVehicles(source)[1]
  assert(Math.abs(actual.x - expected.x) < 0.00001)
  assert(Math.abs(actual.z - expected.z) < 0.00001)
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  ghost.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry)
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        assert(material.transparent && !material.depthWrite)
        materials.add(material)
      }
    }
  })
  let disposed = 0
  for (const resource of [...geometries, ...materials])
    resource.addEventListener('dispose', () => {
      disposed++
    })
  disposeScenario(ghost)
  assert.equal(disposed, geometries.size + materials.size)
})
