import {
  GlobalSettings,
  LegoMosaicSettings,
  MaskedGridSettings,
  NodeGraphSettings,
  PatternModeId,
  PatternShape,
  ReconstructionSettings,
  UploadedAsset,
  EffectColorSettings,
  EffectToneSettings,
} from "../types"
import { clamp, TWO_PI } from "../utils/geometry"
import { hash2D, seededRandom } from "../utils/random"
import { SourceSample, hexToRgb, sampleUploadedAsset, sampleUploadedAssetArea } from "../utils/sourceImage"

type GenerateContext = {
  mode: PatternModeId
  global: GlobalSettings
  lego: LegoMosaicSettings
  masked: MaskedGridSettings
  reconstruction: ReconstructionSettings
  nodeGraph: NodeGraphSettings
  colors: EffectColorSettings
  tone: EffectToneSettings
  uploadedAsset?: UploadedAsset | null
  phase: number
}

type Rgb = { r: number; g: number; b: number; a?: number }

function rgb(color: Rgb) {
  return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`
}

function rgba(color: Rgb, a: number) {
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${clamp(a, 0, 1).toFixed(3)})`
}

function luma(color: Rgb) {
  return (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255
}

function hueShift(color: Rgb, degrees: number): Rgb {
  const angle = (degrees * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return {
    r: clamp((0.213 + cos * 0.787 - sin * 0.213) * color.r + (0.715 - cos * 0.715 - sin * 0.715) * color.g + (0.072 - cos * 0.072 + sin * 0.928) * color.b, 0, 255),
    g: clamp((0.213 - cos * 0.213 + sin * 0.143) * color.r + (0.715 + cos * 0.285 + sin * 0.140) * color.g + (0.072 - cos * 0.072 - sin * 0.283) * color.b, 0, 255),
    b: clamp((0.213 - cos * 0.213 - sin * 0.787) * color.r + (0.715 - cos * 0.715 + sin * 0.715) * color.g + (0.072 + cos * 0.928 + sin * 0.072) * color.b, 0, 255),
    a: color.a,
  }
}

function adjustImageColor(color: Rgb, exposure: number, contrast: number, saturation: number, hue = 0): Rgb {
  let next = hueShift(color, hue)
  next = {
    r: clamp(((next.r / 255 - 0.5) * contrast + 0.5) * 255 * exposure, 0, 255),
    g: clamp(((next.g / 255 - 0.5) * contrast + 0.5) * 255 * exposure, 0, 255),
    b: clamp(((next.b / 255 - 0.5) * contrast + 0.5) * 255 * exposure, 0, 255),
    a: color.a,
  }
  const gray = luma(next) * 255
  return {
    r: clamp(gray + (next.r - gray) * saturation, 0, 255),
    g: clamp(gray + (next.g - gray) * saturation, 0, 255),
    b: clamp(gray + (next.b - gray) * saturation, 0, 255),
    a: color.a,
  }
}

function applyEffectTone(color: Rgb, tone: EffectToneSettings): Rgb {
  const brightness = ((tone.brightness - 50) / 50) * 0.35
  const contrast = 2 ** ((tone.contrast - 50) / 32)
  const gamma = 2 ** ((50 - tone.gamma) / 35)
  const channel = (value: number) => {
    const normalized = clamp(value / 255, 0, 1)
    const corrected = Math.pow(normalized, gamma)
    return clamp(((corrected - 0.5) * contrast + 0.5 + brightness) * 255, 0, 255)
  }
  return {
    r: channel(color.r),
    g: channel(color.g),
    b: channel(color.b),
    a: color.a,
  }
}

function effectInkValue(source: Rgb, tone: EffectToneSettings, invert = false) {
  const base = sourceTone(source, invert)
  const brightness = ((tone.brightness - 50) / 50) * 0.45
  const contrast = 2 ** ((tone.contrast - 50) / 32)
  const gamma = 2 ** ((50 - tone.gamma) / 35)
  const contrasted = (base + brightness - 0.5) * contrast + 0.5
  return clamp(Math.pow(clamp(contrasted, 0, 1), gamma), 0, 1)
}

function effectThreshold(tone: EffectToneSettings) {
  return Math.pow(clamp(tone.threshold / 100, 0, 1), 1.35) * 0.55
}

function posterize(color: Rgb, levels: number): Rgb {
  const step = 255 / Math.max(2, levels - 1)
  return {
    r: Math.round(color.r / step) * step,
    g: Math.round(color.g / step) * step,
    b: Math.round(color.b / step) * step,
    a: color.a,
  }
}

function foregroundColor(global: GlobalSettings, colors?: EffectColorSettings) {
  return hexToRgb(colors?.customColors ? colors.foregroundColor : global.foregroundColor) ?? { r: 242, g: 244, b: 238 }
}

function backgroundColor(global: GlobalSettings, colors?: EffectColorSettings) {
  return colors?.customColors ? colors.backgroundColor : global.backgroundColor
}

function sourceTone(source: Rgb, invert = false) {
  const value = luma(source)
  return clamp(invert ? value : 1 - value, 0, 1)
}

function customOpacity(source: Rgb, colors: EffectColorSettings, opacity: number, tone = sourceTone(source)) {
  if (!colors.customColors) return opacity
  return clamp(opacity * (0.16 + tone * 0.84), 0, 1)
}

function effectColor(source: Rgb, global: GlobalSettings, colors: EffectColorSettings) {
  if (colors.useOriginalColors && !colors.customColors) return source
  return foregroundColor(global, colors)
}

function displayColor(source: Rgb, global: GlobalSettings, colors: EffectColorSettings, settings: ReconstructionSettings) {
  let color = effectColor(source, global, colors)
  if (settings.posterizeColors && colors.useOriginalColors && !colors.customColors) color = posterize(color, settings.colorLevels)
  return rgb(color)
}

function reconstructionSample(sample: SourceSample, tone: EffectToneSettings, settings: ReconstructionSettings) {
  const color = applyEffectTone(sample, tone)
  return settings.posterizeColors ? posterize(color, settings.colorLevels) : color
}

function backgroundShape(global: GlobalSettings, colors: EffectColorSettings): PatternShape[] {
  return global.transparentBackground
    ? []
    : [{
        id: "background",
        x: global.canvasWidth / 2,
        y: global.canvasHeight / 2,
        size: 1,
        width: global.canvasWidth,
        height: global.canvasHeight,
        rotation: 0,
        cornerRadius: 0,
        shapeType: "roundedSquare",
        fill: backgroundColor(global, colors),
        opacity: 1,
      }]
}

function sampleArea(asset: UploadedAsset | null | undefined, x: number, y: number, w: number, h: number, global: GlobalSettings) {
  return sampleUploadedAssetArea(asset, x, y, w, h, global.canvasWidth, global.canvasHeight, asset?.animated ? 1 : 2)
}

function samplePoint(asset: UploadedAsset | null | undefined, x: number, y: number, global: GlobalSettings) {
  return sampleUploadedAsset(asset, x, y, global.canvasWidth, global.canvasHeight)
}

function makeRect(id: string, x: number, y: number, width: number, height: number, fill: string, opacity = 1, cornerRadius = 0): PatternShape {
  return { id, x, y, size: Math.max(width, height), width, height, rotation: 0, cornerRadius, shapeType: "roundedSquare", fill, opacity }
}

function makeLine(id: string, x1: number, y1: number, x2: number, y2: number, width: number, fill: string, opacity = 1): PatternShape {
  return {
    id,
    x: x1,
    y: y1,
    x2,
    y2,
    size: 1,
    height: width,
    rotation: 0,
    cornerRadius: width / 2,
    shapeType: "line",
    stroke: fill,
    strokeWidth: width,
    opacity,
  }
}

function drawCell(id: string, x: number, y: number, size: number, shape: ReconstructionSettings["dotShape"] | "flat", fill: string, opacity: number, cornerRadius = 0): PatternShape {
  if (shape === "circle") return { id, x, y, size, rotation: 0, cornerRadius: size / 2, shapeType: "circle", fill, opacity }
  if (shape === "diamond") return { id, x, y, size, rotation: 45, cornerRadius, shapeType: "diamond", fill, opacity }
  return { id, x, y, size, rotation: 0, cornerRadius, shapeType: "roundedSquare", fill, opacity }
}

function animatedCap(asset?: UploadedAsset | null, staticCap = Number.POSITIVE_INFINITY, animatedCapValue = staticCap) {
  return asset?.animated ? animatedCapValue : staticCap
}

export function generateLegoReconstruction(ctx: GenerateContext): PatternShape[] {
  const { global, lego, uploadedAsset, colors, tone } = ctx
  const shapes = backgroundShape(global, colors)
  const rows = Math.max(8, Math.min(Math.round(lego.gridRows), 120))
  const cellSize = global.canvasHeight / rows
  const cols = Math.ceil(global.canvasWidth / cellSize)
  const tileSize = Math.max(0.5, cellSize - lego.cellGap)
  const light = (lego.lightAngle * Math.PI) / 180
  const lx = Math.cos(light)
  const ly = Math.sin(light)
  const simplifiedStuds = Boolean(uploadedAsset?.animated && rows > 42)

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = col * cellSize + cellSize / 2
      const y = row * cellSize + cellSize / 2
      const sample = sampleArea(uploadedAsset, x, y, cellSize, cellSize, global)
      if (!sample) continue
      const sourceColor = applyEffectTone(sample, tone)
      const color = effectColor(sourceColor, global, colors)
      const base = rgb(color)
      const opacity = customOpacity(sourceColor, colors, sample.a, effectInkValue(sample, tone))
      const id = `lego-${row}-${col}`

      if (lego.shapeType !== "circle") {
        const shapeType = lego.shapeType === "diamond" ? "diamond" : "roundedSquare"
        shapes.push({
          id: `${id}-base`,
          x,
          y,
          size: tileSize,
          rotation: lego.shapeType === "diamond" ? 45 : 0,
          cornerRadius: lego.shapeType === "flat-square" ? 0 : lego.tileCornerRadius,
          shapeType,
          fill: base,
          opacity,
        })
      }

      if (lego.shapeType === "circle") {
        shapes.push({ id: `${id}-circle`, x, y, size: tileSize * lego.shapeRadius * 2, rotation: 0, cornerRadius: tileSize, shapeType: "circle", fill: base, opacity })
        continue
      }

      if (lego.shapeType !== "lego-studs") continue
      const studSize = tileSize * lego.studRadius * 2
      const highlight = {
        r: clamp(color.r + 255 * lego.highlightStrength, 0, 255),
        g: clamp(color.g + 255 * lego.highlightStrength, 0, 255),
        b: clamp(color.b + 255 * lego.highlightStrength, 0, 255),
      }
      const shadow = {
        r: clamp(color.r * (1 - lego.shadowStrength), 0, 255),
        g: clamp(color.g * (1 - lego.shadowStrength), 0, 255),
        b: clamp(color.b * (1 - lego.shadowStrength), 0, 255),
      }
      shapes.push({ id: `${id}-stud`, x, y, size: studSize, rotation: 0, cornerRadius: studSize / 2, shapeType: "circle", fill: rgb({ r: (color.r + highlight.r) / 2, g: (color.g + highlight.g) / 2, b: (color.b + highlight.b) / 2 }), opacity })
      if (simplifiedStuds) continue
      shapes.push({ id: `${id}-stud-shadow`, x: x - lx * studSize * 0.14, y: y - ly * studSize * 0.14, size: studSize * 0.72, rotation: 0, cornerRadius: studSize, shapeType: "circle", fill: rgba(shadow, lego.shadowStrength * 0.55), opacity })
      shapes.push({ id: `${id}-stud-highlight`, x: x + lx * studSize * 0.18, y: y + ly * studSize * 0.18, size: studSize * 0.38, rotation: 0, cornerRadius: studSize, shapeType: "circle", fill: rgba(highlight, lego.highlightStrength * 0.7), opacity })
      shapes.push({ id: `${id}-rim`, x, y, size: studSize, rotation: 0, cornerRadius: studSize / 2, shapeType: "ring", stroke: rgba(shadow, lego.rimStrength), strokeWidth: Math.max(0.35, cellSize * lego.ringThickness), opacity })
    }
  }
  return shapes
}

