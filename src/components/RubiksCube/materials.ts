import * as THREE from 'three'
import { createRandom } from './textures'
import { patchShader } from './shader'

/**
 * CC0 photogrammetry maps (ambientCG), pre-processed by
 * scripts/prep_textures.py — see public/textures/README.md. Colour comes from
 * flat values; only the surface layers are photographic: the fine grain of
 * moulded plastic (normal + roughness) and handling smudges.
 */
const base = import.meta.env.BASE_URL
export const CUBE_TEXTURES = {
  grainRough: `${base}textures/satin_rough.jpg`,
  grainNormal: `${base}textures/satin_normal.jpg`,
  /** Fingerprint / smudge roughness overlay (Fingerprints002). */
  smudge: `${base}textures/smudge.jpg`,
} as const

export type CubeTextures = Record<keyof typeof CUBE_TEXTURES, THREE.Texture>

/** Roughness / normal / smudge maps are raw data, not colour. */
export function prepareTextures(textures: CubeTextures) {
  for (const [key, tex] of Object.entries(textures)) {
    tex.colorSpace = THREE.NoColorSpace
    tex.anisotropy = 8
    if (key === 'smudge') tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.needsUpdate = true
  }
}

/**
 * Apple system colours (HIG, iOS 26, Default / light appearance) in the
 * standard Western cube scheme: white opposite yellow, red opposite orange,
 * green opposite blue.
 */
export const FACE_COLORS = {
  right: '#FF383C', //  +x  red
  left: '#FF8D28', //   −x  orange
  // White plastic reflects ~80 %, not the 91 % of Apple's #F5F5F7 UI white —
  // at full value it blows out under the key light. Lit, it renders ≈ #F5F5F7.
  up: '#E6E6E9', //     +y  white
  down: '#FFCC00', //   −y  yellow
  front: '#34C759', //  +z  green
  back: '#0088FF', //   −z  blue
} as const

/** The plastic body the colour tiles sit on: seen only in the seams and mid-turn. */
const BODY_COLOR = '#2C2C2E'

export type FaceName = keyof typeof FACE_COLORS

export type CubeMaterialSet = {
  /**
   * Materials for the cubie at grid position (x, y, z) ∈ {−1, 0, 1}³, in
   * the box face groups' order: +x, −x, +y, −y, +z, −z. Outer faces get
   * their colour; inner faces are the plastic body.
   */
  forCubie: (x: number, y: number, z: number) => THREE.Material[]
  dispose: () => void
}

/**
 * Stickerless speed-cube plastic: colour moulded through, a fine frosted
 * grain, a soft satin sheen (effective roughness ≈ 0.4) and a whisper of
 * clear coat where the surface has been polished by hands. Dielectric, so
 * colours stay pure under any light.
 *
 * A roughness map MULTIPLIES `roughness`; the grain map's mean is ≈ 0.65.
 */
export function createCubeMaterials(photo: CubeTextures, seed = 11): CubeMaterialSet {
  const rand = createRandom(seed)
  const all: THREE.MeshPhysicalMaterial[] = []

  const plastic = (name: string, color: string, roughness: number, smudge: number) => {
    const material = new THREE.MeshPhysicalMaterial({
      name,
      color,
      metalness: 0,
      roughness,
      roughnessMap: photo.grainRough,
      normalMap: photo.grainNormal,
      clearcoat: 0.12,
      clearcoatRoughness: 0.35,
    })
    material.normalScale.setScalar(0.22)
    const scale = 0.45 + rand() * 0.35
    patchShader(material, photo.smudge, smudge, new THREE.Vector4(scale, scale, rand(), rand()))
    all.push(material)
    return material
  }

  const faces = Object.fromEntries(
    (Object.entries(FACE_COLORS) as [FaceName, string][]).map(([face, color]) => [
      face,
      // White shows smudges most; pale plastic is also a touch glossier.
      plastic(face, color, face === 'up' ? 0.46 : 0.5, face === 'up' ? 0.3 : 0.22),
    ]),
  ) as Record<FaceName, THREE.MeshPhysicalMaterial>

  const body = plastic('body', BODY_COLOR, 0.85, 0.05)

  const side = (c: number, plus: THREE.Material, minus: THREE.Material) => [c === 1 ? plus : body, c === -1 ? minus : body]
  return {
    forCubie: (x, y, z) => [
      ...side(x, faces.right, faces.left),
      ...side(y, faces.up, faces.down),
      ...side(z, faces.front, faces.back),
    ],
    dispose: () => all.forEach((m) => m.dispose()),
  }
}
