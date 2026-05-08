import { GIFEncoder, applyPalette, quantize } from "gifenc"
import { EffectColorSettings, GlobalSettings, StarburstSettings } from "../types"
import { createStarburstRays, drawStarburstFrame, hexToRgb } from "./starburst"
import { downloadFile } from "./exportSvg"

type Options = {
  global: GlobalSettings
  settings: StarburstSettings
  colors: EffectColorSettings
  filename: string
  viewScale?: number
  onProgress?: (progress: number) => void
}

const qualityToColors = {
  high: 256,
  medium: 160,
  low: 64,
}

function sleep(ms = 0) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function snapColorsToPaletteLocal(palette: number[][], colors: number[][], threshold = 44) {
  const thresholdSq = threshold * threshold
  colors.forEach((color) => {
    let bestIndex = -1
    let bestDistance = Number.POSITIVE_INFINITY
    palette.forEach((entry, index) => {
      const distance = (entry[0] - color[0]) ** 2 + (entry[1] - color[1]) ** 2 + (entry[2] - color[2]) ** 2
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = index
      }
    })
    if (bestIndex >= 0 && bestDistance <= thresholdSq) palette[bestIndex] = color
  })
}

export async function exportStarburstGif({ global, settings, colors, filename, viewScale: requestedViewScale = 1, onProgress }: Options) {
  const width = global.canvasWidth
  const height = global.canvasHeight
  const viewScale = Math.min(4, Math.max(0.5, requestedViewScale))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Canvas is unavailable.")

  const encoder = GIFEncoder()
  const frameCount = Math.max(2, global.gifFrameCount)
  const fps = Math.max(1, global.gifFps)
  const delay = Math.round(1000 / fps)
  const colorCount = qualityToColors[global.gifQuality] ?? 256
  const forcedColors = [
    Object.values(hexToRgb(colors.foregroundColor)),
    Object.values(hexToRgb(colors.backgroundColor)),
    Object.values(hexToRgb(settings.lineColor)),
  ]

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const phase = frameIndex / frameCount
    const time = phase * global.animationDuration * settings.animSpeed
    const rays = createStarburstRays(settings)
    drawStarburstFrame(context, rays, global, settings, colors, time, global.transparentBackground, undefined, viewScale)
    const imageData = context.getImageData(0, 0, width, height)
    const palette = quantize(imageData.data, colorCount, { format: "rgb565" })
    snapColorsToPaletteLocal(palette, forcedColors)
    const indexed = applyPalette(imageData.data, palette, "rgb565")
    encoder.writeFrame(indexed, width, height, {
      palette,
      delay,
      repeat: global.gifLoop ? 0 : -1,
    })
    onProgress?.((frameIndex + 1) / frameCount)
    if (frameIndex % 5 === 0) await sleep()
  }

  encoder.finish()
  const bytes = encoder.bytesView()
  const output = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(output).set(bytes)
  downloadFile(output, filename, "image/gif")
}