function maskValue(sample: Rgb | null, settings: MaskedGridSettings, threshold: number) {
  if (!sample) return 0
  const lum = luma(sample)
  const alpha = sample.a ?? 1
  let value = alpha
  if (settings.maskSourceMode === "luminance" || settings.maskSourceMode === "auto") value = lum >= threshold ? alpha : 0
  if (settings.maskSourceMode === "inverted-luminance") value = lum <= threshold ? alpha : 0
  if (settings.maskSourceMode === "alpha") value = alpha >= settings.alphaCutoff ? alpha : 0
  if (settings.invertMask) value = 1 - value
  return clamp(value, 0, 1)
}

export function generateMaskedGrid(ctx: GenerateContext): PatternShape[] {
  const { global, masked, uploadedAsset, phase, colors, tone } = ctx
  const shapes = backgroundShape(global, colors)
  const fg = foregroundColor(global, colors)
  const bg = hexToRgb(masked.backgroundGridColor) ?? { r: 74, g: 124, b: 89 }

  if (masked.backgroundGridEnabled) {
    const pitch = Math.max(animatedCap(uploadedAsset, 6, 14), masked.backgroundSquareSize + masked.backgroundGridGap)
    for (let y = pitch / 2; y < global.canvasHeight; y += pitch) {
      for (let x = pitch / 2; x < global.canvasWidth; x += pitch) {
        const n = hash2D(Math.floor(x / pitch), Math.floor(y / pitch), masked.backgroundSeed)
        const pulse = 0.5 + 0.5 * Math.sin(phase * TWO_PI * masked.backgroundGridSpeed + n * TWO_PI)
        const op = (masked.backgroundOpacityMin + (masked.backgroundOpacityMax - masked.backgroundOpacityMin) * pulse) * masked.backgroundGridIntensity
        shapes.push(drawCell(`bg-${x}-${y}`, x, y, masked.backgroundSquareSize, "flat", rgba(bg, 1), op, masked.backgroundCornerRadius))
      }
    }
  }

  const pitch = Math.max(animatedCap(uploadedAsset, 5, 12), masked.foregroundSquareSize + masked.foregroundGridGap)
  const threshold = effectThreshold(tone)
  for (let y = pitch / 2; y < global.canvasHeight; y += pitch) {
    for (let x = pitch / 2; x < global.canvasWidth; x += pitch) {
      const sample = samplePoint(uploadedAsset, x, y, global)
      const tonedSample = sample ? applyEffectTone(sample, tone) : null
      const value = maskValue(tonedSample, masked, threshold)
      if (value < masked.coverageThreshold) continue
      const n = hash2D(Math.floor(x / pitch), Math.floor(y / pitch), masked.foregroundSeed)
      const pulse = 0.5 + 0.5 * Math.sin(phase * TWO_PI * masked.foregroundSpeed + n * TWO_PI)
      const flicker = n < masked.foregroundFlickerThreshold ? 1 - masked.foregroundFlickerAmount * pulse : 1
      const op = customOpacity(tonedSample ?? { r: 0, g: 0, b: 0, a: value }, colors, (masked.foregroundOpacityMin + (masked.foregroundOpacityMax - masked.foregroundOpacityMin) * pulse) * masked.foregroundIntensity * value * flicker, value)
      shapes.push(drawCell(`fg-${x}-${y}`, x, y, masked.foregroundSquareSize, "flat", rgba(fg, 1), op, masked.foregroundCornerRadius))
    }
  }
  return shapes
}

