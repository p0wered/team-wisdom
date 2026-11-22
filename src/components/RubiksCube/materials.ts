import * as THREE from 'three'
import { createRandom, createTextureSet, type TextureSet } from './textures'

export { createRandom }

/**
 * CC0 photogrammetry maps (ambientCG, Poly Haven), pre-processed by
 * scripts/prep_textures.py — see public/textures/README.md.
 */
const base = import.meta.env.BASE_URL
export const PHOTO_TEXTURES = {
  satinRough: `${base}textures/satin_rough.jpg`,
  satinNormal: `${base}textures/satin_normal.jpg`,
  glossRough: `${base}textures/gloss_rough.jpg`,
  glossNormal: `${base}textures/gloss_normal.jpg`,
  matteNormal: `${base}textures/matte_normal.jpg`,
  brushedColor: `${base}textures/brushed_color.jpg`,
  brushedRough: `${base}textures/brushed_rough.jpg`,
  brushedNormal: `${base}textures/brushed_normal.jpg`,
  meshColor: `${base}textures/mesh_color.jpg`,
  meshNormal: `${base}textures/mesh_normal.jpg`,
  terrazzoColor: `${base}textures/terrazzo_color.jpg`,
  terrazzoRough: `${base}textures/terrazzo_rough.jpg`,
  terrazzoNormal: `${base}textures/terrazzo_normal.jpg`,
  velvetColor: `${base}textures/velvet_color.jpg`,
  velvetRough: `${base}textures/velvet_rough.jpg`,
  velvetNormal: `${base}textures/velvet_normal.jpg`,
  /** Fingerprint / smudge roughness overlay (Fingerprints002), shared by all. */
  smudge: `${base}textures/smudge.jpg`,
} as const

export type PhotoTextures = Record<keyof typeof PHOTO_TEXTURES, THREE.Texture>

/** Colour maps are sRGB; roughness / normal maps are raw data. */
export function preparePhotoTextures(textures: PhotoTextures) {
  for (const [key, tex] of Object.entries(textures)) {
    tex.colorSpace = key.endsWith('Color') ? THREE.SRGBColorSpace : THREE.NoColorSpace
    tex.anisotropy = 8
    if (key === 'smudge') tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.needsUpdate = true
  }
}

type TextureKey = Exclude<keyof TextureSet, 'dispose'> | Exclude<keyof PhotoTextures, 'smudge'>

/**
 * Finishes matched to the original cube, one per cubie:
 * powder-coated satin metal (the bulk), matte micro-texture, glossy powder
 * coat, brushed steel, a fine woven mesh, terrazzo with white chips, dark
 * velvet, the framed speaker grille and sandblasted grain.
 *
 * Note on roughness: a roughness map MULTIPLIES `roughness`, so the values
 * below are chosen against each map's mean (satin 0.65, gloss 0.30,
 * brushed 0.47, terrazzo 0.25, velvet 0.73) to land on the intended result.
 */
type MaterialSpec = {
  name: string
  color: string
  metalness: number
  roughness: number
  map?: TextureKey
  normalMap?: TextureKey
  normalStrength?: number
  roughnessMap?: TextureKey
  clearcoat?: number
  clearcoatRoughness?: number
  anisotropy?: number
  sheen?: number
  sheenColor?: string
  /** How much the fingerprint/smudge overlay roughens the surface. */
  smudge?: number
}

