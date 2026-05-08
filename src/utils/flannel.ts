import { EffectColorSettings, FlannelSettings, FlannelStripe, GlobalSettings } from "../types"

type StripeBand = {
  pos: number
  size: number
  entry: FlannelStripe
}

type Bounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const svgNumber = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, ""))
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

function stripe(color: string, width: number, opacity = 1): FlannelStripe {
  return {
    id: `${color}-${width}-${opacity}`.replace(/[^a-z0-9]/gi, ""),
    color,
    width,
    opacity,
  }
}

export const flannelPresets: Record<Exclude<FlannelSettings["preset"], "custom">, FlannelSettings> = {
  "pop-clash": {
    preset: "pop-clash",
    sett: [
      stripe("#4DC820", 120),
      stripe("#111111", 8),
      stripe("#C4A882", 80),
      stripe("#B0FFD0", 6),
      stripe("#8B7D2A", 70),
      stripe("#111111", 8),
      stripe("#FF2D87", 100),
      stripe("#AADDFF", 6),
      stripe("#CC4400", 80),
      stripe("#6B0060", 12),
    ],
    symmetric: true,
    weaveStyle: "halftone",
    weaveParams: { dotSize: 3, dotSpacing: 7, dotCoverage: 0.5, lineWidth: 1.5, lineSpacing: 5, lineAngle: 45 },
    scale: 0.5,
    rotation: 0,
    backgroundColor: "#0A0A0A",
    invertColors: false,
    canvasResolution: 800,
    pngScale: 1,
  },
  "neon-grid": {
    preset: "neon-grid",
    sett: [
      stripe("#AADDFF", 100),
      stripe("#C8B8FF", 60),
      stripe("#1A1A6E", 120),
      stripe("#5500AA", 20),
      stripe("#FFEE00", 30),
      stripe("#AACC00", 20),
      stripe("#FF44CC", 100),
      stripe("#FFFFFF", 10),
      stripe("#006600", 80),
    ],
    symmetric: true,
    weaveStyle: "halftone",
    weaveParams: { dotSize: 3, dotSpacing: 7, dotCoverage: 0.5, lineWidth: 1.5, lineSpacing: 5, lineAngle: 45 },
    scale: 0.5,
    rotation: 0,
    backgroundColor: "#0A0A0A",
    invertColors: false,
    canvasResolution: 800,
    pngScale: 1,
  },
  "maritime-twill": {
    preset: "maritime-twill",
    sett: [
      stripe("#008B8B", 80),
      stripe("#0A0A7A", 40),
      stripe("#000000", 10),
      stripe("#C0C0C0", 6),
      stripe("#000000", 10),
      stripe("#F5F0C0", 20),
      stripe("#6B6B2A", 6),
      stripe("#40E0A0", 40),
    ],
    symmetric: true,
    weaveStyle: "twill",
    weaveParams: { dotSize: 3, dotSpacing: 7, dotCoverage: 0.5, lineWidth: 1.5, lineSpacing: 5, lineAngle: 45 },
    scale: 0.6,
    rotation: 0,
    backgroundColor: "#0A0A0A",
    invertColors: false,
    canvasResolution: 800,
    pngScale: 1,
  },
}

export const defaultFlannelSettings: FlannelSettings = cloneFlannelSettings(flannelPresets["pop-clash"])

export function cloneFlannelSettings(settings: FlannelSettings): FlannelSettings {
  return {
    ...settings,
    sett: settings.sett.map((entry, index) => ({ ...entry, id: `${entry.id || "stripe"}-${index}` })),
    weaveParams: { ...settings.weaveParams },
  }
}

export function createFlannelStripe(index: number, previous?: FlannelStripe): FlannelStripe {
  const colors = ["#f2f4ee", "#101010", "#4a7c59", "#c4a882", "#ff6030", "#80ccff", "#ff88bb", "#ffdd55"]
  return {
    id: `stripe-${Date.now()}-${index}`,
    color: previous?.color ?? colors[index % colors.length],
    width: previous ? Math.max(4, Math.round(previous.width)) : 40,
    opacity: previous?.opacity ?? 1,
  }
}