type NodePoint = {
  x: number
  y: number
  ox: number
  oy: number
  angle: number
  radius: number
  phase: number
  vx: number
  vy: number
}

function gaussianRandom(rand: () => number, mean: number, std: number) {
  let u = 0
  let v = 0
  while (!u) u = rand()
  while (!v) v = rand()
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(TWO_PI * v)
}

function makeNodePoint(rand: () => number, x: number, y: number, cx: number, cy: number, width: number, height: number): NodePoint {
  const nx = clamp(x, 2, width - 2)
  const ny = clamp(y, 2, height - 2)
  const angle = Math.atan2(ny - cy, nx - cx)
  const phase = rand() * TWO_PI
  const velocityAngle = rand() * TWO_PI
  const speed = 0.3 + rand() * 0.9
  return {
    x: nx,
    y: ny,
    ox: nx,
    oy: ny,
    angle,
    radius: Math.hypot(nx - cx, ny - cy),
    phase,
    vx: Math.cos(velocityAngle) * speed,
    vy: Math.sin(velocityAngle) * speed,
  }
}

function distributeNodes(settings: NodeGraphSettings, width: number, height: number): NodePoint[] {
  const rand = seededRandom(settings.randomSeed)
  const points: Array<[number, number]> = []
  const n = Math.max(12, Math.min(360, Math.round(settings.nodeCount)))
  const cx = width / 2
  const cy = height / 2
  const r = Math.min(settings.clusterRadius, Math.min(width, height) * 0.54)
  const gauss = (mean: number, std: number) => gaussianRandom(rand, mean, std)

  switch (settings.distribution) {
    case "uniform":
      for (let i = 0; i < n; i += 1) points.push([cx + (rand() * 2 - 1) * r, cy + (rand() * 2 - 1) * r])
      break
    case "ring":
      for (let i = 0; i < n; i += 1) {
        const a = rand() * TWO_PI
        const rr = r * (0.75 + rand() * 0.25)
        points.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr])
      }
      break
    case "double": {
      const offset = r * 0.45
      for (let i = 0; i < n; i += 1) {
        const side = i % 2 === 0
        points.push([gauss(cx + (side ? -offset : offset), r / 4.5), gauss(cy, r / 4)])
      }
      break
    }
    case "grid": {
      const cols = Math.max(2, Math.round(Math.sqrt(n * 1.1)))
      const rows = Math.ceil(n / cols)
      const sx = (r * 1.85) / Math.max(cols - 1, 1)
      const sy = (r * 1.85) / Math.max(rows - 1, 1)
      const ox = cx - ((cols - 1) * sx) / 2
      const oy = cy - ((rows - 1) * sy) / 2
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols && points.length < n; col += 1) {
          points.push([ox + col * sx + (rand() - 0.5) * sx * 0.12, oy + row * sy + (rand() - 0.5) * sy * 0.12])
        }
      }
      break
    }
    case "hex":
    case "tri": {
      const spacing = (r * 2) / Math.sqrt(n) * 1.45
      const hy = spacing * Math.sqrt(3) / 2
      const cols = Math.ceil((r * 2.2) / spacing) + 2
      const rows = Math.ceil((r * 2.2) / hy) + 2
      const ox = cx - ((cols - 1) * spacing) / 2
      const oy = cy - ((rows - 1) * hy) / 2
      const candidates: Array<[number, number, number]> = []
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const x = ox + col * spacing + (row % 2 === 0 ? 0 : spacing / 2)
          const y = oy + row * hy
          const d = Math.hypot(x - cx, y - cy)
          if (d <= r * 1.05) candidates.push([x, y, d])
        }
      }
      candidates.sort((a, b) => a[2] - b[2])
      candidates.slice(0, n).forEach(([x, y]) => points.push([x + (rand() - 0.5) * spacing * 0.08, y + (rand() - 0.5) * spacing * 0.08]))
      break
    }
    case "radial": {
      points.push([cx, cy])
      let placed = 1
      const rings = Math.max(3, Math.round(Math.sqrt(n / Math.PI) * 1.5))
      const step = r / rings
      for (let ri = 1; ri <= rings && placed < n; ri += 1) {
        const rr = ri * step
        const count = Math.max(4, Math.round(TWO_PI * rr / step))
        for (let k = 0; k < count && placed < n; k += 1, placed += 1) {
          const a = (k / count) * TWO_PI
          points.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr])
        }
      }
      break
    }
    case "star": {
      const arms = 6
      const perArm = Math.ceil(n / arms)
      for (let arm = 0, i = 0; arm < arms && i < n; arm += 1) {
        const base = (arm / arms) * TWO_PI
        for (let k = 0; k < perArm && i < n; k += 1, i += 1) {
          const t = (k + 1) / perArm
          const rr = t * r
          const spread = (1 - t) * 0.12 + 0.015
          const a = base + (rand() - 0.5) * spread * 2
          points.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr])
        }
      }
      break
    }
    case "cross": {
      const mainPerArm = Math.ceil(n * 0.65 / 4)
      const diagPerArm = Math.ceil(n * 0.35 / 4)
      const armWidth = r * 0.18
      for (let arm = 0; arm < 4 && points.length < n; arm += 1) {
        const base = (arm / 4) * TWO_PI
        for (let k = 0; k < mainPerArm && points.length < n; k += 1) {
          const t = k / mainPerArm
          const rr = t * r
          const perp = (rand() - 0.5) * armWidth * (1 - t * 0.5)
          points.push([cx + Math.cos(base) * rr + Math.cos(base + Math.PI / 2) * perp, cy + Math.sin(base) * rr + Math.sin(base + Math.PI / 2) * perp])
        }
      }
      for (let arm = 0; arm < 4 && points.length < n; arm += 1) {
        const base = Math.PI / 4 + (arm / 4) * TWO_PI
        for (let k = 0; k < diagPerArm && points.length < n; k += 1) {
          const t = k / diagPerArm
          const rr = t * r * 0.7
          const perp = (rand() - 0.5) * armWidth * 0.65 * (1 - t * 0.5)
          points.push([cx + Math.cos(base) * rr + Math.cos(base + Math.PI / 2) * perp, cy + Math.sin(base) * rr + Math.sin(base + Math.PI / 2) * perp])
        }
      }
      break
    }
    case "spiral": {
      const turns = 4.5
      const maxT = turns * TWO_PI
      const jitter = (r / maxT) * 0.3
      for (let i = 0; i < n; i += 1) {
        const t = i / Math.max(1, n - 1)
        const theta = t * maxT
        const rr = (r / maxT) * theta
        points.push([cx + Math.cos(theta) * rr + (rand() - 0.5) * jitter, cy + Math.sin(theta) * rr + (rand() - 0.5) * jitter])
      }
      break
    }
    case "fibonacci": {
      const goldenAngle = Math.PI * (3 - Math.sqrt(5))
      for (let i = 0; i < n; i += 1) {
        const rr = Math.sqrt(i / n) * r
        const theta = i * goldenAngle
        points.push([cx + Math.cos(theta) * rr, cy + Math.sin(theta) * rr])
      }
      break
    }
    case "randomWalk": {
      let wx = cx
      let wy = cy
      const step = r / Math.sqrt(n) * 1.8
      for (let i = 0; i < n; i += 1) {
        points.push([wx, wy])
        const dx = cx - wx
        const dy = cy - wy
        const d = Math.hypot(dx, dy) + 0.001
        const bias = Math.min(d / r, 1) * 0.3
        wx += (dx / d) * bias * step + gauss(0, step * 0.5)
        wy += (dy / d) * bias * step + gauss(0, step * 0.5)
        const nd = Math.hypot(wx - cx, wy - cy)
        if (nd > r * 1.1) {
          wx = cx + ((wx - cx) / nd) * r
          wy = cy + ((wy - cy) / nd) * r
        }
      }
      break
    }
    case "fractal": {
      const clusters = Math.max(3, Math.round(Math.sqrt(n / 8)))
      const perCluster = Math.ceil(n / clusters)
      const clusterStd = r / clusters
      for (let c = 0; c < clusters && points.length < n; c += 1) {
        const ccx = gauss(cx, r * 0.38)
        const ccy = gauss(cy, r * 0.38)
        for (let j = 0; j < perCluster && points.length < n; j += 1) points.push([gauss(ccx, clusterStd * 0.7), gauss(ccy, clusterStd * 0.7)])
      }
      break
    }
    case "wave": {
      const bands = Math.max(3, Math.round(Math.sqrt(n / 5)))
      const spacing = (r * 1.8) / (bands + 1)
      const amp = spacing * 0.45
      const freq = TWO_PI / (r * 1.4)
      const perBand = Math.ceil(n / bands)
      for (let band = 0; band < bands && points.length < n; band += 1) {
        const yBase = cy - r * 0.9 + (band + 1) * spacing
        const phase = (band / bands) * TWO_PI
        for (let k = 0; k < perBand && points.length < n; k += 1) {
          const t = k / Math.max(1, perBand - 1)
          const x = cx - r * 0.9 + t * r * 1.8
          points.push([x, yBase + Math.sin(x * freq + phase) * amp + (rand() - 0.5) * spacing * 0.12])
        }
      }
      break
    }
    case "explosion": {
      const streams = Math.max(8, Math.round(n / 8))
      const perStream = Math.ceil(n / streams)
      for (let stream = 0; stream < streams && points.length < n; stream += 1) {
        const base = (stream / streams) * TWO_PI
        const spread = 0.08 + rand() * 0.15
        for (let k = 0; k < perStream && points.length < n; k += 1) {
          const t = Math.pow(rand(), 0.65)
          const rr = t * r
          const a = base + (rand() - 0.5) * spread * (1 + t * 2)
          points.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr])
        }
      }
      break
    }
    case "gaussian":
    default:
      for (let i = 0; i < n; i += 1) points.push([gauss(cx, r / 2.5), gauss(cy, r / 2.5)])
      break
  }

  while (points.length < n) points.push([gauss(cx, r / 2.5), gauss(cy, r / 2.5)])
  return points.slice(0, n).map(([x, y]) => makeNodePoint(rand, x, y, cx, cy, width, height))
}

