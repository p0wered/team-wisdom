import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { useTexture } from '@react-three/drei'
import { createMaterials, PHOTO_TEXTURES, preparePhotoTextures, type FaceName, type PhotoTextures } from './materials'

/** Distance between neighbouring cubie centres. */
const SPACING = 1
/** Nearly solid cubie: the tiny gap reads as a fine dark seam. */
const CUBIE_SIZE = 0.995
/** Small, crisp bevel, like a moulded speed cube. */
const CUBIE_RADIUS = 0.04

/** One quarter turn and the pause after it, seconds — while scrambling… */
const SCRAMBLE_TURN = { duration: 0.6, pause: 0.25 }
/** …and while solving: quicker and more decisive, like a speedcuber. */
const SOLVE_TURN = { duration: 0.38, pause: 0.07 }
/** Quarter turns per scramble. */
const SCRAMBLE_MOVES = 12
/** How long the solved cube is held before the next scramble, seconds. */
const SOLVED_HOLD = 2.6

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
    const materials = createMaterials(photo)
    const geometry = new RoundedBoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE, 6, CUBIE_RADIUS)

    const root = new THREE.Group()
    const pivot = new THREE.Group()
    root.add(pivot)

    // Dark core: blocks light leaking through the seams while a middle slice turns.
    const coreMaterial = new THREE.MeshBasicMaterial({ color: '#000' })
    const core = new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 16), coreMaterial)
    root.add(core)

    // RoundedBoxGeometry keeps BoxGeometry's face groups: +x, −x, +y, −y, +z, −z.
    // Faces on the outside of the cube get their colour; inner faces are body.
    const { faces, body, dispose: disposeMaterials } = materials
    const tile = (c: number, plus: FaceName, minus: FaceName) => [
      c === 1 ? faces[plus] : body,
      c === -1 ? faces[minus] : body,
    ]

    const cubies: THREE.Mesh[] = []
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue
          const cubie = new THREE.Mesh(geometry, [
            ...tile(x, 'right', 'left'),
            ...tile(y, 'up', 'down'),
            ...tile(z, 'front', 'back'),
          ])
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

  /**
   * The loop: start solved, scramble with slow random turns, then play the
   * scramble back in reverse — quickly — until the cube is whole again, hold,
   * repeat. Pieces scatter and come back together: what the product does
   * with people.
   */
  const turn = useRef({
    phase: 'scramble' as 'scramble' | 'solve',
    history: [] as Move[],
    move: null as Move | null,
    prev: null as Move | null,
    elapsed: 0,
    duration: SCRAMBLE_TURN.duration,
    wait: 1.6, // let the entrance play and show the solved cube first
    members: [] as THREE.Object3D[],
  })

  const nextMove = (): Move | null => {
    const t = turn.current
    if (t.phase === 'scramble') {
      if (t.history.length < SCRAMBLE_MOVES) {
        const move = randomMove(t.prev)
        t.history.push(move)
        return move
      }
      t.phase = 'solve'
    }
    const last = t.history.pop()
    if (!last) {
      // Solved: hold, then scramble again.
      t.phase = 'scramble'
      t.prev = null
      t.wait = SOLVED_HOLD
      return null
    }
    return { ...last, dir: last.dir === 1 ? -1 : 1 }
  }

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
    t.duration = t.phase === 'solve' ? SOLVE_TURN.duration : SCRAMBLE_TURN.duration
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
    t.wait = t.phase === 'solve' ? SOLVE_TURN.pause : SCRAMBLE_TURN.pause
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
      if (t.wait <= 0) {
        const move = nextMove()
        if (move) startTurn(move)
      }
      return
    }

    t.elapsed += delta
    const progress = Math.min(1, t.elapsed / t.duration)
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
