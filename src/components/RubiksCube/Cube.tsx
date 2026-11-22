import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { useTexture } from '@react-three/drei'
import { createCubeMaterials, CUBE_TEXTURES, prepareTextures } from './materials'
import { CUBE_LOOKS } from './looks'
import type { Theme } from '../../theme'

/** Distance between neighbouring cubie centres. */
const SPACING = 1
/** Nearly solid cubie: the tiny gap reads as a fine dark seam. */
const CUBIE_SIZE = 0.995

/** `shuffle` motion (dark theme): the even pace of the original. */
const SHUFFLE_TURN = { duration: 0.6, pause: 0.25, firstDelay: 0.8 }

/** Quarter turns per scramble. */
const SCRAMBLE_MOVES = 12
/** How long the solved cube is held before the next scramble, seconds. */
const SOLVED_HOLD = 2.6
/** A beat on the scrambled cube before solving starts ("inspection"), seconds. */
const SCRAMBLED_HOLD = 0.9
/** Before the first solve: let the entrance play, seconds. */
const FIRST_SOLVE_DELAY = 1.5

/**
 * Rhythm. A person doesn't turn a cube like a metronome: they spot a pattern,
 * fire off a short burst of moves almost without a gap, then pause to look
 * for the next one — and they get faster as the solve goes on. Scrambling is
 * a quick, careless shuffle with the odd stumble.
 */
const RHYTHM = {
  burst: [2, 4], // moves per burst while solving
  firstOfBurst: [0.36, 0.46], // the first turn of a burst is the deliberate one…
  inBurst: [0.24, 0.34], // …the rest follow quickly
  gapInBurst: [0, 0.05],
  lookAhead: [0.25, 0.6], // pause between bursts
  thinkChance: 0.2, // sometimes a longer look
  think: [0.7, 1.0],
  tempo: [1.12, 0.82], // overall pace: start of solve → end of solve (×duration)
  lastMove: 0.48, // the final, satisfying turn
  scramble: [0.13, 0.2],
  scrambleGap: [0, 0.05],
  stumbleChance: 0.15,
  stumble: [0.12, 0.22],
} as const

const rand = ([a, b]: readonly [number, number]) => a + Math.random() * (b - a)

/**
 * A quarter turn as a finger flick: full force at once, then the layer
 * decelerates, swings ~3° past the slot and clicks back — the step response
 * of a slightly under-damped spring (ζ = 0.72). Ends within 0.3 % of 1 at t = 1.
 */
const SPRING_ZETA = 0.72
const SPRING_OMEGA = 8
const SPRING_DAMPED = SPRING_OMEGA * Math.sqrt(1 - SPRING_ZETA * SPRING_ZETA)
function flick(t: number) {
  const decay = Math.exp(-SPRING_ZETA * SPRING_OMEGA * t)
  return 1 - decay * (Math.cos(SPRING_DAMPED * t) + ((SPRING_ZETA * SPRING_OMEGA) / SPRING_DAMPED) * Math.sin(SPRING_DAMPED * t))
}

/**
 * How lively the free tumble is in each phase: calm while solving (focus),
 * agitated while scrambling, slow and showing off when solved.
 */
const TUMBLE_ENERGY = { solve: 1, scramble: 3.2, solved: 0.55, shuffle: 1 } as const

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

/** Turn a layer by a quarter at once, without animation (the starting scramble). */
const instantQuat = new THREE.Quaternion()
function applyMoveInstantly(cubies: THREE.Object3D[], move: Move) {
  instantQuat.setFromAxisAngle(AXIS_VECTORS[move.axis], (Math.PI / 2) * move.dir)
  for (const c of cubies) {
    if (Math.round(c.position[move.axis] / SPACING) !== move.layer) continue
    c.position.applyQuaternion(instantQuat)
    c.quaternion.premultiply(instantQuat)
    snapCubie(c)
  }
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
  theme: Theme
  /** Disable layer turns and drift (prefers-reduced-motion). */
  reducedMotion?: boolean
  /** Entrance and turns start only once shaders are compiled. */
  readyRef: RefObject<boolean>
}

