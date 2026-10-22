import * as THREE from 'three'
import type { Config, Vehicle } from '../types/config.ts'
import { vehicleColor } from './runView.ts'

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
  if (
    ![config.ship.length, config.ship.width].every((value) => Number.isFinite(value) && value > 0)
  )
    return []
  const scale = 18 / Math.max(config.ship.length, config.ship.width)
  const length = config.ship.length * scale
  const width = config.ship.width * scale
  let cursor = 0
  let rowOffset = 0
  let rowWidth = 0
  return config.vehicles.flatMap<VehicleLayout>((vehicle, index) => {
    if (![vehicle.length, vehicle.width].every((value) => Number.isFinite(value) && value > 0))
      return []
    const vehicleLength = vehicle.length * scale
    const vehicleWidth = vehicle.width * scale
    const placed =
      vehicle.x !== null &&
      vehicle.y !== null &&
      Number.isFinite(vehicle.x) &&
      Number.isFinite(vehicle.y)
    if (placed) {
      return [
        {
          vehicle,
          index,
          placed,
          length: vehicleLength,
          width: vehicleWidth,
          x: -length / 2 + (vehicle.y! + vehicle.length / 2) * scale,
          z: -width / 2 + (vehicle.x! + vehicle.width / 2) * scale,
        },
      ]
    }
    if (cursor > 0 && cursor + vehicleLength > length) {
      cursor = 0
      rowOffset += rowWidth + 0.35
      rowWidth = 0
    }
    const layout = {
      vehicle,
      index,
      placed,
      length: vehicleLength,
      width: vehicleWidth,
      x: length / 2 - cursor - vehicleLength / 2,
      z: width / 2 + 1.1 + rowOffset + vehicleWidth / 2,
    }
    cursor += vehicleLength + 0.3
    rowWidth = Math.max(rowWidth, vehicleWidth)
    return [layout]
  })
}

export function disposeScenario(group: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  group.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      geometries.add(object.geometry)
      const surfaces = Array.isArray(object.material) ? object.material : [object.material]
      surfaces.forEach((surface) => materials.add(surface))
    }
    if (object instanceof THREE.InstancedMesh) object.dispose()
  })
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((surface) => surface.dispose())
}