export function getMirroredSett(sett: FlannelStripe[], symmetric: boolean) {
  if (!symmetric || sett.length < 2) return sett
  return [...sett, ...sett.slice(1, -1).reverse()]
}

function getBands(settings: FlannelSettings) {
  const bands: StripeBand[] = []
  let pos = 0
  for (const entry of getMirroredSett(settings.sett, settings.symmetric)) {
    const size = Math.max(0, entry.width * settings.scale)
    if (size > 0) {
      bands.push({ pos, size, entry })
      pos += size
    }
  }
  return bands
}

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "").trim()
  const full = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean
  const value = Number.parseInt(full.slice(0, 6), 16)
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

function invertHex(hex: string) {
  const color = hexToRgb(hex)
  return `#${[255 - color.r, 255 - color.g, 255 - color.b].map((value) => value.toString(16).padStart(2, "0")).join("")}`
}

function rgba(hex: string, opacity: number) {
  const color = hexToRgb(hex)
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${clamp01(opacity)})`
}

function fillColor(hex: string, opacity: number, invert: boolean) {
  return rgba(invert ? invertHex(hex) : hex, opacity)
}

function drawHalftone(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  baseColor: string,
  dotColor: string,
  settings: FlannelSettings,
) {
  const { dotSpacing, dotSize, dotCoverage } = settings.weaveParams
  const spacing = Math.max(1, dotSpacing)
  const radius = Math.max(0.2, (dotSize / 2) * Math.sqrt(clamp01(dotCoverage)))
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, width, height)
  ctx.clip()
  ctx.fillStyle = baseColor
  ctx.fillRect(x, y, width, height)
  ctx.fillStyle = dotColor
  ctx.beginPath()
  const minRow = Math.floor(y / spacing)
  const maxRow = Math.ceil((y + height) / spacing) + 1
  const minCol = Math.floor(x / spacing)
  const maxCol = Math.ceil((x + width) / spacing) + 1
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      if ((row + col) % 2 !== 0) continue
      const cx = col * spacing
      const cy = row * spacing
      ctx.moveTo(cx + radius, cy)
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    }
  }
  ctx.fill()
  ctx.restore()
}

function drawTwill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  baseColor: string,
  lineColor: string,
  settings: FlannelSettings,
  fixedAngle?: number,
) {
  const { lineSpacing, lineWidth, lineAngle } = settings.weaveParams
  const spacing = Math.max(1, lineSpacing)
  const length = (Math.max(width, height) + spacing) * 1.5
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, width, height)
  ctx.clip()
  ctx.fillStyle = baseColor
  ctx.fillRect(x, y, width, height)
  ctx.strokeStyle = lineColor
  ctx.lineWidth = Math.max(0.1, lineWidth)
  ctx.lineCap = "butt"
  ctx.translate(x + width / 2, y + height / 2)
  ctx.rotate(((fixedAngle ?? lineAngle) * Math.PI) / 180)
  ctx.beginPath()
  for (let offset = -length; offset <= length; offset += spacing) {
    ctx.moveTo(offset, -length)
    ctx.lineTo(offset, length)
  }
  ctx.stroke()
  ctx.restore()
}

function drawSolid(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, baseColor: string, overlayColor: string) {
  ctx.save()
  ctx.fillStyle = baseColor
  ctx.fillRect(x, y, width, height)
  ctx.globalAlpha = 0.5
  ctx.fillStyle = overlayColor
  ctx.fillRect(x, y, width, height)
  ctx.restore()
}

function drawCrosshatch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  baseColor: string,
  lineColor: string,
  settings: FlannelSettings,
) {
  ctx.save()
  ctx.globalAlpha = 1
  ctx.restore()
  drawTwill(ctx, x, y, width, height, baseColor, lineColor, settings, 45)
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, width, height)
  ctx.clip()
  ctx.globalAlpha = 0.6
  drawTwill(ctx, x, y, width, height, "rgba(0,0,0,0)", lineColor, settings, 135)
  ctx.restore()
}

function createTile(settings: FlannelSettings) {
  const bands = getBands(settings)
  const tileSize = bands.reduce((sum, band) => sum + band.size, 0)
  const canvas = document.createElement("canvas")
  if (tileSize <= 0) {
    canvas.width = 1
    canvas.height = 1
    return canvas
  }
  canvas.width = Math.round(tileSize)
  canvas.height = Math.round(tileSize)
  const ctx = canvas.getContext("2d")
  if (!ctx) return canvas

  ctx.fillStyle = settings.backgroundColor
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (const hBand of bands) {
    for (const vBand of bands) {
      const x = Math.round(vBand.pos)
      const y = Math.round(hBand.pos)
      const width = Math.round(vBand.size)
      const height = Math.round(hBand.size)
      if (width <= 0 || height <= 0) continue
      const hColor = fillColor(hBand.entry.color, hBand.entry.opacity, settings.invertColors)
      const vColor = fillColor(vBand.entry.color, vBand.entry.opacity, settings.invertColors)
      if (settings.weaveStyle === "halftone") drawHalftone(ctx, x, y, width, height, hColor, vColor, settings)
      if (settings.weaveStyle === "twill") drawTwill(ctx, x, y, width, height, hColor, vColor, settings)
      if (settings.weaveStyle === "solid") drawSolid(ctx, x, y, width, height, hColor, vColor)
      if (settings.weaveStyle === "crosshatch") drawCrosshatch(ctx, x, y, width, height, hColor, vColor, settings)
    }
  }
  return canvas
}

function setPatternTransform(pattern: CanvasPattern, width: number, height: number, tile: HTMLCanvasElement, rotation: number, viewScale: number) {
  const matrix = new DOMMatrix()
  matrix.translateSelf(width / 2, height / 2)
  matrix.scaleSelf(viewScale, viewScale)
  if (rotation !== 0) matrix.rotateSelf(0, 0, rotation)
  matrix.translateSelf(-tile.width / 2, -tile.height / 2)
  pattern.setTransform(matrix)
}

export function drawFlannelFrame(
  ctx: CanvasRenderingContext2D,
  settings: FlannelSettings,
  global: GlobalSettings,
  colors: EffectColorSettings,
  width: number,
  height: number,
  transparentBackground: boolean,
  viewScale = 1,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, width, height)
  if (!transparentBackground) {
    ctx.fillStyle = settings.backgroundColor || colors.backgroundColor || global.backgroundColor
    ctx.fillRect(0, 0, width, height)
  }
  const tile = createTile(settings)
  if (tile.width <= 1 && tile.height <= 1) return
  const pattern = ctx.createPattern(tile, "repeat")
  if (!pattern) return
  setPatternTransform(pattern, width, height, tile, settings.rotation, viewScale)
  ctx.fillStyle = pattern
  ctx.fillRect(0, 0, width, height)
}

function strokeAttr(color: string, opacity = 1) {
  const alpha = clamp01(opacity)
  return `stroke="${color}"${alpha < 1 ? ` stroke-opacity="${svgNumber(alpha)}"` : ""}`
}

function fillAttr(color: string, opacity = 1) {
  const alpha = clamp01(opacity)
  return `fill="${color}"${alpha < 1 ? ` fill-opacity="${svgNumber(alpha)}"` : ""}`
}

function rectMarkup(x: number, y: number, width: number, height: number, color: string, opacity = 1) {
  return `<rect x="${svgNumber(x)}" y="${svgNumber(y)}" width="${svgNumber(width)}" height="${svgNumber(height)}" ${fillAttr(color, opacity)}/>`
}

function lineMarkup(x1: number, y1: number, x2: number, y2: number, color: string, width: number, opacity = 1) {
  return `<line x1="${svgNumber(x1)}" y1="${svgNumber(y1)}" x2="${svgNumber(x2)}" y2="${svgNumber(y2)}" ${strokeAttr(color, opacity)} stroke-width="${svgNumber(width)}" stroke-linecap="butt"/>`
}

function clippedLineSegment(cx: number, cy: number, angle: number, offset: number, x: number, y: number, width: number, height: number) {
  const radians = (angle * Math.PI) / 180
  const lineDx = Math.cos(radians)
  const lineDy = Math.sin(radians)
  const px = -lineDy
  const py = lineDx
  const baseX = cx + lineDx * offset
  const baseY = cy + lineDy * offset
  const hits: Array<{ x: number; y: number; t: number }> = []
  const left = x
  const right = x + width
  const top = y
  const bottom = y + height
  const epsilon = 0.001

  if (Math.abs(px) > epsilon) {
    for (const edgeX of [left, right]) {
      const t = (edgeX - baseX) / px
      const hitY = baseY + py * t
      if (hitY >= top - epsilon && hitY <= bottom + epsilon) hits.push({ x: edgeX, y: hitY, t })
    }
  }
  if (Math.abs(py) > epsilon) {
    for (const edgeY of [top, bottom]) {
      const t = (edgeY - baseY) / py
      const hitX = baseX + px * t
      if (hitX >= left - epsilon && hitX <= right + epsilon) hits.push({ x: hitX, y: edgeY, t })
    }
  }
  if (hits.length < 2) return null
  hits.sort((a, b) => a.t - b.t)
  return [hits[0].x, hits[0].y, hits[hits.length - 1].x, hits[hits.length - 1].y] as const
}

function svgLinePattern(x: number, y: number, width: number, height: number, color: string, opacity: number, lineWidth: number, lineSpacing: number, angles: number[]) {
  const cx = x + width / 2
  const cy = y + height / 2
  const length = (Math.max(width, height) + lineSpacing) * 1.5
  const lines: string[] = []
  for (const angle of angles) {
    for (let offset = -length; offset <= length; offset += Math.max(1, lineSpacing)) {
      const segment = clippedLineSegment(cx, cy, angle, offset, x, y, width, height)
      if (segment) lines.push(lineMarkup(segment[0], segment[1], segment[2], segment[3], color, lineWidth, opacity))
    }
  }
  return lines.join("")
}

function svgHalftone(x: number, y: number, width: number, height: number, baseColor: string, baseOpacity: number, dotColor: string, dotOpacity: number, dotSize: number, dotSpacing: number, dotCoverage: number) {
  const spacing = Math.max(1, dotSpacing)
  const radius = Math.max(0.2, (dotSize / 2) * Math.sqrt(clamp01(dotCoverage)))
  const circles: string[] = [rectMarkup(x, y, width, height, baseColor, baseOpacity)]
  const minRow = Math.floor(y / spacing)
  const maxRow = Math.ceil((y + height) / spacing) + 1
  const minCol = Math.floor(x / spacing)
  const maxCol = Math.ceil((x + width) / spacing) + 1
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      if ((row + col) % 2 !== 0) continue
      circles.push(`<circle cx="${svgNumber(col * spacing)}" cy="${svgNumber(row * spacing)}" r="${svgNumber(radius)}" ${fillAttr(dotColor, dotOpacity)}/>`)
    }
  }
  return circles.join("")
}

function rotatedBounds(width: number, height: number, tileSize: number, rotation: number): Bounds {
  if (tileSize <= 0) return { minX: 0, minY: 0, maxX: width, maxY: height }
  const radians = (-rotation * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const originX = width / 2
  const originY = height / 2
  const tileCenter = tileSize / 2
  const corners = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ].map(([x, y]) => ({
    x: (x - originX) * cos - (y - originY) * sin + tileCenter,
    y: (x - originX) * sin + (y - originY) * cos + tileCenter,
  }))
  return {
    minX: Math.floor((Math.min(...corners.map((corner) => corner.x)) - tileSize) / tileSize) * tileSize,
    minY: Math.floor((Math.min(...corners.map((corner) => corner.y)) - tileSize) / tileSize) * tileSize,
    maxX: Math.ceil((Math.max(...corners.map((corner) => corner.x)) + tileSize) / tileSize) * tileSize,
    maxY: Math.ceil((Math.max(...corners.map((corner) => corner.y)) + tileSize) / tileSize) * tileSize,
  }
}

export function renderFlannelSvgMarkup(
  global: GlobalSettings,
  settings: FlannelSettings,
  colors: EffectColorSettings,
  viewScale = 1,
) {
  const width = global.canvasWidth
  const height = global.canvasHeight
  const bands = getBands(settings)
  const tileSize = bands.reduce((sum, band) => sum + band.size, 0)
  if (tileSize <= 0) return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"/>`
  const bounds = rotatedBounds(width, height, tileSize, settings.rotation)
  const cells: string[] = []
  let clipIndex = 0

  for (let tileY = bounds.minY; tileY < bounds.maxY; tileY += tileSize) {
    for (let tileX = bounds.minX; tileX < bounds.maxX; tileX += tileSize) {
      for (const hBand of bands) {
        for (const vBand of bands) {
          const x = Math.round(tileX + vBand.pos)
          const y = Math.round(tileY + hBand.pos)
          const cellWidth = Math.round(vBand.size)
          const cellHeight = Math.round(hBand.size)
          if (cellWidth <= 0 || cellHeight <= 0) continue
          const hColor = settings.invertColors ? invertHex(hBand.entry.color) : hBand.entry.color
          const vColor = settings.invertColors ? invertHex(vBand.entry.color) : vBand.entry.color
          if (settings.weaveStyle === "solid") {
            cells.push(rectMarkup(x, y, cellWidth, cellHeight, hColor, hBand.entry.opacity))
            cells.push(rectMarkup(x, y, cellWidth, cellHeight, vColor, vBand.entry.opacity * 0.5))
            continue
          }
          const clipId = `flannel-cell-${clipIndex}`
          clipIndex += 1
          const clip = `<clipPath id="${clipId}"><rect x="${svgNumber(x)}" y="${svgNumber(y)}" width="${svgNumber(cellWidth)}" height="${svgNumber(cellHeight)}"/></clipPath>`
          const content = settings.weaveStyle === "halftone"
            ? svgHalftone(x, y, cellWidth, cellHeight, hColor, hBand.entry.opacity, vColor, vBand.entry.opacity, settings.weaveParams.dotSize, settings.weaveParams.dotSpacing, settings.weaveParams.dotCoverage)
            : rectMarkup(x, y, cellWidth, cellHeight, hColor, hBand.entry.opacity) + svgLinePattern(
              x,
              y,
              cellWidth,
              cellHeight,
              vColor,
              settings.weaveStyle === "twill" ? vBand.entry.opacity : vBand.entry.opacity * 0.6,
              settings.weaveParams.lineWidth,
              settings.weaveParams.lineSpacing,
              settings.weaveStyle === "twill" ? [settings.weaveParams.lineAngle] : [45, 135],
            )
          cells.push(`${clip}<g clip-path="url(#${clipId})">${content}</g>`)
        }
      }
    }
  }

  const scaleTransform = Math.abs(viewScale - 1) < 0.001
    ? ""
    : ` translate(${svgNumber(width / 2)} ${svgNumber(height / 2)}) scale(${svgNumber(viewScale)}) translate(${svgNumber(-width / 2)} ${svgNumber(-height / 2)})`
  const rotationTransform = settings.rotation === 0
    ? ""
    : ` translate(${svgNumber(width / 2)} ${svgNumber(height / 2)}) rotate(${svgNumber(settings.rotation)}) translate(${svgNumber(-tileSize / 2)} ${svgNumber(-tileSize / 2)})`
  const background = global.transparentBackground
    ? ""
    : `<g id="flannel-background" data-edit="Background layer"><rect width="100%" height="100%" fill="${settings.backgroundColor || colors.backgroundColor}"/></g>`

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg id="flannel-export" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Flannel pattern">
  <title>Flannel Pattern</title>
  <desc>Editable grouped Flannel export with background and woven stripe cells separated for easier editing.</desc>
  ${background}
  <g id="flannel-weave" data-edit="All woven stripe cells"${scaleTransform || rotationTransform ? ` transform="${scaleTransform}${rotationTransform}"` : ""}>
    ${cells.join("\n    ")}
  </g>
</svg>`
}

export function renderFlannelEmbedMarkup(global: GlobalSettings, settings: FlannelSettings, colors: EffectColorSettings) {
  const svg = renderFlannelSvgMarkup(global, settings, colors)
    .replace(/\n\s+/g, "")
    .replace(/>\s+</g, "><")
  return `<div class="flannel-pattern" aria-label="Generated flannel pattern">
  ${svg}
</div>
<style>
  .flannel-pattern {
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    background: ${settings.backgroundColor || colors.backgroundColor};
  }
  .flannel-pattern svg {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>`
}
