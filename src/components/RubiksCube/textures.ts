import * as THREE from 'three'

/**
 * Procedural surface textures for the two finishes that have no good
 * photographic equivalent: the speaker grille and coarse sandblasted grain.
 * Everything else comes from CC0 photogrammetry maps in public/textures
 * (see public/textures/README.md).
 *
 * Textures run edge to edge, over the bevel. RoundedBoxGeometry squeezes the
 * outer ~4.5 % of each face's UVs onto the (narrow) bevel; TAA in Renderer.tsx
 * resolves the resulting sub-pixel detail, so no protective frame is needed.
 * No regular high-frequency patterns except the grille (rendered at 1024² so
 * its mip levels stay round); everything else is random noise, which averages
 * out gracefully instead of forming moiré.
 */

export function createRandom(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

class Field {
  readonly data: Float32Array
  constructor(readonly size: number) {
    this.data = new Float32Array(size * size)
  }
  at(x: number, y: number) {
    const s = this.size
    return this.data[(((y % s) + s) % s) * s + (((x % s) + s) % s)]
  }
  map(fn: (u: number, v: number, x: number, y: number, i: number) => number) {
    const s = this.size
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const i = y * s + x
      this.data[i] = fn((x + 0.5) / s, (y + 0.5) / s, x, y, i)
    }
    return this
  }
  normalize() {
    let min = Infinity
    let max = -Infinity
    for (const v of this.data) {
      if (v < min) min = v
      if (v > max) max = v
    }
    const r = max - min || 1
    for (let i = 0; i < this.data.length; i++) this.data[i] = (this.data[i] - min) / r
    return this
  }
}

function blurField(src: Field, rx: number, ry: number) {
  const s = src.size
  let cur = src
  const pass = (dx: number, dy: number, r: number) => {
    const out = new Field(s)
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      let sum = 0
      for (let k = -r; k <= r; k++) sum += cur.at(x + k * dx, y + k * dy)
      out.data[y * s + x] = sum / (2 * r + 1)
    }
    cur = out
  }
  if (rx) pass(1, 0, rx)
  if (ry) pass(0, 1, ry)
  return cur
}

/* ------------------------------------------------------------------ */
/* Texture builders                                                    */
/* ------------------------------------------------------------------ */

function texture(data: Uint8Array, size: number, srgb = false) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = size > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter
  tex.generateMipmaps = size > 1
  tex.anisotropy = 8
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

function toNormalMap(h: Field, strength: number) {
  const s = h.size
  const data = new Uint8Array(s * s * 4)
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = h.at(x + 1, y - 1) + 2 * h.at(x + 1, y) + h.at(x + 1, y + 1) - h.at(x - 1, y - 1) - 2 * h.at(x - 1, y) - h.at(x - 1, y + 1)
    const dy = h.at(x - 1, y + 1) + 2 * h.at(x, y + 1) + h.at(x + 1, y + 1) - h.at(x - 1, y - 1) - 2 * h.at(x, y - 1) - h.at(x + 1, y - 1)
    const nx = -dx * strength
    const ny = dy * strength
    const len = Math.hypot(nx, ny, 1)
    const i = (y * s + x) * 4
    data[i] = ((nx / len) * 0.5 + 0.5) * 255
    data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255
    data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255
    data[i + 3] = 255
  }
  return texture(data, s)
}

