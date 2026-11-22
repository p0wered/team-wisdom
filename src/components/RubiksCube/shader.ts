import * as THREE from 'three'

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

export function patchShader(material: THREE.MeshPhysicalMaterial, smudge: THREE.Texture, amount: number, xform: THREE.Vector4) {
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
