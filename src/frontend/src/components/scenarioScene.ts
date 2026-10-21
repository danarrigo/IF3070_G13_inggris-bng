import * as THREE from 'three'
import type { Config, Vehicle } from '../types/config.ts'

export interface VehicleLayout {
  vehicle: Vehicle
  index: number
  placed: boolean
  x: number
  z: number
  length: number
  width: number
}

export function layoutVehicles(config: Config): VehicleLayout[] {
  if (![config.ship.length, config.ship.width].every(value => Number.isFinite(value) && value > 0)) return []
  const scale = 18 / Math.max(config.ship.length, config.ship.width)
  const length = config.ship.length * scale
  const width = config.ship.width * scale
  let cursor = 0
  let rowOffset = 0
  let rowWidth = 0
  return config.vehicles.flatMap<VehicleLayout>((vehicle, index) => {
    if (![vehicle.length, vehicle.width].every(value => Number.isFinite(value) && value > 0)) return []
    const vehicleLength = vehicle.length * scale
    const vehicleWidth = vehicle.width * scale
    const placed = vehicle.x !== null && vehicle.y !== null
      && Number.isFinite(vehicle.x) && Number.isFinite(vehicle.y)
    if (placed) {
      return [{ vehicle, index, placed, length: vehicleLength, width: vehicleWidth,
        x: -length / 2 + (vehicle.y! + vehicle.length / 2) * scale,
        z: -width / 2 + (vehicle.x! + vehicle.width / 2) * scale }]
    }
    if (cursor > 0 && cursor + vehicleLength > length) {
      cursor = 0
      rowOffset += rowWidth + .35
      rowWidth = 0
    }
    const layout = { vehicle, index, placed, length: vehicleLength, width: vehicleWidth,
      x: length / 2 - cursor - vehicleLength / 2,
      z: width / 2 + 1.1 + rowOffset + vehicleWidth / 2 }
    cursor += vehicleLength + .3
    rowWidth = Math.max(rowWidth, vehicleWidth)
    return [layout]
  })
}

export function disposeScenario(group: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  group.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      geometries.add(object.geometry)
      const surfaces = Array.isArray(object.material) ? object.material : [object.material]
      surfaces.forEach(surface => materials.add(surface))
    }
    if (object instanceof THREE.InstancedMesh) object.dispose()
  })
  geometries.forEach(geometry => geometry.dispose())
  materials.forEach(surface => surface.dispose())
}