let nodeGraphCache:
  | {
      key: string
      nodes: NodePoint[]
      lastTime: number
      lastFrame: number
      pulseT: number
    }
  | null = null

function nodeGraphKey(settings: NodeGraphSettings, global: GlobalSettings) {
  return [
    global.canvasWidth,
    global.canvasHeight,
    settings.nodeCount,
    settings.distribution,
    settings.clusterRadius,
    settings.randomSeed,
  ].join(":")
}

function ensureNodeGraphCache(settings: NodeGraphSettings, global: GlobalSettings) {
  const key = nodeGraphKey(settings, global)
  if (!nodeGraphCache || nodeGraphCache.key !== key) {
    nodeGraphCache = {
      key,
      nodes: distributeNodes(settings, global.canvasWidth, global.canvasHeight),
      lastTime: typeof performance === "undefined" ? Date.now() : performance.now(),
      lastFrame: global.currentFrame,
      pulseT: 0,
    }
  }
  return nodeGraphCache
}

function updateNodeGraphPhysics(cache: NonNullable<typeof nodeGraphCache>, settings: NodeGraphSettings, global: GlobalSettings) {
  const now = typeof performance === "undefined" ? Date.now() : performance.now()
  const frameDelta = global.currentFrame >= cache.lastFrame ? global.currentFrame - cache.lastFrame : global.currentFrame
  const frameDt = frameDelta > 0 ? frameDelta / Math.max(1, global.fps) : 0
  const wallDt = Math.max((now - cache.lastTime) / 1000, 0)
  const dt = Math.min(Math.max(wallDt, wallDt < 0.004 ? frameDt : 0), 0.05)
  cache.lastTime = now
  cache.lastFrame = global.currentFrame
  if (settings.motionType === "freeze" || settings.motionSpeed <= 0) {
    cache.nodes.forEach((node) => {
      node.x = node.ox
      node.y = node.oy
    })
    return
  }

  const cx = global.canvasWidth / 2
  const cy = global.canvasHeight / 2
  cache.pulseT += dt
  cache.nodes.forEach((node) => {
    if (settings.motionType === "drift") {
      if (settings.turbulence > 0) {
        node.vx += (hash2D(Math.round(node.ox), Math.round(node.y + cache.pulseT * 100), settings.randomSeed) - 0.5) * settings.turbulence * 0.6
        node.vy += (hash2D(Math.round(node.x + cache.pulseT * 100), Math.round(node.oy), settings.randomSeed + 13) - 0.5) * settings.turbulence * 0.6
      }
      const mag = Math.hypot(node.vx, node.vy)
      if (mag > 1.5) {
        node.vx = (node.vx / mag) * 1.5
        node.vy = (node.vy / mag) * 1.5
      }
      node.x += node.vx * settings.motionSpeed * dt * 60
      node.y += node.vy * settings.motionSpeed * dt * 60
      if (node.x < 2) {
        node.x = 2
        node.vx = Math.abs(node.vx)
      }
      if (node.x > global.canvasWidth - 2) {
        node.x = global.canvasWidth - 2
        node.vx = -Math.abs(node.vx)
      }
      if (node.y < 2) {
        node.y = 2
        node.vy = Math.abs(node.vy)
      }
      if (node.y > global.canvasHeight - 2) {
        node.y = global.canvasHeight - 2
        node.vy = -Math.abs(node.vy)
      }
      return
    }

    if (settings.motionType === "pulse") {
      const pulseFactor = 1 + Math.sin(cache.pulseT * settings.motionSpeed * 1.8 + node.phase) * 0.28
      const jitterX = settings.turbulence > 0 ? (hash2D(Math.round(node.ox), Math.round(cache.pulseT * 100), settings.randomSeed) - 0.5) * settings.turbulence * 4 : 0
      const jitterY = settings.turbulence > 0 ? (hash2D(Math.round(node.oy), Math.round(cache.pulseT * 100), settings.randomSeed + 21) - 0.5) * settings.turbulence * 4 : 0
      node.x = cx + (node.ox - cx) * pulseFactor + jitterX
      node.y = cy + (node.oy - cy) * pulseFactor + jitterY
      return
    }

    if (settings.motionType === "orbit") {
      node.angle += settings.motionSpeed * 0.004 * (1 + (hash2D(Math.round(node.ox), Math.round(cache.pulseT * 100), settings.randomSeed) - 0.5) * settings.turbulence * 0.5)
      const jitterX = settings.turbulence > 0 ? (hash2D(Math.round(node.x), Math.round(cache.pulseT * 100), settings.randomSeed + 31) - 0.5) * settings.turbulence * 3 : 0
      const jitterY = settings.turbulence > 0 ? (hash2D(Math.round(node.y), Math.round(cache.pulseT * 100), settings.randomSeed + 37) - 0.5) * settings.turbulence * 3 : 0
      node.x = cx + Math.cos(node.angle) * node.radius + jitterX
      node.y = cy + Math.sin(node.angle) * node.radius + jitterY
    }
  })
}

