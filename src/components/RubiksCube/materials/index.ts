import * as THREE from 'three'
import type { Theme } from '../../../theme'
import { createDarkMaterials, DARK_TEXTURES, type DarkTextures } from './dark'
import { createLightMaterials, LIGHT_TEXTURES, type LightTextures } from './light'

/**
 * The cube's finishes, per theme:
 * - dark: 26 premium finishes, one per cubie (dark.ts)
 * - light: stickerless plastic in Apple system colours, coloured per face (light.ts)
 */
export const CUBE_TEXTURES: Record<Theme, Record<string, string>> = {
  dark: DARK_TEXTURES,
  light: LIGHT_TEXTURES,
}

/** Colour maps (`…Color`) are sRGB; roughness / normal / smudge maps are raw data. */
export function prepareTextures(textures: Record<string, THREE.Texture>) {
  for (const [key, tex] of Object.entries(textures)) {
    tex.colorSpace = key.endsWith('Color') ? THREE.SRGBColorSpace : THREE.NoColorSpace
    tex.anisotropy = 8
    if (key === 'smudge') tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.needsUpdate = true
  }
}

export type CubeMaterialSet = {
  /**
   * Material(s) for the cubie at grid position (x, y, z) ∈ {−1, 0, 1}³;
   * `index` counts cubies in creation order. An array follows the box face
   * groups: +x, −x, +y, −y, +z, −z.
   */
  forCubie: (x: number, y: number, z: number, index: number) => THREE.Material | THREE.Material[]
  dispose: () => void
}

export function createCubeMaterials(theme: Theme, textures: Record<string, THREE.Texture>): CubeMaterialSet {
  if (theme === 'dark') {
    const { materials, dispose } = createDarkMaterials(textures as DarkTextures)
    return { forCubie: (_x, _y, _z, index) => materials[index], dispose }
  }

  // Outer faces get their colour; inner faces are the plastic body.
  const { faces, body, dispose } = createLightMaterials(textures as LightTextures)
  const side = (c: number, plus: THREE.Material, minus: THREE.Material) => [c === 1 ? plus : body, c === -1 ? minus : body]
  return {
    forCubie: (x, y, z) => [
      ...side(x, faces.right, faces.left),
      ...side(y, faces.up, faces.down),
      ...side(z, faces.front, faces.back),
    ],
    dispose,
  }
}
