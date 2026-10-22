import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Config } from '../types/config'
import { buildScenario, disposeScenario } from './scenarioScene'
import { createSceneTransition } from './sceneTransition'

function ShipBackground({
  config,
  candidate = null,
  animate = false,
  transitionDuration = 550,
}: {
  config: Config
  candidate?: Config | null
  animate?: boolean
  transitionDuration?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef({ config, candidate, animate, transitionDuration })
  const updateRef = useRef<
    ((next: Config, preview: Config | null, animate: boolean, duration: number) => void) | null
  >(null)

  useEffect(() => {
    inputRef.current = { config, candidate, animate, transitionDuration }
    updateRef.current?.(config, candidate, animate, transitionDuration)
  }, [config, candidate, animate, transitionDuration])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      // Configuration remains usable on devices without WebGL.
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 150)
    camera.position.set(21, 19, 29)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.enablePan = false
    controls.enableZoom = false
    controls.rotateSpeed = 0.55
    controls.minPolarAngle = Math.PI / 6
    controls.maxPolarAngle = Math.PI * 0.48
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a969e, 3))
    const sun = new THREE.DirectionalLight(0xfff6e7, 5)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.normalBias = 0.04
    scene.add(sun)
    const fill = new THREE.DirectionalLight(0xe1efff, 2)
    fill.position.set(10, 5, -12)
    scene.add(fill)

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ color: 0x263b42, opacity: 0.12 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.04
    ground.receiveShadow = true
    scene.add(ground)
    let scenario = new THREE.Group()
    let ghost = new THREE.Group()
    scene.add(scenario, ghost)
    let renderedConfig: Config | null = null
    let renderedCandidate: Config | null = null
    let transition: ((fraction: number) => void) | null = null
    let transitionStarted = 0
    let duration = inputRef.current.transitionDuration
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let needsRender = true
    function invalidate() {
      needsRender = true
    }
    controls.addEventListener('change', invalidate)

    function fitScene() {
      const bounds = new THREE.Box3().setFromObject(scenario)
      if (bounds.isEmpty()) return
      const sphere = bounds.getBoundingSphere(new THREE.Sphere())
      const radius = Math.max(1, sphere.radius)
      const center = sphere.center
      const direction = camera.position.clone().sub(controls.target).normalize()
      const distance =
        ((radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.05) /
        Math.min(1, camera.aspect)
      controls.target.copy(center)
      camera.position.copy(center).addScaledVector(direction, distance)
      camera.far = Math.max(150, distance * 5)
      camera.updateProjectionMatrix()
      controls.update()
      ground.scale.setScalar(Math.max(1, radius / 50))
      ground.position.x = center.x
      ground.position.z = center.z
      sun.position.copy(center).add(new THREE.Vector3(-radius, radius * 2, radius))
      sun.target.position.copy(center)
      sun.target.updateMatrixWorld()
      sun.shadow.camera.left = -radius * 1.5
      sun.shadow.camera.right = radius * 1.5
      sun.shadow.camera.top = radius * 1.5
      sun.shadow.camera.bottom = -radius * 1.5
      sun.shadow.camera.far = radius * 6
      sun.shadow.camera.updateProjectionMatrix()
      needsRender = true
    }

    function resize() {
      const width = Math.max(1, container!.clientWidth)
      const height = Math.max(1, container!.clientHeight)
      renderer.setSize(width, height)
      camera.aspect = width / height
      camera.fov = width < 760 ? 38 : 35
      camera.setViewOffset(width, height, width < 760 ? 0 : -width * 0.18, 0, width, height)
      camera.updateProjectionMatrix()
      fitScene()
      needsRender = true
    }
    updateRef.current = (next, preview, animate, nextDuration) => {
      if (transition && nextDuration !== duration) {
        const now = performance.now()
        transitionStarted = now - ((now - transitionStarted) * nextDuration) / duration
      }
      duration = nextDuration
      const changed = renderedConfig !== next
      if (changed) {
        const compatible =
          renderedConfig !== null &&
          renderedConfig.ship.length === next.ship.length &&
          renderedConfig.ship.width === next.ship.width &&
          renderedConfig.vehicles.length === next.vehicles.length &&
          next.vehicles.every((vehicle, index) => {
            const before = renderedConfig!.vehicles[index]
            return (
              vehicle.id === before.id &&
              Math.max(vehicle.length, vehicle.width) === Math.max(before.length, before.width) &&
              Math.min(vehicle.length, vehicle.width) === Math.min(before.length, before.width)
            )
          })
        const updated = buildScenario(next)
        transition =
          animate && compatible && !reducedMotion.matches
            ? createSceneTransition(scenario, updated)
            : null
        transitionStarted = performance.now()
        scene.remove(scenario)
        disposeScenario(scenario)
        scenario = updated
        scene.add(scenario)
        renderedConfig = next
        if (!animate || !compatible) fitScene()
      }
      if (!animate && transition) {
        transition(1)
        transition = null
      }
      if (changed || preview !== renderedCandidate) {
        scene.remove(ghost)
        disposeScenario(ghost)
        const current = new Map(next.vehicles.map((vehicle) => [vehicle.id, vehicle]))
        const ids = new Set(
          preview?.vehicles
            .filter((vehicle) => {
              const before = current.get(vehicle.id)
              return (
                !before ||
                vehicle.x !== before.x ||
                vehicle.y !== before.y ||
                vehicle.length !== before.length ||
                vehicle.width !== before.width
              )
            })
            .map((vehicle) => vehicle.id)
        )
        ghost = preview
          ? buildScenario(preview, { vehiclesOnly: true, vehicleIds: ids, ghost: true })
          : new THREE.Group()
        scene.add(ghost)
        renderedCandidate = preview
      }
      needsRender = true
    }
    resize()
    updateRef.current(
      inputRef.current.config,
      inputRef.current.candidate,
      inputRef.current.animate,
      inputRef.current.transitionDuration
    )
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    function motionPreferenceChanged() {
      controls.enableDamping = !reducedMotion.matches
      if (reducedMotion.matches && transition) {
        transition(1)
        transition = null
      }
      needsRender = true
    }
    motionPreferenceChanged()
    reducedMotion.addEventListener('change', motionPreferenceChanged)
    function visibility() {
      needsRender = true
    }
    document.addEventListener('visibilitychange', visibility)
    let frame = 0
    function render(time: number) {
      frame = requestAnimationFrame(render)
      if (document.hidden) return
      controls.update()
      if (transition) {
        const fraction = (time - transitionStarted) / duration
        transition(fraction)
        if (fraction >= 1) transition = null
        needsRender = true
      }
      if (!needsRender) return
      needsRender = false
      renderer.render(scene, camera)
    }
    frame = requestAnimationFrame(render)
    return () => {
      updateRef.current = null
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.removeEventListener('change', invalidate)
      controls.dispose()
      document.removeEventListener('visibilitychange', visibility)
      reducedMotion.removeEventListener('change', motionPreferenceChanged)
      disposeScenario(scenario)
      disposeScenario(ghost)
      ground.geometry.dispose()
      ground.material.dispose()
      sun.shadow.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div className="ship-background" ref={containerRef} aria-hidden="true" />
}

export default ShipBackground
