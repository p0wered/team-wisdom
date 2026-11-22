import { useEffect, useMemo } from 'react'
import { Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'
import { createBlindsTexture, createSoftSpotTexture } from './textures'

/** Where the window is: upper left, in front of the cube. */
const SUN_DIR = new THREE.Vector3(-0.55, 0.62, 0.56).normalize()
const SUN_COLOR = '#fffaf3' // ~5500 K: daylight, only a hint warm
const SKY_COLOR = '#dee6f1' // sky through the window: barely cooler than white

/**
 * Sunlight through blinds into a dark room. Every bit of light comes in
 * through the window — nothing behind or above the cube emits or reflects
 * light, so faces turned away from the window stay in warm-neutral shade
 * instead of picking up a cold sheen.
 *
 * - The sun: a distant, narrow spot (near-parallel rays) projecting a
 *   slatted blind with soft penumbrae. Bands of light slide over the faces
 *   as the cube tumbles.
 * - The window, as seen in reflections: glossy faces at the mirror angle
 *   reflect a slatted rectangle, like a real window would.
 * - Skylight: a broad, nearly neutral fill from the same window.
 * - Bounce: a warm glow from the sunlit floor in front of the cube.
 */
export function Lighting() {
  const textures = useMemo(() => ({ soft: createSoftSpotTexture(), blinds: createBlindsTexture() }), [])
  useEffect(() => () => Object.values(textures).forEach((t) => t.dispose()), [textures])

  const target = useMemo(() => new THREE.Object3D(), [])
  const sunPos = useMemo(() => SUN_DIR.clone().multiplyScalar(30).toArray(), [])
  const windowPos = useMemo(() => SUN_DIR.clone().multiplyScalar(14).toArray(), [])

  return (
    <>
      <primitive object={target} />
      <spotLight
        position={sunPos}
        target={target}
        map={textures.blinds}
        angle={0.13}
        penumbra={0.05}
        decay={0}
        intensity={22}
        color={SUN_COLOR}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.02}
        shadow-radius={6}
        shadow-camera-near={22}
        shadow-camera-far={38}
      />

      <Environment resolution={512} frames={1} environmentIntensity={1}>
        {/* The window, slatted, as it appears in glossy reflections */}
        <Lightformer form="rect" map={textures.blinds} intensity={2.4} color={SUN_COLOR} position={windowPos} scale={[6, 6, 1]} target={[0, 0, 0]} />
        {/* Skylight through the same window: broad, nearly neutral */}
        <Lightformer form="rect" map={textures.soft} intensity={1.3} color={SKY_COLOR} position={windowPos} scale={[14, 12, 1]} target={[0, 0, 0]} />
        {/* Warm bounce from the sunlit floor */}
        <Lightformer form="rect" map={textures.soft} intensity={0.7} color="#ffd9b8" position={[1, -6, 5]} scale={[12, 8, 1]} target={[0, 0, 0]} />
      </Environment>
    </>
  )
}
