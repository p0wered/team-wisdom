import { useEffect, useMemo } from 'react'
import { Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { createBlindsTexture, createSoftSpotTexture } from './textures'

RectAreaLightUniformsLib.init()

/** Where the window is: upper left, in front of the cube. */
const SUN_DIR = new THREE.Vector3(-0.55, 0.62, 0.56).normalize()
const SUN_COLOR = '#fff6ea' // late-morning sun, a touch warm
const ROOM_COLOR = '#ffffff' // light, white-walled room
const ROOM_GROUND = '#f4ece2' // warm, sunlit pale floor

/** Tuning knobs — light levels are balanced so lit colours land on their swatches. */
const LIGHT = {
  room: 2.1, // even light bounced from walls, ceiling and floor
  sun: 1.8, // the blind's bands
  key: 5, // softbox upper left
  fill: 2.4, // white card on the right
  rim: 5, // strip light above and behind: highlights along top edges
}

/**
 * A bright, white room on a sunny morning, lit like a product shot.
 *
 * The camera is orthographic, so every point of a flat face is seen from the
 * same direction. Under distant light (sun, environment) a face is then
 * lit perfectly evenly and the cube reads as a vector drawing. What gives
 * it form are lights CLOSE to the cube: their light falls off and changes
 * angle across each face, so every face carries a gradient and a soft
 * highlight that slides as the cube turns — like softboxes in a studio.
 *
 * - Room: an even, slightly warm-from-below base so no face goes dark.
 * - Key: a large softbox upper left, by the window.
 * - Fill: a white card on the right, opening up the shadow side.
 * - Rim: a long strip above and behind, catching the top bevels.
 * - Sun through the blind: soft warm bands moving over the faces.
 * - Environment: the window and the room, for reflections only.
 */
export function Lighting() {
  const textures = useMemo(() => ({ soft: createSoftSpotTexture(), blinds: createBlindsTexture() }), [])
  useEffect(() => () => Object.values(textures).forEach((t) => t.dispose()), [textures])

  const target = useMemo(() => new THREE.Object3D(), [])
  const sunPos = useMemo(() => SUN_DIR.clone().multiplyScalar(30).toArray(), [])
  const windowPos = useMemo(() => SUN_DIR.clone().multiplyScalar(14).toArray(), [])
  const lookAtCube = (self: THREE.Object3D) => self.lookAt(0, 0, 0)

  return (
    <>
      <hemisphereLight args={[ROOM_COLOR, ROOM_GROUND, LIGHT.room]} />

      <rectAreaLight position={[-3.4, 3.1, 3.8]} width={3.2} height={2.6} intensity={LIGHT.key} color="#fffaf3" onUpdate={lookAtCube} />
      <rectAreaLight position={[4.6, -0.6, 3.2]} width={3} height={4} intensity={LIGHT.fill} color="#ffffff" onUpdate={lookAtCube} />
      <rectAreaLight position={[0.6, 4.4, -2.4]} width={7} height={0.9} intensity={LIGHT.rim} color="#ffffff" onUpdate={lookAtCube} />

      <primitive object={target} />
      <spotLight
        position={sunPos}
        target={target}
        map={textures.blinds}
        angle={0.13}
        penumbra={0.05}
        decay={0}
        intensity={LIGHT.sun}
        color={SUN_COLOR}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.02}
        shadow-radius={6}
        shadow-camera-near={22}
        shadow-camera-far={38}
      />

      <Environment resolution={256} frames={1} environmentIntensity={0.6}>
        {/* The window, slatted, as it appears in reflections */}
        <Lightformer form="rect" map={textures.blinds} intensity={3} color={SUN_COLOR} position={windowPos} scale={[6, 6, 1]} target={[0, 0, 0]} />
        {/* Ceiling and the wall behind the viewer */}
        <Lightformer form="rect" map={textures.soft} intensity={0.6} color={ROOM_COLOR} position={[0, 9, 2]} scale={[22, 22, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" map={textures.soft} intensity={0.5} color={ROOM_COLOR} position={[4, 1, 10]} scale={[22, 14, 1]} target={[0, 0, 0]} />
        {/* Sunlit floor */}
        <Lightformer form="rect" map={textures.soft} intensity={0.5} color={ROOM_GROUND} position={[1, -8, 4]} scale={[16, 12, 1]} target={[0, 0, 0]} />
      </Environment>
    </>
  )
}
