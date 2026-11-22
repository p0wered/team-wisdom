import type { ComponentType } from 'react'
import * as THREE from 'three'
import type { Theme } from '../../theme'
import { DarkLighting } from './lighting/DarkLighting'
import { LightLighting } from './lighting/LightLighting'

/** Everything about the cube that differs between the themes (materials: ./materials). */
export type CubeLook = {
  Lighting: ComponentType
  toneMapping: THREE.ToneMapping
  exposure: number
  bloom: { threshold: number; strength: number }
  /** Corner radius of a cubie (edge length ≈ 1). */
  radius: number
  /**
   * - `shuffle`: endless random turns at an even pace (the dark original).
   * - `solve`: appears scrambled, solves itself with a human rhythm, quick
   *   re-scramble, solve again… (only makes sense with real cube colours).
   */
  motion: 'shuffle' | 'solve'
}

export const CUBE_LOOKS: Record<Theme, CubeLook> = {
  dark: {
    Lighting: DarkLighting,
    toneMapping: THREE.ACESFilmicToneMapping,
    // Low-key: the object stays mostly in shadow, light only grazes faces and bevels.
    exposure: 0.62,
    bloom: { threshold: 3, strength: 0.25 },
    radius: 0.055,
    motion: 'shuffle',
  },
  light: {
    Lighting: LightLighting,
    // Khronos PBR Neutral keeps base colours true (ACES shifts yellow towards
    // orange and desaturates the blues): the Apple palette must read as itself.
    toneMapping: THREE.NeutralToneMapping,
    exposure: 1,
    bloom: { threshold: 3.5, strength: 0.12 },
    radius: 0.065,
    motion: 'solve',
  },
}
