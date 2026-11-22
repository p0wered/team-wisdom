import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Custom frame renderer (takes over via useFrame priority 1):
 *
 *   1. jitter the camera by a sub-pixel Halton offset
 *   2. scene → HDR target                       (shadows rendered once/frame)
 *   3. velocity pass → per-pixel screen motion  (previous vs current matrices)
 *   4. TAA resolve: reproject history by velocity, clip it to the current
 *      pixel's neighbourhood in YCoCg, blend ~90 % history
 *   5. bloom from the resolved image (1/4 + 1/8 res blur)
 *   6. final: ACES + sRGB, bloom, dither, premultiplied alpha → screen
 *
 * TAA is what makes the original read as a "render": every pixel is the
 * average of many jittered samples, so fine textures, bevels and highlights
 * resolve smoothly instead of shimmering. It replaces MSAA (the canvas is
 * created without antialias).
 */

const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const VELOCITY_VERT = /* glsl */ `
  uniform mat4 uPrevModel;
  uniform mat4 uPrevViewProj;
  uniform mat4 uCurrViewProj;
  varying vec4 vCurr;
  varying vec4 vPrev;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vCurr = uCurrViewProj * world;
    vPrev = uPrevViewProj * (uPrevModel * vec4(position, 1.0));
    // Rasterise with the jittered projection so coverage matches the colour pass.
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const VELOCITY_FRAG = /* glsl */ `
  varying vec4 vCurr;
  varying vec4 vPrev;
  void main() {
    vec2 a = vCurr.xy / vCurr.w;
    vec2 b = vPrev.xy / vPrev.w;
    gl_FragColor = vec4((a - b) * 0.5, 0.0, 1.0); // in UV units
  }
`

const RESOLVE_FRAG = /* glsl */ `
  uniform sampler2D tCurrent;
  uniform sampler2D tHistory;
  uniform sampler2D tVelocity;
  uniform vec2 uTexel;
  uniform float uBlend;
  uniform float uReset;
  varying vec2 vUv;

  // Reversible tone curve: resolve in a compressed space so bright pixels
  // don't dominate the average (avoids fireflies and dark halos).
  vec3 compress(vec3 c) { return c / (1.0 + max(c.r, max(c.g, c.b))); }
  vec3 expand(vec3 c) { return c / max(1e-4, 1.0 - max(c.r, max(c.g, c.b))); }
  vec3 toYCoCg(vec3 c) { return vec3(dot(c, vec3(0.25, 0.5, 0.25)), dot(c, vec3(0.5, 0.0, -0.5)), dot(c, vec3(-0.25, 0.5, -0.25))); }
  vec3 toRGB(vec3 c) { return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z); }

  // 5-tap Catmull-Rom history fetch: sharper than bilinear, so the image
  // doesn't go soft over many frames of reprojection.
  vec4 sampleHistory(vec2 uv) {
    vec2 res = 1.0 / uTexel;
    vec2 pos = uv * res;
    vec2 c = floor(pos - 0.5) + 0.5;
    vec2 f = pos - c;
    vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
    vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
    vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
    vec2 w3 = f * f * (-0.5 + 0.5 * f);
    vec2 w12 = w1 + w2;
    vec2 tc12 = (c + w2 / w12) * uTexel;
    vec2 tc0 = (c - 1.0) * uTexel;
    vec2 tc3 = (c + 2.0) * uTexel;
    vec4 r = texture2D(tHistory, vec2(tc12.x, tc0.y)) * (w12.x * w0.y)
           + texture2D(tHistory, vec2(tc0.x, tc12.y)) * (w0.x * w12.y)
           + texture2D(tHistory, vec2(tc12.x, tc12.y)) * (w12.x * w12.y)
           + texture2D(tHistory, vec2(tc3.x, tc12.y)) * (w3.x * w12.y)
           + texture2D(tHistory, vec2(tc12.x, tc3.y)) * (w12.x * w3.y);
    float wsum = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
    return max(r / wsum, 0.0);
  }

  void main() {
    vec4 cur = texture2D(tCurrent, vUv);

    // Neighbourhood statistics (3×3) and dilated velocity (longest in 3×3),
    // so silhouettes moving over the background reproject correctly.
    vec3 m1 = vec3(0.0);
    vec3 m2 = vec3(0.0);
    float aMin = 1.0;
    float aMax = 0.0;
    vec2 vel = vec2(0.0);
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y)) * uTexel;
        vec4 s = texture2D(tCurrent, vUv + o);
        vec3 c = toYCoCg(compress(s.rgb));
        m1 += c;
        m2 += c * c;
        aMin = min(aMin, s.a);
        aMax = max(aMax, s.a);
        vec2 v = texture2D(tVelocity, vUv + o).xy;
        if (dot(v, v) > dot(vel, vel)) vel = v;
      }
    }
    vec3 mean = m1 / 9.0;
    vec3 sigma = sqrt(max(m2 / 9.0 - mean * mean, 0.0));
    vec3 lo = mean - sigma * 1.1;
    vec3 hi = mean + sigma * 1.1;

    vec2 prevUv = vUv - vel;
    bool offscreen = any(lessThan(prevUv, vec2(0.0))) || any(greaterThan(prevUv, vec2(1.0)));
    if (uReset > 0.5 || offscreen) {
      gl_FragColor = cur;
      return;
    }

    vec4 hist = sampleHistory(prevUv);
    vec3 h = toYCoCg(compress(hist.rgb));
    // Clip (not clamp) towards the neighbourhood mean: removes ghosting
    // without the blocky look of a hard AABB clamp.
    vec3 centre = 0.5 * (hi + lo);
    vec3 extent = 0.5 * (hi - lo) + 1e-4;
    vec3 d = h - centre;
    vec3 ad = abs(d / extent);
    float m = max(ad.x, max(ad.y, ad.z));
    if (m > 1.0) h = centre + d / m;
    float ha = clamp(hist.a, aMin, aMax);

    // Trust history a little less while things move fast.
    float speed = length(vel / uTexel);
    float blend = mix(uBlend, 0.7, clamp(speed / 12.0, 0.0, 1.0));

    vec3 outC = mix(toYCoCg(compress(cur.rgb)), h, blend);
    gl_FragColor = vec4(expand(toRGB(outC)), mix(cur.a, ha, blend));
  }