export function generateNodeGraph(ctx: GenerateContext): PatternShape[] {
  const { global, nodeGraph, colors } = ctx
  const shapes = backgroundShape(global, colors)
  const baseColor = foregroundColor(global, colors)
  const fill = rgb(baseColor)
  const cache = ensureNodeGraphCache(nodeGraph, global)
  updateNodeGraphPhysics(cache, nodeGraph, global)
  const nodes = cache.nodes

  if (nodeGraph.showConnections) {
    const maxDistance = Math.max(1, nodeGraph.maxDistance)
    const maxDistanceSq = maxDistance * maxDistance
    const cellSize = maxDistance
    const buckets = new Map<string, number[]>()
    const maxLinks = Math.max(700, Math.min(2600, Math.round(3600 - nodes.length * 5)))
    let linkCount = 0

    nodes.forEach((node, index) => {
      const gx = Math.floor(node.x / cellSize)
      const gy = Math.floor(node.y / cellSize)
      const key = `${gx}:${gy}`
      const bucket = buckets.get(key)
      if (bucket) bucket.push(index)
      else buckets.set(key, [index])
    })

    for (let i = 0; i < nodes.length && linkCount < maxLinks; i += 1) {
      const node = nodes[i]
      const gx = Math.floor(node.x / cellSize)
      const gy = Math.floor(node.y / cellSize)

      for (let oy = -1; oy <= 1 && linkCount < maxLinks; oy += 1) {
        for (let ox = -1; ox <= 1 && linkCount < maxLinks; ox += 1) {
          const bucket = buckets.get(`${gx + ox}:${gy + oy}`)
          if (!bucket) continue

          for (const j of bucket) {
            if (j <= i || linkCount >= maxLinks) continue
            const dx = node.x - nodes[j].x
            const dy = node.y - nodes[j].y
            const d2 = dx * dx + dy * dy
            if (d2 >= maxDistanceSq) continue
            const distance = Math.sqrt(d2)
            const alpha = (1 - distance / maxDistance) * nodeGraph.lineOpacity
            shapes.push(makeLine(`node-link-${i}-${j}`, node.x, node.y, nodes[j].x, nodes[j].y, nodeGraph.lineThickness, fill, clamp(alpha, 0, 1)))
            linkCount += 1
          }
        }
      }
    }
  }

  nodes.forEach((node, index) => {
    if (nodeGraph.glowIntensity > 0) {
      shapes.push({
        id: `node-glow-${index}`,
        x: node.x,
        y: node.y,
        size: nodeGraph.nodeSize * (2.7 + nodeGraph.glowIntensity * 0.28),
        rotation: 0,
        cornerRadius: nodeGraph.nodeSize,
        shapeType: "circle",
        fill,
        opacity: clamp(nodeGraph.glowIntensity / 80, 0, 0.32),
      })
    }
    shapes.push({
      id: `node-${index}`,
      x: node.x,
      y: node.y,
      size: nodeGraph.nodeSize * 2,
      rotation: 0,
      cornerRadius: nodeGraph.nodeSize,
      shapeType: "circle",
      fill,
      opacity: 1,
    })
  })

  return shapes
}

