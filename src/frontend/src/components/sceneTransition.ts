import * as THREE from 'three'

export function createSceneTransition(previous: THREE.Group, next: THREE.Group) {
  const bindings: {
    mesh: THREE.InstancedMesh
    index: number
    fromPosition: THREE.Vector3
    toPosition: THREE.Vector3
    fromRotation: THREE.Quaternion
    toRotation: THREE.Quaternion
    fromScale: THREE.Vector3
    toScale: THREE.Vector3
    target: THREE.Matrix4
  }[] = []
  const affected = new Set<THREE.InstancedMesh>()
  const matrix = new THREE.Matrix4()
  next.traverse((object) => {
    if (!(object instanceof THREE.InstancedMesh)) return
    const before = previous.getObjectByName(object.name)
    if (!(before instanceof THREE.InstancedMesh) || before.count !== object.count) return
    for (let index = 0; index < object.count; index++) {
      const target = new THREE.Matrix4()
      object.getMatrixAt(index, target)
      before.getMatrixAt(index, matrix)
      if (matrix.equals(target)) continue
      const fromPosition = new THREE.Vector3(),
        toPosition = new THREE.Vector3()
      const fromRotation = new THREE.Quaternion(),
        toRotation = new THREE.Quaternion()
      const fromScale = new THREE.Vector3(),
        toScale = new THREE.Vector3()
      matrix.decompose(fromPosition, fromRotation, fromScale)
      target.decompose(toPosition, toRotation, toScale)
      bindings.push({
        mesh: object,
        index,
        fromPosition,
        toPosition,
        fromRotation,
        toRotation,
        fromScale,
        toScale,
        target,
      })
      object.setMatrixAt(index, matrix)
      affected.add(object)
    }
    object.instanceMatrix.needsUpdate = true
  })
  if (bindings.length === 0) return null
  const position = new THREE.Vector3(),
    scale = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  return (fraction: number) => {
    const t = Math.max(0, Math.min(1, fraction))
    const eased = 1 - (1 - t) ** 3
    for (const item of bindings) {
      if (t === 1) matrix.copy(item.target)
      else {
        position.lerpVectors(item.fromPosition, item.toPosition, eased)
        scale.lerpVectors(item.fromScale, item.toScale, eased)
        rotation.copy(item.fromRotation).slerp(item.toRotation, eased)
        matrix.compose(position, rotation, scale)
      }
      item.mesh.setMatrixAt(item.index, matrix)
    }
    for (const mesh of affected) {
      mesh.instanceMatrix.needsUpdate = true
      if (t === 1) {
        mesh.computeBoundingBox()
        mesh.computeBoundingSphere()
      }
    }
  }
}
