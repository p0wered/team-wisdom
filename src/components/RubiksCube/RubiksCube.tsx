import { Suspense, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Renderer } from './Renderer'
import { Cube } from './Cube'
import { Lighting } from './Lighting'
import styles from './RubiksCube.module.css'

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(reducedMotionQuery)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(reducedMotionQuery).matches,
    () => false,
  )
}

/**
 * Orthographic (isometric-style) projection: no perspective at all — parallel
 * edges, no near/far size difference. R3F sizes the ortho frustum in pixels,
 * so `zoom` (pixels per world unit) is derived from the canvas height to show
 * exactly `viewHeight` world units, whatever the window size.
 */
function OrthoFit({ viewHeight }: { viewHeight: number }) {
  const camera = useThree((s) => s.camera)
  const height = useThree((s) => s.size.height)
  useLayoutEffect(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) return
    camera.zoom = height / viewHeight
    camera.updateProjectionMatrix()
  }, [camera, height, viewHeight])
  return null
}

type RubiksCubeProps = {
  className?: string
  /** World units visible vertically; smaller = bigger cube in frame. */
  viewHeight?: number
}

export function RubiksCube({ className, viewHeight = 6.6 }: RubiksCubeProps) {
  const reducedMotion = usePrefersReducedMotion()
  /** Flipped by Renderer once shaders are compiled. */
  const readyRef = useRef(false)

  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')} aria-hidden="true">
      <Canvas
        className={styles.canvas}
        dpr={[1, 2]}
        shadows="percentage"
        orthographic
        camera={{ position: [0, 0, 40], near: 1, far: 200 }}
        gl={{
          antialias: false, // TAA in <Renderer> replaces MSAA
          alpha: true, // transparent: the page backdrop shows through
          stencil: false,
          powerPreference: 'high-performance',
          // Khronos PBR Neutral: keeps base colours true (ACES shifts yellow
          // towards orange and desaturates the blues) — the Apple palette has
          // to read as itself.
          toneMapping: THREE.NeutralToneMapping,
          toneMappingExposure: 1,
        }}
        onCreated={({ gl }) => gl.setClearColor('#000000', 0)}
      >
        <OrthoFit viewHeight={viewHeight} />
        <Suspense fallback={null}>
          <Lighting />
          <Cube reducedMotion={reducedMotion} readyRef={readyRef} />
          <Renderer readyRef={readyRef} bloomThreshold={3.5} bloomStrength={0.12} />
        </Suspense>
      </Canvas>
    </div>
  )
}