export function Cube({ theme, reducedMotion = false, readyRef }: CubeProps) {
  const look = CUBE_LOOKS[theme]
  const tiltRef = useRef<THREE.Group>(null)
  const viewport = useThree((s) => s.size)

  // Suspends until every photo map is loaded (covered by <Suspense> above).
  const photo = useTexture(CUBE_TEXTURES[theme]) as Record<string, THREE.Texture>

  const { root, pivot, cubies, scramble, dispose } = useMemo(() => {
    prepareTextures(photo)
    const materials = createCubeMaterials(theme, photo)
    const geometry = new RoundedBoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE, 6, look.radius)

    const root = new THREE.Group()
    const pivot = new THREE.Group()
    root.add(pivot)

    // Dark core: blocks light leaking through the seams while a middle slice turns.
    const coreMaterial = new THREE.MeshBasicMaterial({ color: '#000' })
    const core = new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 16), coreMaterial)
    root.add(core)

    // RoundedBoxGeometry keeps BoxGeometry's face groups (+x, −x, +y, −y, +z, −z),
    // so a cubie can take one material or one per face.

    const cubies: THREE.Mesh[] = []
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue
          const cubie = new THREE.Mesh(geometry, materials.forCubie(x, y, z, cubies.length))
          cubie.position.set(x * SPACING, y * SPACING, z * SPACING)
          cubie.castShadow = true
          cubie.receiveShadow = true
          root.add(cubie)
          cubies.push(cubie)
        }
      }
    }

    // `solve`: the cube first appears already scrambled — chaos — and its
    // opening act is solving itself. (With reduced motion it appears solved.)
    const scramble: Move[] = []
    if (look.motion === 'solve' && !reducedMotion) {
      let prev: Move | null = null
      for (let i = 0; i < SCRAMBLE_MOVES; i++) {
        prev = randomMove(prev)
        applyMoveInstantly(cubies, prev)
        scramble.push(prev)
      }
    }

    return {
      root,
      pivot,
      cubies,
      scramble,
      dispose: () => {
        geometry.dispose()
        core.geometry.dispose()
        coreMaterial.dispose()
        materials.dispose()
      },
    }
  }, [photo, theme, look, reducedMotion])

  useEffect(() => dispose, [dispose])

  /**
   * The loop: appear scrambled → solve, turn by turn, until every colour is
   * in place → hold → a quick shuffle back into chaos → solve again… Pieces
   * scatter and come back together: what the product does with people.
   * Solving plays the scramble back in reverse, so it always ends solved.
   */
  const turn = useRef({
    phase: 'solve' as 'scramble' | 'solve' | 'solved' | 'shuffle',
    history: [] as Move[],
    /** Moves in this solve, to know how far along it is (pace picks up). */
    total: 0,
    move: null as Move | null,
    prev: null as Move | null,
    elapsed: 0,
    duration: 1,
    wait: FIRST_SOLVE_DELAY,
    /** Moves left in the current burst while solving. */
    burstLeft: 0,
    members: [] as THREE.Object3D[],
  })

  // Bind the loop to the scene actually committed (StrictMode may build two;
  // a reduced-motion change rebuilds it): solving must undo *this* scramble.
  useLayoutEffect(() => {
    const shuffle = look.motion === 'shuffle'
    Object.assign(turn.current, {
      phase: shuffle ? 'shuffle' : scramble.length ? 'solve' : 'solved',
      history: scramble.slice(),
      total: scramble.length,
      move: null,
      prev: null,
      wait: shuffle ? SHUFFLE_TURN.firstDelay : FIRST_SOLVE_DELAY,
      burstLeft: 0,
      members: [],
    })
  }, [scramble, look])

  /** Pick the next move and how long it takes; null = nothing to turn right now. */
  const nextMove = (): Move | null => {
    const t = turn.current

    if (t.phase === 'shuffle') {
      t.duration = SHUFFLE_TURN.duration
      return randomMove(t.prev)
    }

    if (t.phase === 'solved') {
      // Held long enough: shuffle again.
      t.phase = 'scramble'
      t.prev = null
    }

    if (t.phase === 'scramble') {
      if (t.history.length < SCRAMBLE_MOVES) {
        const move = randomMove(t.prev)
        t.history.push(move)
        t.duration = rand(RHYTHM.scramble)
        return move
      }
      // Scrambled: a beat to take in the chaos, then solve.
      t.phase = 'solve'
      t.total = t.history.length
      t.burstLeft = 0
      t.wait = SCRAMBLED_HOLD
      return null
    }

    const last = t.history.pop()
    if (!last) return null // (finishTurn handles the solved moment)

    const progress = 1 - t.history.length / Math.max(t.total, 1)
    const tempo = RHYTHM.tempo[0] + (RHYTHM.tempo[1] - RHYTHM.tempo[0]) * progress
    if (t.history.length === 0) {
      t.duration = RHYTHM.lastMove
    } else if (t.burstLeft <= 0) {
      t.burstLeft = Math.round(rand(RHYTHM.burst))
      t.duration = rand(RHYTHM.firstOfBurst) * tempo
    } else {
      t.duration = rand(RHYTHM.inBurst) * tempo
    }
    t.burstLeft--
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
  }

  /** Set by the last move of a solve: drives the little "click" of the cube. */
  const solvedAt = useRef(-1)

  const finishTurn = (now: number) => {
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

    if (t.phase === 'shuffle') {
      t.wait = SHUFFLE_TURN.pause
    } else if (t.phase === 'scramble') {
      t.wait = Math.random() < RHYTHM.stumbleChance ? rand(RHYTHM.stumble) : rand(RHYTHM.scrambleGap)
    } else if (t.history.length === 0) {
      // Solved — every colour in place. Hold the moment.
      t.phase = 'solved'
      t.wait = SOLVED_HOLD
      solvedAt.current = now
    } else if (t.burstLeft > 0) {
      t.wait = rand(RHYTHM.gapInBurst)
    } else {
      t.wait = Math.random() < RHYTHM.thinkChance ? rand(RHYTHM.think) : rand(RHYTHM.lookAhead)
    }
  }

  // Camera FOV is vertical, so on portrait screens the cube would overflow
  // horizontally. Below ~0.85 aspect, shrink it in proportion to the width.
  const aspect = viewport.width / Math.max(viewport.height, 1)
  const fitScale = Math.min(1, aspect / 0.85)

  const smoothPointer = useRef(new THREE.Vector2())

  /**
   * The cube follows the cursor anywhere on the page, not only over its
   * canvas (R3F's own pointer updates only there). Measured from the cube's
   * centre and scaled by half the window, so the page edges are about ±1;
   * the cube turns towards the cursor wherever it is.
   */
  const gl = useThree((s) => s.gl)
  const pagePointer = useRef(new THREE.Vector2())
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      pagePointer.current.set(
        THREE.MathUtils.clamp((e.clientX - cx) / (window.innerWidth / 2), -1, 1),
        THREE.MathUtils.clamp(-(e.clientY - cy) / (window.innerHeight / 2), -1, 1),
      )
    }
    // The cursor left the window: drift back to the resting pose.
    const onLeave = () => pagePointer.current.set(0, 0)
    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [gl])
  const appear = useRef(0)
  /** Free tumble: accumulated angles and a smoothed liveliness. */
  const tumble = useRef({ x: 0, y: 0, roll: 0, energy: 1 })

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 20) // avoid jumps after a hidden tab
    const tilt = tiltRef.current
    if (!tilt) return

    // Entrance: ease from 0.8 → 1 scale.
    if (!readyRef.current) return
    appear.current = Math.min(1, appear.current + delta / 1.4)
    // Solved "click": a small, quickly damped swell, like the cube settling
    // in the hand once the last piece lands.
    const sinceSolved = state.clock.elapsedTime - solvedAt.current
    const click =
      solvedAt.current >= 0 && sinceSolved < 1.2
        ? 0.03 * Math.exp(-sinceSolved * 5) * Math.sin(sinceSolved * 13)
        : 0
    const s = (0.8 + 0.2 * easeInOutCubic(appear.current)) * (1 + click) * fitScale
    tilt.scale.setScalar(s)

    // Lean towards the cursor.
    smoothPointer.current.lerp(pagePointer.current, 1 - Math.exp(-delta * 3))
    // Base pose: classic isometric (35.26° down, 45° around); the cursor
    // leans it a little.
    tilt.rotation.x = 0.6155 - smoothPointer.current.y * 0.2
    tilt.rotation.y = -Math.PI / 4 + smoothPointer.current.x * 0.25

    if (reducedMotion) return

    const t = turn.current

    // Free tumble: two incommensurate rates so the cube keeps showing new
    // faces, plus a gentle roll. Its liveliness follows the phase and changes
    // smoothly, so the cube calms down, perks up and shows off.
    const tb = tumble.current
    tb.energy += (TUMBLE_ENERGY[t.phase] - tb.energy) * (1 - Math.exp(-delta * 1.8))
    tb.x += delta * 0.09 * tb.energy
    tb.y += delta * 0.14 * tb.energy
    tb.roll += delta * 0.11 * tb.energy
    root.rotation.set(tb.x, tb.y, Math.sin(tb.roll) * 0.35)

    // Layer turns.
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
    // Shuffle keeps the original smooth ease; the solving loop turns with a flick.
    const eased = t.phase === 'shuffle' ? easeInOutCubic(progress) : flick(progress)
    const angle = eased * (Math.PI / 2) * t.move.dir
    pivot.quaternion.setFromAxisAngle(AXIS_VECTORS[t.move.axis], angle)
    if (progress >= 1) finishTurn(state.clock.elapsedTime)
  })

  return (
    <group ref={tiltRef}>
      <primitive object={root} />
    </group>
  )
}
