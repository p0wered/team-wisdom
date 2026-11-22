import { useEffect, useRef } from 'react'
import type { Theme } from '../../theme'
import styles from './Backdrop.module.css'

/**
 * The room behind the cube, drawn by a tiny fragment shader instead of CSS
 * gradients.
 *
 * Why: the wall spans only a handful of brightness levels across the whole
 * screen. A CSS gradient is rounded to 8 bits as it is
 * painted, so each level becomes a visible band, and noise laid on top
 * afterwards can't undo rounding that already happened. Here the gradient is
 * computed in floating point and dithered (±½ level) *before* it is written
 * out, so the steps dissolve. Film grain lives in the same pass and is signed
 * (darker and lighter specks), like real grain.
 *
 * Redraws ~12×/s for the grain flicker; once under reduced motion. If WebGL
 * is unavailable the canvas stays transparent and the CSS gradient under it
 * shows instead.
 */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

/**
 * The room picture per theme. Each snippet sets `vec3 col` from `p` (CSS px,
 * top-left origin), `css` (viewport, CSS px) and `uv` (0–1).
 */
const SCENES: Record<Theme, string> = {
  // A dark room: the wall lighter towards the window, a faint warm glow, and
  // a soft sheet of sunlight across the floor.
  dark: `

  // Wall: ellipse 120% × 85% centred at 38% / 0%, lighter towards the window.
  float t = length((uv - vec2(0.38, 0.0)) / vec2(1.2, 0.85));
  vec3 col = t < 0.42
    ? mix(rgb(25.0, 24.0, 23.0), rgb(13.0, 12.0, 12.0), t / 0.42)
    : mix(rgb(13.0, 12.0, 12.0), rgb(6.0, 6.0, 6.0), clamp((t - 0.42) / 0.30, 0.0, 1.0));

  // Warm glow near the window (upper left).
  float g = length((uv - vec2(0.45, 0.125)) / vec2(0.35, 0.375));
  col = mix(col, rgb(255.0, 236.0, 214.0), 0.05 * (1.0 - smoothstep(0.0, 1.0, g)));

  // Soft sheet of sunlight across the floor: a long ellipse near the bottom,
  // tilted 6°, brightest a little left of centre, feathered like a blur.
  vec2 c = vec2(0.5, 0.84) * css;
  vec2 halfSize = vec2(0.8, 0.12) * css;
  float a = radians(6.0);
  vec2 q = p - c;
  q = vec2(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a));
  float e = length(q / halfSize);
  float feather = 34.0 / halfSize.y;
  float inside = 1.0 - smoothstep(1.0 - feather, 1.0 + feather, e);
  float s = clamp(q.x / (2.0 * halfSize.x) + 0.5, 0.0, 1.0);
  float profile =
      s < 0.22 ? mix(0.0, 0.04, s / 0.22)
    : s < 0.42 ? mix(0.04, 0.09, (s - 0.22) / 0.20)
    : s < 0.68 ? mix(0.09, 0.03, (s - 0.42) / 0.26)
    :            mix(0.03, 0.0, (s - 0.68) / 0.32);
  col = mix(col, rgb(255.0, 238.0, 220.0), profile * inside);
`,
  // A pale wall in morning sun: bands of light from the blind, slanted 21°.
  light: `

  // Wall: Apple's pale grey, a little brighter and warmer towards the window
  // (upper left), a little deeper towards the floor (lower right).
  float t = length((uv - vec2(0.15, 0.0)) / vec2(1.25, 1.1));
  vec3 col = mix(rgb(246.0, 245.0, 244.0), rgb(233.0, 233.0, 236.0), smoothstep(0.0, 1.0, t));

  // Sun through the blind, landing on the wall behind the cube: a soft,
  // slanted patch of light cut into bands by the slats. Everything is
  // blurred heavily — the wall is far from the window.
  vec2 c = vec2(0.70, 0.47) * css;
  float a = radians(-21.0);
  vec2 q = p - c;
  q = vec2(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a));
  q.x += q.y * 0.28; // sheared: light falls in at an angle
  vec2 halfSize = vec2(0.27 * css.x, 0.40 * css.y);
  float feather = 0.10 * css.y;
  float patchX = 1.0 - smoothstep(halfSize.x - feather, halfSize.x + feather, abs(q.x));
  float patchY = 1.0 - smoothstep(halfSize.y - feather, halfSize.y + feather, abs(q.y));
  float window = patchX * patchY;
  float period = 0.125 * css.y;
  float ph = fract(q.y / period);
  float slat = smoothstep(0.0, 0.22, ph) * (1.0 - smoothstep(0.46, 0.70, ph));
  float sun = window * (0.30 + 0.70 * slat);
  col = mix(col, rgb(255.0, 251.0, 244.0), sun * 0.82);

  // Faint warm haze where the sun enters (upper left).
  float g = length((uv - vec2(0.18, 0.05)) / vec2(0.55, 0.5));
  col = mix(col, rgb(255.0, 250.0, 240.0), 0.35 * (1.0 - smoothstep(0.0, 1.0, g)));
`,
}