`

const DOWNSAMPLE_BRIGHT_FRAG = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel; // texel of the SOURCE
  uniform float threshold;
  varying vec2 vUv;
  void main() {
    // 4 bilinear taps = 16-texel box: a proper downsample, no sparkle.
    vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb
           + texture2D(tSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb
           + texture2D(tSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb
           + texture2D(tSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
    c *= 0.25;
    float l = max(max(c.r, c.g), c.b);
    float k = clamp(l - threshold, 0.0, 6.0);
    gl_FragColor = vec4(c * (k / max(l, 1e-4)), 1.0);
  }
`

const BLUR_FRAG = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 dir;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
    c += texture2D(tSrc, vUv + dir * 1.3846153846).rgb * 0.3162162162;
    c += texture2D(tSrc, vUv - dir * 1.3846153846).rgb * 0.3162162162;
    c += texture2D(tSrc, vUv + dir * 3.2307692308).rgb * 0.0702702703;
    c += texture2D(tSrc, vUv - dir * 3.2307692308).rgb * 0.0702702703;
    gl_FragColor = vec4(c, 1.0);
  }
`

const FINAL_FRAG = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tNear;
  uniform sampler2D tFar;
  uniform float uBloom;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    vec4 s = texture2D(tScene, vUv);
    float a = clamp(s.a, 0.0, 1.0);
    vec3 col = a > 1e-4 ? s.rgb / a : vec3(0.0); // un-premultiply for tone mapping

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>

    vec3 glow = texture2D(tNear, vUv).rgb * 0.6 + texture2D(tFar, vUv).rgb * 0.8;
    glow = 1.0 - exp(-glow * uBloom);
    glow = pow(glow, vec3(1.0 / 2.2));

    // ±0.5/255 dither: no banding in the dark gradients.
    float dither = (hash(gl_FragCoord.xy) - 0.5) / 255.0;

    vec3 rgb = gl_FragColor.rgb * a + glow + dither * a;
    gl_FragColor = vec4(rgb, clamp(a + dot(glow, vec3(0.333)), 0.0, 1.0));
  }
`

function halton(index: number, base: number) {
  let f = 1
  let r = 0
  let i = index
  while (i > 0) {
    f /= base
    r += f * (i % base)
    i = Math.floor(i / base)
  }
  return r
}

