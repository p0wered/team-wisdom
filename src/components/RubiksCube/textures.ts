import * as THREE from 'three'

/**
 * Procedural light textures for the cube's lighting rig (Lighting.tsx), plus
 * a small seeded random generator for repeatable per-material variation.
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

/**
 * Sunlight through a slatted blind, projected by the sun light. The window is
 * far from the cube, so the bands have wide, soft penumbrae, and light
 * scattered by the slats keeps the gaps from going black (~12 % of a band in
 * linear light). Slightly uneven slats and a faint cord shadow keep it from
 * looking like a CG stripe pattern.
 */
export function createBlindsTexture(
  /**
   * Slant of the slats in the texture, radians. Where the bands land depends
   * on it AND on the sun's direction (see BLINDS_SLANT in Lighting.tsx).
   */
  slant: number,
) {
  const S = 512
  return canvasTexture(S, S, (ctx) => {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, S, S)

    ctx.save()
    ctx.filter = 'blur(12px)'
    ctx.translate(S / 2, S / 2)
    ctx.rotate(slant)
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