const bayer2 = [
  [0, 2],
  [3, 1],
]

const bayer4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

const bayer8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
]

export function generateReconstruction(ctx: GenerateContext): PatternShape[] {
  const { mode, global, reconstruction: s, uploadedAsset, colors, tone } = ctx
  const shapes = backgroundShape(global, colors)
  const threshold = effectThreshold(tone)

  if (mode === "halftone-dots") {
    const spacing = Math.max(animatedCap(uploadedAsset, 5, 16), s.gridSpacing)
    for (let y = spacing / 2; y < global.canvasHeight; y += spacing) {
      for (let x = spacing / 2; x < global.canvasWidth; x += spacing) {
        const sample = samplePoint(uploadedAsset, x, y, global)
        if (!sample) continue
        const color = reconstructionSample(sample, tone, s)
        const value = sourceTone(color, s.invertColors)
        const size = clamp(s.minDotSize + value * (s.maxDotSize - s.minDotSize), 0, s.maxDotSize)
        if (size < 0.2 || value < threshold) continue
        shapes.push(drawCell(`dot-${x}-${y}`, x, y, size, s.dotShape, displayColor(color, global, colors, s), customOpacity(color, colors, sample.a * s.dotOpacity, value), size * 0.12))
      }
    }
    return shapes
  }

  if (mode === "ascii-grid") {
    const chars = s.characterSet || " .:-=+*#%@"
    const spacingX = Math.max(animatedCap(uploadedAsset, 5, 14), s.characterSpacingX)
    const spacingY = Math.max(animatedCap(uploadedAsset, 7, 18), s.characterSpacingY)
    for (let y = spacingY; y < global.canvasHeight; y += spacingY) {
      for (let x = spacingX / 2; x < global.canvasWidth; x += spacingX) {
        const sample = samplePoint(uploadedAsset, x, y, global)
        if (!sample) continue
        const color = reconstructionSample(sample, tone, s)
        const value = sourceTone(color, s.invertColors)
        if (value < threshold) continue
        const text = chars[Math.min(chars.length - 1, Math.floor(value * (chars.length - 1)))]
        shapes.push({ id: `ascii-${x}-${y}`, x, y, size: s.characterSize, text, fontSize: s.characterSize, fontFamily: s.fontFamily, fontWeight: s.fontWeight, rotation: 0, cornerRadius: 0, shapeType: "text", fill: displayColor(color, global, colors, s), opacity: customOpacity(color, colors, sample.a * s.textOpacity, value) })
      }
    }
    return shapes
  }

  if (mode === "scanline-reconstruction") {
    const spacing = Math.max(animatedCap(uploadedAsset, 3, 12), s.lineSpacing)
    const sampleStep = Math.max(animatedCap(uploadedAsset, 4, 18), s.lineLength)
    for (let y = spacing / 2; y < global.canvasHeight; y += spacing) {
      for (let x = sampleStep / 2; x < global.canvasWidth; x += sampleStep) {
        const sample = sampleArea(uploadedAsset, x, y, sampleStep, spacing, global)
        if (!sample) continue
        const color = reconstructionSample(sample, tone, s)
        const value = sourceTone(color, s.invertColors)
        if (value < threshold) continue
        shapes.push(makeRect(`line-${x}-${y}`, x, y, sampleStep * value, s.lineThickness, displayColor(color, global, colors, s), customOpacity(color, colors, sample.a * s.scanlineOpacity * value, value), s.lineThickness / 2))
      }
    }
    return shapes
  }

  if (mode === "ordered-dither") {
    const size = Math.max(animatedCap(uploadedAsset, 3, 10), s.markSize)
    for (let y = size / 2; y < global.canvasHeight; y += size) {
      for (let x = size / 2; x < global.canvasWidth; x += size) {
        const sample = samplePoint(uploadedAsset, x, y, global)
        if (!sample) continue
        const color = reconstructionSample(sample, tone, s)
        const ms = s.matrixSize === 2 ? 2 : s.matrixSize === 8 ? 8 : 4
        const matrix = ms === 2 ? bayer2 : ms === 8 ? bayer8 : bayer4
        const matrixValue = matrix[Math.floor(y / size) % ms][Math.floor(x / size) % ms] / (ms * ms)
        const value = sourceTone(color, s.invertColors)
        if (value * s.ditherStrength < matrixValue * (0.3 + tone.threshold / 100)) continue
        shapes.push(drawCell(`dither-${x}-${y}`, x, y, size * 0.82, s.markShape, displayColor(color, global, colors, s), customOpacity(color, colors, sample.a * s.dotOpacity, value), size * 0.08))
      }
    }
    return shapes
  }

  return shapes
}

export function generateMediaReconstruction(ctx: GenerateContext) {
  if (ctx.mode === "lego-mosaic") return generateLegoReconstruction(ctx)
  if (ctx.mode === "masked-grid-shimmer") return generateMaskedGrid(ctx)
  if (ctx.mode === "node-graph") return generateNodeGraph(ctx)
  return generateReconstruction(ctx)
}
