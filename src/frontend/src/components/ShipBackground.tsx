import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Config } from '../types/config'
import { buildScenario, disposeScenario } from './scenarioScene'

function ShipBackground({ config }: { config: Config }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const configRef = useRef(config)
  const updateRef = useRef<((next: Config) => void) | null>(null)

  useEffect(() => {
    configRef.current = config
    updateRef.current?.(config)
  }, [config])

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
    const camera = new THREE.PerspectiveCamera(35, 1, .1, 150)
    camera.position.set(21, 19, 29)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.enablePan = false
    controls.enableZoom = false
    controls.rotateSpeed = .55
    controls.minPolarAngle = Math.PI / 6
    controls.maxPolarAngle = Math.PI * .48
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a969e, 3))
    const sun = new THREE.DirectionalLight(0xfff6e7, 5)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.normalBias = .04
    scene.add(sun)
    const fill = new THREE.DirectionalLight(0xe1efff, 2)
    fill.position.set(10, 5, -12)
    scene.add(fill)

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ color: 0x263b42, opacity: .12 }))
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -.04
    ground.receiveShadow = true
    scene.add(ground)
    let scenario = new THREE.Group()
    scene.add(scenario)
    let needsRender = true
    function invalidate() { needsRender = true }
    controls.addEventListener('change', invalidate)

    function fitScene() {
      const bounds = new THREE.Box3().setFromObject(scenario)
      if (bounds.isEmpty()) return
      const sphere = bounds.getBoundingSphere(new THREE.Sphere())
      const radius = Math.max(1, sphere.radius)
      const center = sphere.center
      const direction = camera.position.clone().sub(controls.target).normalize()
      const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))
        * 1.05 / Math.min(1, camera.aspect)
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
      camera.setViewOffset(width, height, width < 760 ? 0 : -width * .18, 0, width, height)
      camera.updateProjectionMatrix()
      fitScene()
      needsRender = true
    }
    updateRef.current = (next) => {
      const updated = buildScenario(next)
      scene.remove(scenario)
      disposeScenario(scenario)
      scenario = updated
      scene.add(scenario)
      fitScene()
      needsRender = true
    }
    resize()
    updateRef.current(configRef.current)
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    function motionPreferenceChanged() {
      controls.enableDamping = !reducedMotion.matches
      needsRender = true
    }
    motionPreferenceChanged()
    reducedMotion.addEventListener('change', motionPreferenceChanged)
    function visibility() { needsRender = true }
    document.addEventListener('visibilitychange', visibility)
    let frame = 0
    function render() {
      frame = requestAnimationFrame(render)
      if (document.hidden) return
      controls.update()
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