const JITTER = Array.from({ length: 16 }, (_, i) => [halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5] as const)

function target(opts: { depth?: boolean; format?: THREE.PixelFormat } = {}) {
  return new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    format: opts.format ?? THREE.RGBAFormat,
    depthBuffer: opts.depth ?? false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  })
}

type RendererProps = {
  /** Linear-light level above which pixels start to glow. */
  bloomThreshold?: number
  bloomStrength?: number
  /** Set to true once shaders are compiled and the scene may be shown. */
  readyRef: RefObject<boolean>
}

export function Renderer({ bloomThreshold = 1.7, bloomStrength = 0.25, readyRef }: RendererProps) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  // Perspective or orthographic: both support setViewOffset for the jitter.
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera | THREE.OrthographicCamera

  const res = useMemo(() => {
    const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
    quad.frustumCulled = false
    const fullscreen = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>, toneMapped = false) =>
      new THREE.ShaderMaterial({ vertexShader: FULLSCREEN_VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped })

    const velocity = new THREE.ShaderMaterial({
      vertexShader: VELOCITY_VERT,
      fragmentShader: VELOCITY_FRAG,
      uniforms: {
        uPrevModel: { value: new THREE.Matrix4() },
        uPrevViewProj: { value: new THREE.Matrix4() },
        uCurrViewProj: { value: new THREE.Matrix4() },
      },
    })

    return {
      scene: target({ depth: true }),
      velocity: target({ depth: true, format: THREE.RGFormat }),
      historyA: target(),
      historyB: target(),
      bright: target(),
      blurA: target(),
      near: target(),
      blurB: target(),
      far: target(),
      quad,
      quadCamera,
      velocityMat: velocity,
      resolveMat: fullscreen(RESOLVE_FRAG, {
        tCurrent: { value: null },
        tHistory: { value: null },
        tVelocity: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uBlend: { value: 0.9 },
        uReset: { value: 1 },
      }),
      brightMat: fullscreen(DOWNSAMPLE_BRIGHT_FRAG, {
        tSrc: { value: null },
        uTexel: { value: new THREE.Vector2() },
        threshold: { value: bloomThreshold },
      }),
      blurMat: fullscreen(BLUR_FRAG, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } }),
      finalMat: (() => {
        const m = fullscreen(FINAL_FRAG, {
          tScene: { value: null },
          tNear: { value: null },
          tFar: { value: null },
          uBloom: { value: bloomStrength },
        }, true)
        return m
      })(),
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  res.brightMat.uniforms.threshold.value = bloomThreshold
  res.finalMat.uniforms.uBloom.value = bloomStrength

  const state = useRef({
    frame: 0,
    reset: true,
    readFromA: true,
    prevViewProj: new THREE.Matrix4(),
    currViewProj: new THREE.Matrix4(),
    prevMatrices: new Map<string, THREE.Matrix4>(),
    size: new THREE.Vector2(),
  })

  // Compile every shader variant (screen + offscreen) before the first frame,
  // without blocking the main thread.
  useEffect(() => {
    let cancelled = false
    readyRef.current = false
    const prev = gl.getRenderTarget()
    gl.setRenderTarget(res.scene)
    const job = gl.compileAsync(scene, camera)
    gl.setRenderTarget(prev)
    job
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) {
          readyRef.current = true
          state.current.reset = true
        }
      })
    return () => {
      cancelled = true
    }
  }, [gl, scene, camera, res, readyRef])

  useEffect(
    () => () => {
      ;[res.scene, res.velocity, res.historyA, res.historyB, res.bright, res.blurA, res.near, res.blurB, res.far].forEach((t) => t.dispose())
      ;[res.velocityMat, res.resolveMat, res.brightMat, res.blurMat, res.finalMat].forEach((m) => m.dispose())
      res.quad.geometry.dispose()
    },
    [res],
  )

  useFrame(() => {
    const st = state.current
    gl.setClearColor(0x000000, 0)

    if (!readyRef.current) {
      gl.setRenderTarget(null)
      gl.clear()
      return
    }

    // --- sizes ------------------------------------------------------------
    gl.getDrawingBufferSize(st.size)
    const w = st.size.x
    const h = st.size.y
    if (res.scene.width !== w || res.scene.height !== h) {
      for (const t of [res.scene, res.velocity, res.historyA, res.historyB]) t.setSize(w, h)
      const w4 = Math.max(1, Math.round(w / 4))
      const h4 = Math.max(1, Math.round(h / 4))
      for (const t of [res.bright, res.blurA, res.near]) t.setSize(w4, h4)
      for (const t of [res.blurB, res.far]) t.setSize(Math.max(1, Math.round(w4 / 2)), Math.max(1, Math.round(h4 / 2)))
      st.reset = true
    }

    const pass = (material: THREE.Material, out: THREE.WebGLRenderTarget | null) => {
      res.quad.material = material
      gl.setRenderTarget(out)
      gl.render(res.quad, res.quadCamera)
    }

    // --- 1. jitter ----------------------------------------------------------
    camera.updateMatrixWorld()
    st.currViewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    if (st.reset) st.prevViewProj.copy(st.currViewProj)
    const [jx, jy] = JITTER[st.frame % JITTER.length]
    camera.setViewOffset(w, h, jx, jy, w, h)

    // --- 2. scene → HDR target ---------------------------------------------
    const autoUpdate = gl.shadowMap.autoUpdate
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    gl.setRenderTarget(res.scene)
    gl.clear()
    gl.render(scene, camera)

    // --- 3. velocity ---------------------------------------------------------
    const vm = res.velocityMat
    vm.uniforms.uPrevViewProj.value.copy(st.prevViewProj)
    vm.uniforms.uCurrViewProj.value.copy(st.currViewProj)
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || mesh.userData.velocityHooked) return
      mesh.userData.velocityHooked = true
      const previous = mesh.onBeforeRender
      mesh.onBeforeRender = function (renderer, sc, cam, geo, mat, group) {
        if (mat === vm) {
          const prev = st.prevMatrices.get(mesh.uuid)
          vm.uniforms.uPrevModel.value.copy(prev && !st.reset ? prev : mesh.matrixWorld)
          vm.uniformsNeedUpdate = true
        }
        previous.call(this, renderer, sc, cam, geo, mat, group)
      }
    })
    scene.overrideMaterial = vm
    gl.setRenderTarget(res.velocity)
    gl.clear()
    gl.render(scene, camera)
    scene.overrideMaterial = null
    camera.clearViewOffset()
    gl.shadowMap.autoUpdate = autoUpdate

    // --- 4. TAA resolve -------------------------------------------------------
    const read = st.readFromA ? res.historyA : res.historyB
    const write = st.readFromA ? res.historyB : res.historyA
    const rm = res.resolveMat
    rm.uniforms.tCurrent.value = res.scene.texture
    rm.uniforms.tHistory.value = read.texture
    rm.uniforms.tVelocity.value = res.velocity.texture
    rm.uniforms.uTexel.value.set(1 / w, 1 / h)
    rm.uniforms.uReset.value = st.reset ? 1 : 0
    pass(rm, write)

    // --- 5. bloom ---------------------------------------------------------------
    const bm = res.brightMat
    bm.uniforms.tSrc.value = write.texture
    bm.uniforms.uTexel.value.set(1 / w, 1 / h)
    pass(bm, res.bright)
    const blur = (input: THREE.WebGLRenderTarget, out: THREE.WebGLRenderTarget, dx: number, dy: number) => {
      res.blurMat.uniforms.tSrc.value = input.texture
      res.blurMat.uniforms.dir.value.set(dx / input.width, dy / input.height)
      pass(res.blurMat, out)
    }
    blur(res.bright, res.blurA, 1, 0)
    blur(res.blurA, res.near, 0, 1)
    blur(res.near, res.blurB, 1.5, 0)
    blur(res.blurB, res.far, 0, 1.5)

    // --- 6. final ----------------------------------------------------------------
    const fm = res.finalMat
    fm.uniforms.tScene.value = write.texture
    fm.uniforms.tNear.value = res.near.texture
    fm.uniforms.tFar.value = res.far.texture
    pass(fm, null)

    // --- bookkeeping -------------------------------------------------------------
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      let m = st.prevMatrices.get(mesh.uuid)
      if (!m) st.prevMatrices.set(mesh.uuid, (m = new THREE.Matrix4()))
      m.copy(mesh.matrixWorld)
    })
    st.prevViewProj.copy(st.currViewProj)
    st.readFromA = !st.readFromA
    st.reset = false
    st.frame++
  }, 1)

  return null
}
