import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { useTexture } from '@react-three/drei'
import { createMaterials, PHOTO_TEXTURES, preparePhotoTextures, type PhotoTextures } from './materials'

/** Distance between neighbouring cubie centres. */
const SPACING = 1
/** Solid cubie; the tiny gap reads as a dark seam once AO is applied. */
const CUBIE_SIZE = 0.995
/** Wide, soft bevel like the original; textures keep a smooth frame over it. */
const CUBIE_RADIUS = 0.055

/** One quarter turn, seconds. */
const TURN_DURATION = 0.6
/** Pause between turns, seconds. */
const TURN_PAUSE = 0.25

type Axis = 'x' | 'y' | 'z'
type Move = { axis: Axis; layer: -1 | 0 | 1; dir: 1 | -1 }

const AXES: Axis[] = ['x', 'y', 'z']
const AXIS_VECTORS: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** Snap accumulated float drift back onto the grid after every turn. */
const snapMatrix = new THREE.Matrix4()
function snapCubie(cubie: THREE.Object3D) {
  cubie.position.set(
    Math.round(cubie.position.x / SPACING) * SPACING,
    Math.round(cubie.position.y / SPACING) * SPACING,
    Math.round(cubie.position.z / SPACING) * SPACING,
  )
  snapMatrix.makeRotationFromQuaternion(cubie.quaternion)
  const e = snapMatrix.elements
  for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) e[i] = Math.round(e[i])
  cubie.quaternion.setFromRotationMatrix(snapMatrix)
}

function randomMove(prev: Move | null): Move {
  // Change axis every time so consecutive turns never cancel each other out.
  const axes = prev ? AXES.filter((a) => a !== prev.axis) : AXES
  const axis = axes[Math.floor(Math.random() * axes.length)]
  const layer = ([-1, 0, 1] as const)[Math.floor(Math.random() * 3)]
  const dir = Math.random() < 0.5 ? 1 : -1
  return { axis, layer, dir }
}

type CubeProps = {
  /** Disable layer turns and drift (prefers-reduced-motion). */
  reducedMotion?: boolean
  /** Entrance and turns start only once shaders are compiled. */
  readyRef: RefObject<boolean>
}

export function Cube({ reducedMotion = false, readyRef }: CubeProps) {
  const tiltRef = useRef<THREE.Group>(null)
  const viewport = useThree((s) => s.size)

  // Suspends until every photo map is loaded (covered by <Suspense> above).
  const photo = useTexture(PHOTO_TEXTURES) as PhotoTextures

  const { root, pivot, cubies, dispose } = useMemo(() => {
    preparePhotoTextures(photo)
    const { materials, dispose: disposeMaterials } = createMaterials(photo)
    const geometry = new RoundedBoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE, 6, CUBIE_RADIUS)

    const root = new THREE.Group()
    const pivot = new THREE.Group()
    root.add(pivot)

    // Dark core: blocks light leaking through the seams while a middle slice turns.
    const coreMaterial = new THREE.MeshBasicMaterial({ color: '#000' })
    const core = new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 16), coreMaterial)
    root.add(core)

    const cubies: THREE.Mesh[] = []
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue
          // Every cubie gets its own finish — 26 cubies, 26 materials.
          const cubie = new THREE.Mesh(geometry, materials[cubies.length])
          cubie.position.set(x * SPACING, y * SPACING, z * SPACING)
          cubie.castShadow = true
          cubie.receiveShadow = true
          root.add(cubie)
          cubies.push(cubie)
        }
      }
    }

    return {
      root,
      pivot,
      cubies,
      dispose: () => {
        geometry.dispose()
        core.geometry.dispose()
        coreMaterial.dispose()
        disposeMaterials()
      },
    }
  }, [photo])

  useEffect(() => dispose, [dispose])

  const turn = useRef({
    move: null as Move | null,
    prev: null as Move | null,
    elapsed: 0,
    wait: 0.8, // let the entrance animation play first
    members: [] as THREE.Object3D[],
  })

  const startTurn = (move: Move) => {
    const t = turn.current
    pivot.rotation.set(0, 0, 0)
    pivot.updateMatrixWorld()
    t.members = cubies.filter(
      (c) => Math.round(c.position[move.axis] / SPACING) === move.layer,
    )
    t.members.forEach((c) => pivot.attach(c))
    t.move = move
    t.elapsed = 0
  }

  const finishTurn = () => {
    const t = turn.current
    pivot.updateMatrixWorld()
    t.members.forEach((c) => {
      root.attach(c)
      snapCubie(c)
    })
    pivot.rotation.set(0, 0, 0)
    t.prev = t.move
    t.move = null
    t.members = []
    t.wait = TURN_PAUSE
  }

  // Camera FOV is vertical, so on portrait screens the cube would overflow
  // horizontally. Below ~0.85 aspect, shrink it in proportion to the width.
  const aspect = viewport.width / Math.max(viewport.height, 1)
  const fitScale = Math.min(1, aspect / 0.85)

  const smoothPointer = useRef(new THREE.Vector2())
  const appear = useRef(0)

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 20) // avoid jumps after a hidden tab
    const tilt = tiltRef.current
    if (!tilt) return

    // Entrance: ease from 0.8 → 1 scale.
    if (!readyRef.current) return
    appear.current = Math.min(1, appear.current + delta / 1.4)
    const s = (0.8 + 0.2 * easeInOutCubic(appear.current)) * fitScale
    tilt.scale.setScalar(s)

    // Lean towards the cursor.
    smoothPointer.current.lerp(state.pointer, 1 - Math.exp(-delta * 3))
    // Base pose: classic isometric (35.26° down, 45° around); the cursor
    // leans it a little.
    tilt.rotation.x = 0.6155 - smoothPointer.current.y * 0.2
    tilt.rotation.y = -Math.PI / 4 + smoothPointer.current.x * 0.25

    if (reducedMotion) return

    // Slow free tumble, like the original: two incommensurate rates so the
    // cube keeps showing new faces and angles, plus a gentle roll.
    const time = state.clock.elapsedTime
    root.rotation.x = time * 0.09
    root.rotation.y = time * 0.14
    root.rotation.z = Math.sin(time * 0.11) * 0.35

    // Layer turns.
    const t = turn.current
    if (!t.move) {
      t.wait -= delta
      if (t.wait <= 0) startTurn(randomMove(t.prev))
      return
    }

    t.elapsed += delta
    const progress = Math.min(1, t.elapsed / TURN_DURATION)
    const angle = easeInOutCubic(progress) * (Math.PI / 2) * t.move.dir
    pivot.quaternion.setFromAxisAngle(AXIS_VECTORS[t.move.axis], angle)
    if (progress >= 1) finishTurn()
  })

  return (
    <group ref={tiltRef}>
      <primitive object={root} />
    </group>
  )
}
