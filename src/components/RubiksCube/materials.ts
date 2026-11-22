import * as THREE from 'three'
import { createRandom } from './textures'

export { createRandom }

/**
 * CC0 photogrammetry maps (ambientCG), pre-processed by
 * scripts/prep_textures.py — see public/textures/README.md. Colour comes from
 * flat values; only the surface layers are photographic: the fine grain of
 * moulded plastic (normal + roughness) and handling smudges.
 */
const base = import.meta.env.BASE_URL
export const PHOTO_TEXTURES = {
  grainRough: `${base}textures/satin_rough.jpg`,
  grainNormal: `${base}textures/satin_normal.jpg`,
  /** Fingerprint / smudge roughness overlay (Fingerprints002). */
  smudge: `${base}textures/smudge.jpg`,
} as const

export type PhotoTextures = Record<keyof typeof PHOTO_TEXTURES, THREE.Texture>

/** Roughness / normal maps are raw data, not colour. */
export function preparePhotoTextures(textures: PhotoTextures) {
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

/**
 * Specular anti-aliasing. three.js widens highlights only for *geometric*
 * curvature, so normal-map detail finer than a pixel stays mirror-sharp and
 * sparkles as the cube moves. Using the perturbed normal's screen-space
 * derivatives raises roughness exactly where detail is sub-pixel.
 */
const SPECULAR_AA_CHUNK = THREE.ShaderChunk.lights_physical_fragment.replace(
  'material.roughness += geometryRoughness;',
  /* glsl */ `
  vec3 dxyDetail = max( abs( dFdx( normal ) ), abs( dFdy( normal ) ) );
  float detailRoughness = max( max( dxyDetail.x, dxyDetail.y ), dxyDetail.z );
  material.roughness += max( geometryRoughness, detailRoughness * 1.6 );`,
)

/** Handling marks: a photographed smudge map roughens the surface in patches. */
const SMUDGE_DECL = /* glsl */ `
uniform sampler2D uSmudge;
uniform float uSmudgeAmount;
uniform vec4 uSmudgeXform;
`
const SMUDGE_CHUNK = /* glsl */ `
#include <roughnessmap_fragment>
float smudge = texture2D( uSmudge, vRoughnessMapUv * uSmudgeXform.xy + uSmudgeXform.zw ).g;
roughnessFactor = clamp( roughnessFactor + ( smudge - 0.16 ) * uSmudgeAmount, 0.04, 1.0 );
`

/**
 * Seam occlusion. Light can't reach into the narrow grooves between pieces,
 * so the last few percent of every face (its half of the bevel) darkens
 * towards the seam — the soft dark line real cubes have, instead of a hard
 * drawn one. Faked from the UVs: RoundedBoxGeometry maps each face 0→1
 * across, bevel included, so distance to the UV border is distance to the
 * seam. Mostly ambient and environment light; direct light only partly.
 */
const SEAM_AO_CHUNK = /* glsl */ `
#include <aomap_fragment>
vec2 seamUv = vRoughnessMapUv;
float seamDist = min( min( seamUv.x, 1.0 - seamUv.x ), min( seamUv.y, 1.0 - seamUv.y ) );
float seamAO = mix( 0.3, 1.0, smoothstep( 0.0, 0.075, seamDist ) );
reflectedLight.indirectDiffuse *= seamAO;
// Grazing direct light reaches only partly into the groove.
reflectedLight.directDiffuse *= mix( 0.55, 1.0, seamAO );
reflectedLight.indirectSpecular *= mix( 0.5, 1.0, seamAO );
`

function patchShader(material: THREE.MeshPhysicalMaterial, smudge: THREE.Texture, amount: number, xform: THREE.Vector4) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSmudge = { value: smudge }
    shader.uniforms.uSmudgeAmount = { value: amount }
    shader.uniforms.uSmudgeXform = { value: xform }
    shader.fragmentShader = SMUDGE_DECL + shader.fragmentShader
      .replace('#include <roughnessmap_fragment>', SMUDGE_CHUNK)
      .replace('#include <lights_physical_fragment>', SPECULAR_AA_CHUNK)
      .replace('#include <aomap_fragment>', SEAM_AO_CHUNK)
  }
  material.customProgramCacheKey = () => 'specular-aa+smudge+seam-ao'
}

export type FaceName = keyof typeof FACE_COLORS

export type CubeMaterials = {
  faces: Record<FaceName, THREE.MeshPhysicalMaterial>
  body: THREE.MeshPhysicalMaterial
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
export function createMaterials(photo: PhotoTextures, seed = 11): CubeMaterials {
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

  return { faces, body, dispose: () => all.forEach((m) => m.dispose()) }
}