export function buildScenario(
  config: Config,
  options: {
    vehiclesOnly?: boolean
    vehicleIds?: ReadonlySet<string>
    ghost?: boolean
  } = {}
): THREE.Group {
  const group = new THREE.Group()
  group.name = options.ghost ? 'candidate-preview' : 'scenario'
  if (
    ![config.ship.length, config.ship.width].every(
      (value) => Number.isFinite(value) && value > 0
    ) ||
    (options.vehiclesOnly && options.vehicleIds?.size === 0)
  )
    return group
  const scale = 18 / Math.max(config.ship.length, config.ship.width)
  const length = config.ship.length * scale
  const width = config.ship.width * scale
  const hullHeight = Math.max(0.35, Math.min(1.25, width * 0.15))
  const deckY = hullHeight + 0.08
  const surfaces: THREE.Material[] = []
  const used = new Set<THREE.Material>()
  function material(name: string, color: THREE.ColorRepresentation, roughness = 0.7) {
    const surface = new THREE.MeshStandardMaterial({
      color: options.ghost ? 0xd4a556 : color,
      roughness,
      metalness: 0.15,
      transparent: options.ghost ?? false,
      opacity: options.ghost ? 0.6 : 1,
      wireframe: options.ghost ?? false,
      depthWrite: !options.ghost,
    })
    surface.name = name
    surfaces.push(surface)
    return surface
  }
  const white = material('structure-white', 0xe5e5db)
  const glass = material('glass', 0x334c57, 0.3)
  const wheelMaterial = material('wheels', 0x29312f, 0.85)
  const batches = new Map<THREE.Material, THREE.Matrix4[]>()
  function box(
    l: number,
    h: number,
    w: number,
    x: number,
    y: number,
    z: number,
    surface: THREE.Material,
    origin?: THREE.Matrix4
  ) {
    const transforms = batches.get(surface) ?? []
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion(),
      new THREE.Vector3(l, h, w)
    )
    if (origin) transform.premultiply(origin)
    transforms.push(transform)
    batches.set(surface, transforms)
  }

  if (!options.vehiclesOnly) {
    const bow = Math.max(0.6, Math.min(2, width * 0.3))
    const stern = Math.max(0.5, Math.min(1.8, length * 0.1))
    const margin = Math.min(0.25, width * 0.08)
    const outline = new THREE.Shape()
    outline.moveTo(-length / 2 - stern, -width / 2 - margin)
    outline.lineTo(length / 2, -width / 2 - margin)
    outline.quadraticCurveTo(length / 2 + bow, -width / 2, length / 2 + bow, 0)
    outline.quadraticCurveTo(length / 2 + bow, width / 2, length / 2, width / 2 + margin)
    outline.lineTo(-length / 2 - stern, width / 2 + margin)
    outline.closePath()
    const hullGeometry = new THREE.ExtrudeGeometry(outline, {
      depth: hullHeight,
      bevelEnabled: false,
      curveSegments: 20,
    })
    hullGeometry.rotateX(-Math.PI / 2)
    const hullSurface = material('hull', 0x29383b)
    used.add(hullSurface)
    const hull = new THREE.Mesh(hullGeometry, hullSurface)
    hull.castShadow = true
    hull.receiveShadow = true
    group.add(hull)
    const stripeSurface = material('stripe', 0x925c47)
    used.add(stripeSurface)
    const stripe = new THREE.Mesh(hullGeometry, stripeSurface)
    stripe.scale.set(1.001, 0.16, 1.001)
    group.add(stripe)
    const deckGeometry = new THREE.ShapeGeometry(outline)
    deckGeometry.rotateX(-Math.PI / 2)
    const deckSurface = material('deck', 0xa2aca0, 0.9)
    used.add(deckSurface)
    const deck = new THREE.Mesh(deckGeometry, deckSurface)
    deck.position.y = deckY
    deck.receiveShadow = true
    group.add(deck)

    const bridgeWidth = Math.min(width * 0.8, 2.6)
    const bridgeHeight = Math.min(1.8, Math.max(0.4, width * 0.3))
    const bridgeX = -length / 2 - stern / 2
    box(stern * 0.7, bridgeHeight, bridgeWidth, bridgeX, deckY + bridgeHeight / 2, 0, white)
    box(
      stern * 0.82,
      bridgeHeight * 0.2,
      bridgeWidth * 1.05,
      bridgeX,
      deckY + bridgeHeight * 0.85,
      0,
      glass
    )
    box(stern * 0.9, 0.08, bridgeWidth * 1.12, bridgeX, deckY + bridgeHeight + 0.04, 0, white)
    box(0.04, 0.8, 0.04, bridgeX, deckY + bridgeHeight + 0.4, 0, white)

    const vertices: number[] = []
    const addLine = (x1: number, z1: number, x2: number, z2: number) =>
      vertices.push(x1, deckY + 0.006, z1, x2, deckY + 0.006, z2)
    const xStep = Math.max(1, Math.ceil(config.ship.width / 100))
    const yStep = Math.max(1, Math.ceil(config.ship.length / 100))
    for (let x = 0; x < config.ship.width; x += xStep)
      addLine(-length / 2, -width / 2 + x * scale, length / 2, -width / 2 + x * scale)
    for (let y = 0; y < config.ship.length; y += yStep)
      addLine(-length / 2 + y * scale, -width / 2, -length / 2 + y * scale, width / 2)
    addLine(-length / 2, width / 2, length / 2, width / 2)
    addLine(length / 2, -width / 2, length / 2, width / 2)
    const gridGeometry = new THREE.BufferGeometry()
    gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    group.add(
      new THREE.LineSegments(
        gridGeometry,
        new THREE.LineBasicMaterial({ color: 0xc5cfbe, transparent: true, opacity: 0.5 })
      )
    )
  }

  const wheelTransforms: THREE.Matrix4[] = []
  const palette = new Map<string, THREE.Material>()
  const layouts = layoutVehicles(config)
  for (const layout of layouts) {
    if (options.vehicleIds && !options.vehicleIds.has(layout.vehicle.id)) continue
    const l = Math.max(layout.length, layout.width)
    const w = Math.min(layout.length, layout.width)
    const baseY = layout.placed ? deckY + 0.02 : 0.02
    const angle = layout.length >= layout.width ? 0 : Math.PI / 2
    const origin = new THREE.Matrix4()
      .makeTranslation(layout.x, baseY, layout.z)
      .multiply(new THREE.Matrix4().makeRotationY(angle))
    const radius = Math.min(l * 0.1, w * 0.18)
    const height = Math.min(l * 0.25, w * 0.65)
    const color = vehicleColor(layout.vehicle.id)
    let paint = palette.get(color)
    if (!paint) {
      paint = material(`paint-${color}`, new THREE.Color(color), 0.4)
      palette.set(color, paint)
    }
    box(l * 0.96, height * 0.43, w * 0.84, 0, radius + height * 0.16, 0, paint, origin)
    box(l * 0.48, height * 0.42, w * 0.7, -l * 0.04, radius + height * 0.56, 0, paint, origin)
    box(l * 0.3, height * 0.22, w * 0.715, -l * 0.025, radius + height * 0.58, 0, glass, origin)
    box(
      l * 0.025,
      height * 0.12,
      w * 0.18,
      l * 0.48,
      radius + height * 0.13,
      -w * 0.25,
      white,
      origin
    )
    box(
      l * 0.025,
      height * 0.12,
      w * 0.18,
      l * 0.48,
      radius + height * 0.13,
      w * 0.25,
      white,
      origin
    )
    for (const axle of [-1, 1]) {
      for (const side of [-1, 1]) {
        wheelTransforms.push(
          new THREE.Matrix4()
            .compose(
              new THREE.Vector3(axle * l * 0.3, radius, side * w * 0.44),
              new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
              new THREE.Vector3(radius, w * 0.12, radius)
            )
            .premultiply(origin)
        )
      }
    }
  }
  if (wheelTransforms.length > 0) {
    used.add(wheelMaterial)
    const wheels = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(1, 1, 1, 10),
      wheelMaterial,
      wheelTransforms.length
    )
    wheels.name = 'wheels'
    wheelTransforms.forEach((transform, index) => wheels.setMatrixAt(index, transform))
    wheels.castShadow = !options.ghost
    wheels.frustumCulled = false
    wheels.renderOrder = options.ghost ? 2 : 0
    group.add(wheels)
  }

  const staged = layouts.filter((layout) => !layout.placed)
  if (!options.vehiclesOnly && staged.length > 0) {
    const minX = Math.min(...staged.map((item) => item.x - item.length / 2))
    const maxX = Math.max(...staged.map((item) => item.x + item.length / 2))
    const minZ = Math.min(...staged.map((item) => item.z - item.width / 2))
    const maxZ = Math.max(...staged.map((item) => item.z + item.width / 2))
    const padSurface = material('staging-pad', 0xdce1d8, 1)
    used.add(padSurface)
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(maxX - minX + 0.6, maxZ - minZ + 0.6),
      padSurface
    )
    pad.rotation.x = -Math.PI / 2
    pad.position.set((minX + maxX) / 2, -0.005, (minZ + maxZ) / 2)
    pad.receiveShadow = true
    group.add(pad)
  }

  if (batches.size > 0) {
    const cube = new THREE.BoxGeometry(1, 1, 1)
    batches.forEach((transforms, surface) => {
      used.add(surface)
      const mesh = new THREE.InstancedMesh(cube, surface, transforms.length)
      mesh.name = surface.name
      transforms.forEach((transform, index) => mesh.setMatrixAt(index, transform))
      mesh.castShadow = !options.ghost
      mesh.receiveShadow = !options.ghost
      mesh.frustumCulled = false
      mesh.renderOrder = options.ghost ? 2 : 0
      group.add(mesh)
    })
  }
  surfaces.forEach((surface) => {
    if (!used.has(surface)) surface.dispose()
  })
  return group
}