// Powder-coated paint is a DIELECTRIC: light (and the sun stripes) shows up
// as diffuse shading with a soft satin sheen on top. Metal would only mirror
// the (cool) environment — the cold, washed-out look we had before.
// `metalness` here is a hint of metallic flake, scaled way down.
// Effective roughness ≈ 0.42–0.55: soft, wide reflections.
const satin = (name: string, color: string, metalness: number, roughness: number): MaterialSpec => ({
  name, color, metalness: metalness * 0.15, roughness, roughnessMap: 'satinRough', normalMap: 'satinNormal', normalStrength: 0.6, smudge: 0.22,
})
// Effective roughness ≈ 0.6: matte, micro-textured.
const matte = (name: string, color: string, _metalness: number): MaterialSpec => ({
  name, color, metalness: 0, roughness: 0.95, roughnessMap: 'satinRough', normalMap: 'matteNormal', normalStrength: 1, smudge: 0.1,
})
// Effective roughness ≈ 0.27 plus a soft clear coat — deep, not mirror-like
// (anything glossier turns the key light into pin-point glints on the corners).
const gloss = (name: string, color: string, metalness: number, roughness = 0.9): MaterialSpec => ({
  name, color, metalness: metalness * 0.2, roughness, roughnessMap: 'glossRough', normalMap: 'glossNormal', normalStrength: 0.5,
  clearcoat: 0.5, clearcoatRoughness: 0.22, smudge: 0.45,
})
// Effective roughness ≈ 0.4, highlights stretched along the grain.
const brushed = (name: string, color: string): MaterialSpec => ({
  name, color, metalness: 0.9, roughness: 0.85, map: 'brushedColor', roughnessMap: 'brushedRough',
  normalMap: 'brushedNormal', normalStrength: 0.35, anisotropy: 0.45, smudge: 0.15,
})
const mesh = (name: string, color: string): MaterialSpec => ({
  name, color, metalness: 0.4, roughness: 0.7, map: 'meshColor', roughnessMap: 'satinRough',
  normalMap: 'meshNormal', normalStrength: 0.7, smudge: 0.08,
})
// The map holds white chips on dark grey, so `color` tints the chips.
const terrazzo = (name: string, color: string, polished: boolean): MaterialSpec => ({
  name, color, metalness: 0.05, roughness: polished ? 1 : 0.85, map: 'terrazzoColor',
  roughnessMap: polished ? 'terrazzoRough' : 'satinRough', normalMap: 'terrazzoNormal', normalStrength: 0.5,
  clearcoat: polished ? 0.6 : 0.08, clearcoatRoughness: 0.2, smudge: polished ? 0.35 : 0.12,
})
const velvet = (name: string, color: string, sheen: number, sheenColor: string): MaterialSpec => ({
  name, color, metalness: 0, roughness: 1, map: 'velvetColor', roughnessMap: 'velvetRough',
  normalMap: 'velvetNormal', normalStrength: 0.8, sheen, sheenColor,
})
// Procedural (textures.ts) — framed speaker grille and sandblasted grain.
const grille = (name: string, color: string, wide: boolean): MaterialSpec => ({
  name, color, metalness: 0.8, roughness: 0.65, roughnessMap: 'satinRough',
  map: wide ? 'grilleWideColor' : 'grilleFineColor',
  normalMap: wide ? 'grilleWideNormal' : 'grilleFineNormal', normalStrength: 0.55, smudge: 0.1,
})
const grain = (name: string, color: string, b: boolean): MaterialSpec => ({
  name, color, metalness: 0.3, roughness: 0.62,
  map: b ? 'grainColorB' : 'grainColorA', roughnessMap: 'grainRoughA',
  normalMap: b ? 'grainNormalB' : 'grainNormalA', normalStrength: 0.35, smudge: 0.06,
})

const SPECS: MaterialSpec[] = [
  satin('satin-charcoal', '#2a2a2d', 0.6, 0.78),
  satin('satin-graphite', '#232326', 0.6, 0.7),
  satin('satin-ink', '#1a1a1c', 0.5, 0.82),
  satin('satin-slate', '#303034', 0.7, 0.68),
  satin('satin-steel', '#3c3c40', 0.8, 0.64),
  satin('satin-warm', '#2b2a2a', 0.5, 0.78),
  satin('satin-cool', '#26272b', 0.6, 0.72),

  matte('matte-black', '#161618', 0.2),
  matte('matte-graphite', '#222224', 0.3),
  matte('matte-soft', '#1c1c1e', 0.1),

  gloss('gloss-black', '#0b0b0c', 0.2),
  gloss('gloss-ink', '#111113', 0.4, 0.95),
  gloss('gloss-graphite', '#1a1a1c', 0.5, 0.85),

  brushed('brushed-dark', '#4a4a4f'),
  brushed('brushed-mid', '#6a6a70'),
  brushed('brushed-ink', '#2e2e32'),

  mesh('mesh-dark', '#3a3a3e'),
  mesh('mesh-light', '#5c5c62'),

  terrazzo('terrazzo-polished', '#9a9a9e', true),
  terrazzo('terrazzo-honed', '#86868a', false),

  velvet('velvet-black', '#1c1c1e', 1, '#5a5a62'),
  velvet('suede-graphite', '#2a2a2c', 0.6, '#4a4a50'),

  grille('grille-fine', '#3c3c40', false),
  grille('grille-wide', '#45454a', true),

  grain('grain-light', '#9a9aa0', false),
  grain('grain-mid', '#5e5e63', true),
]