function toGrey(h: Field, lo: number, hi: number, srgb = false) {
  const s = h.size
  const data = new Uint8Array(s * s * 4)
  for (let i = 0; i < h.data.length; i++) {
    const v = (lo + (hi - lo) * h.data[i]) * 255
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  return texture(data, s, srgb)
}

function solid(r: number, g: number, b: number) {
  return texture(new Uint8Array([r, g, b, 255]), 1)
}

/* ------------------------------------------------------------------ */
/* Height fields                                                       */
/* ------------------------------------------------------------------ */

/** Coarse sandblast: two scales of random grain, edge to edge. */
function grain(size: number, seed: number) {
  const rand = createRandom(seed)
  const fine = new Field(size).map(() => rand())
  const coarse = blurField(new Field(size).map(() => rand()), 1, 1)
  const f = new Field(size).map((_u, _v, _x, _y, i) => Math.pow(fine.data[i] * 0.55 + coarse.data[i] * 0.45, 1.4))
  return f.normalize()
}

/**
 * Speaker-grille perforation: staggered round holes across the whole face.
 * Height 1 = metal surface, 0 = hole.
 */
function grille(size: number, holesAcross: number, holeRatio: number) {
  const pitch = 1 / holesAcross
  const r = pitch * holeRatio
  const soft = pitch * 0.07
  return new Field(size).map((u, v) => {
    const pu = u / pitch
    const pv = v / (pitch * 0.866)
    const row = Math.floor(pv)
    const cu = (pu + (row % 2 ? 0.5 : 0)) % 1 - 0.5
    const cv = (pv % 1) - 0.5
    const d = Math.hypot(cu * pitch, cv * pitch * 0.866)
    return THREE.MathUtils.smoothstep(d, r - soft, r + soft)
  })
}

/* ------------------------------------------------------------------ */

export type TextureSet = ReturnType<typeof createTextureSet>

export function createTextureSet() {
  const grainA = grain(512, 29)
  const grainB = grain(512, 31)
  const grilleFine = grille(1024, 30, 0.36)
  const grilleWide = grille(1024, 22, 0.38)

  const set = {
    // Neutral fallbacks: identical texture slots on every material → one
    // shared shader program.
    white: solid(255, 255, 255),
    flatNormal: solid(128, 128, 255),

    grainColorA: toGrey(grainA, 0.25, 1, true),
    grainRoughA: toGrey(grainA, 0.7, 1),
    grainNormalA: toNormalMap(grainA, 0.9),
    grainColorB: toGrey(grainB, 0.3, 1, true),
    grainNormalB: toNormalMap(grainB, 0.9),

    grilleFineColor: toGrey(grilleFine, 0.03, 1, true),
    grilleFineNormal: toNormalMap(grilleFine, 1.4),
    grilleWideColor: toGrey(grilleWide, 0.03, 1, true),
    grilleWideNormal: toNormalMap(grilleWide, 1.4),
  }

  return {
    ...set,
    dispose: () => Object.values(set).forEach((t) => t.dispose()),
  }
}

/* ------------------------------------------------------------------ */
/* Light textures                                                      */
/* ------------------------------------------------------------------ */

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  draw(canvas.getContext('2d')!)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Soft radial falloff — turns rectangular light panels into soft boxes. */
export function createSoftSpotTexture() {
  return canvasTexture(256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(0.45, 'rgba(255,255,255,0.6)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 256, 256)
  })
}

/** Linear fade across the short side — long strip soft boxes. */
export function createSoftBandTexture() {
  return canvasTexture(4, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.5, '#ffffff')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 4, 256)
  })
}

/**
 * Sunlight through a slatted blind, projected by the sun light. The window is
 * far from the cube, so the bands have wide, soft penumbrae, and light
 * scattered by the slats keeps the gaps from going black (~12 % of a band in
 * linear light). Slightly uneven slats and a faint cord shadow keep it from
 * looking like a CG stripe pattern.
 */
export function createBlindsTexture() {
  const S = 512
  return canvasTexture(S, S, (ctx) => {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, S, S)

    ctx.save()
    ctx.filter = 'blur(12px)'
    ctx.translate(S / 2, S / 2)
    ctx.rotate(-0.42)
    // Whole window: light scattered through/around the slats. Canvas values
    // are sRGB: 0.38 alpha ≈ 12 % in linear light.
    ctx.fillStyle = 'rgba(255,255,255,0.38)'
    ctx.fillRect(-S * 0.42, -S * 0.46, S * 0.84, S * 0.92)
    // ~one band per cubie with wide shade between, like the original.
    const slats = 6
    const pitch = (S * 0.9) / slats
    const widths = [0.46, 0.52, 0.44, 0.5, 0.48, 0.45]
    for (let i = 0; i < slats; i++) {
      const y = -S * 0.45 + i * pitch
      const h = pitch * widths[i]
      const a = 0.85 + 0.15 * ((i * 37) % 5) / 4
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`
      ctx.fillRect(-S * 0.42, y, S * 0.84, h)
    }
    // Cord of the blind: a faint vertical shadow across the slats.
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(S * 0.12, -S * 0.5, 8, S)
    ctx.restore()
  })
}