const frag = (scene: string) => `
precision highp float;
uniform vec2 uRes;      // drawing-buffer size, device px
uniform float uDpr;
uniform float uFrame;   // grain frame index
uniform float uGrain;   // grain amplitude (fraction of full scale)

float hash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

vec3 rgb(float r, float g, float b) { return vec3(r, g, b) / 255.0; }

void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 css = uRes / uDpr;                       // viewport in CSS px
  vec2 p = vec2(px.x, uRes.y - px.y) / uDpr;    // CSS px, top-left origin
  vec2 uv = p / css;
${scene}

  // Film grain: one value per CSS pixel per frame, signed.
  float grain = hash(vec3(floor(p), uFrame)) - 0.5;
  col += grain * uGrain;

  // Dither (triangular, ±½ of an 8-bit level) before the output is rounded.
  float d = hash(vec3(px, uFrame + 17.0)) + hash(vec3(px.yx, uFrame + 41.0)) - 1.0;
  col += d / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
`

const FPS = 12

/** Grain amplitude per theme: dark grain reads stronger on a light wall. */
const GRAIN: Record<Theme, number> = { dark: 0.022, light: 0.014 }

type BackdropProps = {
  theme: Theme
  className?: string
  /** Grain amplitude: 0 = off, ~0.03 = clearly filmic. Defaults per theme. */
  grain?: number
}

export function Backdrop({ theme, className, grain: grainProp }: BackdropProps) {
  const grain = grainProp ?? GRAIN[theme]
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    })
    // Without WebGL (or if the shader fails) hide the canvas: the CSS
    // gradient underneath is the same picture, just with banding.
    const fallBack = () => {
      canvas.style.display = 'none'
    }
    if (!gl) return fallBack()

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (import.meta.env.DEV && !gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error('Backdrop shader:', gl.getShaderInfoLog(sh))
      }
      return sh
    }
    const program = gl.createProgram()!
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, frag(SCENES[theme])))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      if (import.meta.env.DEV) console.error('Backdrop shader:', gl.getProgramInfoLog(program))
      return fallBack()
    }
    gl.useProgram(program)

    // One triangle that covers the screen.
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(program, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(program, 'uRes')
    const uDpr = gl.getUniformLocation(program, 'uDpr')
    const uFrame = gl.getUniformLocation(program, 'uFrame')
    const uGrain = gl.getUniformLocation(program, 'uGrain')

    let frame = 0
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, w, h)
      gl.uniform2f(uRes, w, h)
      gl.uniform1f(uDpr, dpr)
      gl.uniform1f(uFrame, frame % 997)
      gl.uniform1f(uGrain, grain)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let last = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (now - last < 1000 / FPS) return
      last = now
      frame++
      draw()
    }

    const resize = new ResizeObserver(() => draw())
    resize.observe(canvas)
    draw()
    if (!reduced) raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      resize.disconnect()
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    }
  }, [grain, theme])

  return <canvas ref={canvasRef} className={[styles.canvas, className].filter(Boolean).join(' ')} aria-hidden="true" />
}