/**
 * Specular anti-aliasing. three.js widens highlights only for *geometric*
 * curvature (derivatives of the unperturbed normal), so normal-map detail
 * finer than a pixel stays mirror-sharp and sparkles / crawls as the cube
 * moves. Using the perturbed normal's screen-space derivatives instead raises
 * roughness exactly where detail is sub-pixel — highlights there blur out
 * smoothly, like a supersampled render would.
 */
const SPECULAR_AA_CHUNK = THREE.ShaderChunk.lights_physical_fragment.replace(
  'material.roughness += geometryRoughness;',
  /* glsl */ `
  vec3 dxyDetail = max( abs( dFdx( normal ) ), abs( dFdy( normal ) ) );
  float detailRoughness = max( max( dxyDetail.x, dxyDetail.y ), dxyDetail.z );
  material.roughness += max( geometryRoughness, detailRoughness * 1.6 );`,
)

/**
 * Imperfections: a photographed fingerprint/smudge map raises roughness in
 * patches, so reflections break up the way they do on a real handled object.
 * Each cubie samples it at its own scale/offset (per-material uniforms).
 */
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

function patchShader(material: THREE.MeshPhysicalMaterial, smudge: THREE.Texture, amount: number, xform: THREE.Vector4) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSmudge = { value: smudge }
    shader.uniforms.uSmudgeAmount = { value: amount }
    shader.uniforms.uSmudgeXform = { value: xform }
    shader.fragmentShader = SMUDGE_DECL + shader.fragmentShader
      .replace('#include <roughnessmap_fragment>', SMUDGE_CHUNK)
      .replace('#include <lights_physical_fragment>', SPECULAR_AA_CHUNK)
  }
  material.customProgramCacheKey = () => 'specular-aa+smudge'
}

export type CubeMaterials = {
  /** Exactly one material per cubie, in a stable shuffled order. */
  materials: THREE.MeshPhysicalMaterial[]
  dispose: () => void
}

export function createMaterials(photo: PhotoTextures, seed = 7): CubeMaterials {
  const procedural = createTextureSet()
  const tex = { ...procedural, ...photo } as Record<TextureKey, THREE.Texture>
  const smudgeRand = createRandom(seed + 100)

  const materials = SPECS.map((spec) => {
    const material = new THREE.MeshPhysicalMaterial({
      name: spec.name,
      color: spec.color,
      metalness: spec.metalness,
      roughness: spec.roughness,
      // Same texture slots on every material → shared shader programs
      // (three variants in total: plain, anisotropic, sheen).
      map: tex[spec.map ?? 'white'],
      normalMap: tex[spec.normalMap ?? 'flatNormal'],
      roughnessMap: tex[spec.roughnessMap ?? 'white'],
      clearcoat: spec.clearcoat ?? 0.04,
      clearcoatRoughness: spec.clearcoatRoughness ?? 0.4,
      anisotropy: spec.anisotropy ?? 0,
      sheen: spec.sheen ?? 0,
      sheenColor: spec.sheenColor ?? '#000000',
      sheenRoughness: 0.55,
    })
    material.normalScale.setScalar(spec.normalStrength ?? 0)
    const scale = 0.45 + smudgeRand() * 0.35 // fewer, larger prints per face
    patchShader(material, photo.smudge, spec.smudge ?? 0.15, new THREE.Vector4(scale, scale, smudgeRand(), smudgeRand()))
    return material
  })

  // Deterministic Fisher–Yates so finishes are spread around the cube.
  const rand = createRandom(seed)
  for (let i = materials.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[materials[i], materials[j]] = [materials[j], materials[i]]
  }

  return {
    materials,
    dispose: () => {
      materials.forEach((m) => m.dispose())
      procedural.dispose()
    },
  }
}