export function buildScenario(config: Config): THREE.Group {
  const group = new THREE.Group()
  if (![config.ship.length, config.ship.width].every(value => Number.isFinite(value) && value > 0)) return group
  const scale = 18 / Math.max(config.ship.length, config.ship.width)
  const length = config.ship.length * scale
  const width = config.ship.width * scale
  const hullHeight = Math.max(.35, Math.min(1.25, width * .15))
  const deckY = hullHeight + .08
  const hullMaterial = new THREE.MeshStandardMaterial({ color: 0x29383b, roughness: .7, metalness: .15 })
  const deckMaterial = new THREE.MeshStandardMaterial({ color: 0xa2aca0, roughness: .9 })
  const white = new THREE.MeshStandardMaterial({ color: 0xe5e5db, roughness: .75 })
  const glass = new THREE.MeshStandardMaterial({ color: 0x334c57, roughness: .3, metalness: .2 })
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x29312f, roughness: .85 })
  const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0x925c47, roughness: .8 })
  const batches = new Map<THREE.Material, THREE.Matrix4[]>()
  function box(l: number, h: number, w: number, x: number, y: number, z: number, material: THREE.Material) {
    const transforms = batches.get(material) ?? []
    transforms.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(l, h, w)))
    batches.set(material, transforms)
  }

  // The full rectangular loading grid fits inside the hull, clear of bow and bridge.
  const bow = Math.max(.6, Math.min(2, width * .3))
  const stern = Math.max(.5, Math.min(1.8, length * .1))
  const margin = Math.min(.25, width * .08)
  const outline = new THREE.Shape()
  outline.moveTo(-length / 2 - stern, -width / 2 - margin)
  outline.lineTo(length / 2, -width / 2 - margin)
  outline.quadraticCurveTo(length / 2 + bow, -width / 2, length / 2 + bow, 0)
  outline.quadraticCurveTo(length / 2 + bow, width / 2, length / 2, width / 2 + margin)
  outline.lineTo(-length / 2 - stern, width / 2 + margin)
  outline.closePath()
  const hullGeometry = new THREE.ExtrudeGeometry(outline, { depth: hullHeight, bevelEnabled: false, curveSegments: 20 })
  hullGeometry.rotateX(-Math.PI / 2)
  const hull = new THREE.Mesh(hullGeometry, hullMaterial)
  hull.castShadow = true
  hull.receiveShadow = true
  group.add(hull)
  const stripe = new THREE.Mesh(hullGeometry, stripeMaterial)
  stripe.scale.set(1.001, .16, 1.001)
  group.add(stripe)
  const deckGeometry = new THREE.ShapeGeometry(outline)
  deckGeometry.rotateX(-Math.PI / 2)
  const deck = new THREE.Mesh(deckGeometry, deckMaterial)
  deck.position.y = deckY
  deck.receiveShadow = true
  group.add(deck)

  const bridgeWidth = Math.min(width * .8, 2.6)
  const bridgeHeight = Math.min(1.8, Math.max(.4, width * .3))
  const bridgeX = -length / 2 - stern / 2
  box(stern * .7, bridgeHeight, bridgeWidth, bridgeX, deckY + bridgeHeight / 2, 0, white)
  box(stern * .82, bridgeHeight * .2, bridgeWidth * 1.05, bridgeX, deckY + bridgeHeight * .85, 0, glass)
  box(stern * .9, .08, bridgeWidth * 1.12, bridgeX, deckY + bridgeHeight + .04, 0, white)
  box(.04, .8, .04, bridgeX, deckY + bridgeHeight + .4, 0, white)

  // Lines use the same X/Y origin and cell sizes as the 2D arrangement.
  const vertices: number[] = []
  const addLine = (x1: number, z1: number, x2: number, z2: number) => vertices.push(x1, deckY + .006, z1, x2, deckY + .006, z2)
  // Cap interior line density for very large configs; exact deck dimensions remain unchanged.
  const xStep = Math.max(1, Math.ceil(config.ship.width / 100))
  const yStep = Math.max(1, Math.ceil(config.ship.length / 100))
  for (let x = 0; x < config.ship.width; x += xStep) addLine(-length / 2, -width / 2 + x * scale, length / 2, -width / 2 + x * scale)
  for (let y = 0; y < config.ship.length; y += yStep) addLine(-length / 2 + y * scale, -width / 2, -length / 2 + y * scale, width / 2)
  addLine(-length / 2, width / 2, length / 2, width / 2)
  addLine(length / 2, -width / 2, length / 2, width / 2)
  const gridGeometry = new THREE.BufferGeometry()
  gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  group.add(new THREE.LineSegments(gridGeometry, new THREE.LineBasicMaterial({ color: 0xc5cfbe, transparent: true, opacity: .5 })))

  const wheelTransforms: THREE.Matrix4[] = []
  const palette = new Map<number, THREE.Material>()
  const layouts = layoutVehicles(config)
  for (const layout of layouts) {
    const { length: l, width: w, x, z, index } = layout
    const baseY = layout.placed ? deckY + .02 : .02
    const radius = Math.min(l * .1, w * .18)
    const height = Math.min(l * .25, w * .65)
    const hue = (index * 67 + 165) % 360
    let paint = palette.get(hue)
    if (!paint) {
      paint = new THREE.MeshStandardMaterial({ color: new THREE.Color(`hsl(${hue}, 45%, 35%)`), roughness: .4, metalness: .2 })
      palette.set(hue, paint)
    }
    box(l * .96, height * .43, w * .84, x, baseY + radius + height * .16, z, paint)
    box(l * .48, height * .42, w * .7, x - l * .04, baseY + radius + height * .56, z, paint)
    box(l * .3, height * .22, w * .715, x - l * .025, baseY + radius + height * .58, z, glass)
    box(l * .025, height * .12, w * .18, x + l * .48, baseY + radius + height * .13, z - w * .25, white)
    box(l * .025, height * .12, w * .18, x + l * .48, baseY + radius + height * .13, z + w * .25, white)
    for (const axle of [-1, 1]) {
      for (const side of [-1, 1]) {
        wheelTransforms.push(new THREE.Matrix4().compose(
          new THREE.Vector3(x + axle * l * .3, baseY + radius, z + side * w * .44),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
          new THREE.Vector3(radius, w * .12, radius),
        ))
      }
    }
  }
  if (wheelTransforms.length > 0) {
    const wheels = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10), wheelMaterial, wheelTransforms.length)
    wheelTransforms.forEach((transform, index) => wheels.setMatrixAt(index, transform))
    wheels.castShadow = true
    group.add(wheels)
  } else {
    wheelMaterial.dispose()
  }

  // A neutral staging pad makes it explicit these vehicles are not loaded.
  const staged = layouts.filter(layout => !layout.placed)
  if (staged.length > 0) {
    const minX = Math.min(...staged.map(item => item.x - item.length / 2))
    const maxX = Math.max(...staged.map(item => item.x + item.length / 2))
    const minZ = Math.min(...staged.map(item => item.z - item.width / 2))
    const maxZ = Math.max(...staged.map(item => item.z + item.width / 2))
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX + .6, maxZ - minZ + .6), new THREE.MeshStandardMaterial({ color: 0xdce1d8, roughness: 1 }))
    pad.rotation.x = -Math.PI / 2
    pad.position.set((minX + maxX) / 2, -.005, (minZ + maxZ) / 2)
    pad.receiveShadow = true
    group.add(pad)
  }

  const cube = new THREE.BoxGeometry(1, 1, 1)
  batches.forEach((transforms, surface) => {
    const mesh = new THREE.InstancedMesh(cube, surface, transforms.length)
    transforms.forEach((transform, index) => mesh.setMatrixAt(index, transform))
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  })
  return group
}
