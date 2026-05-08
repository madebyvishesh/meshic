import { TWO_PI } from "./geometry"

export function seededRandom(seed: number) {
  let state = Math.floor(seed) || 1
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

export function hash2D(i: number, j: number, seed: number) {
  let h = (i * 374761393 + j * 668265263 + seed * 1442695041) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  h = Math.imul(h, 1274126177) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function valueNoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)

  const a = hash2D(xi, yi, seed)
  const b = hash2D(xi + 1, yi, seed)
  const c = hash2D(xi, yi + 1, seed)
  const d = hash2D(xi + 1, yi + 1, seed)
  const x1 = a + (b - a) * u
  const x2 = c + (d - c) * u
  return x1 + (x2 - x1) * v
}

export function loopingNoise(x: number, y: number, t: number, seed: number) {
  const angle = t * TWO_PI
  const radius = 1.35
  const a = valueNoise(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, seed)
  const b = valueNoise(x + Math.cos(angle + Math.PI) * radius, y + Math.sin(angle + Math.PI) * radius, seed + 37)
  const c = valueNoise(x * 0.55 + Math.sin(angle) * radius, y * 0.55 + Math.cos(angle) * radius, seed + 91)
  return (a * 0.5 + b * 0.3 + c * 0.2)
}
