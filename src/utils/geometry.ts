export const TWO_PI = Math.PI * 2

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

export function mix(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function ellipseDistance(
  x: number,
  y: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
) {
  const dx = (x - cx) / rx
  const dy = (y - cy) / ry
  return Math.sqrt(dx * dx + dy * dy)
}

export function gaussian(x: number, center: number, width: number) {
  return Math.exp(-Math.pow((x - center) / width, 2))
}

export function snap(value: number, unit: number) {
  return Math.round(value / unit) * unit
}

export function easeOutBack(t: number) {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}
