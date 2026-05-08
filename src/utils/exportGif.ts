import { GIFEncoder, applyPalette, quantize } from "gifenc"
import { GifExportOptions } from "../types"
import { downloadFile } from "./exportSvg"
import { svgMarkupToCanvas } from "./exportPng"

const qualityPresets = {
  high: {
    colors: 256,
    scale: 1,
    sampleFrames: 64,
    samplePixelBudget: 260_000,
    roundRGB: 2,
  },
  medium: {
    colors: 128,
    scale: 0.78,
    sampleFrames: 48,
    samplePixelBudget: 170_000,
    roundRGB: 4,
  },
  low: {
    colors: 64,
    scale: 0.58,
    sampleFrames: 36,
    samplePixelBudget: 110_000,
    roundRGB: 8,
  },
}

function nextTick() {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}

function appendSampledPixels(target: number[], data: Uint8ClampedArray, maxPixels: number) {
  const pixelCount = data.length / 4
  const stride = Math.max(1, Math.ceil(pixelCount / maxPixels))
  for (let pixel = 0; pixel < pixelCount; pixel += stride) {
    const index = pixel * 4
    target.push(data[index], data[index + 1], data[index + 2], data[index + 3])
  }
}

function roundByte(value: number, step: number) {
  if (step <= 1) return value
  return Math.max(0, Math.min(255, Math.round(value / step) * step))
}

function prequantizeFrame(data: Uint8ClampedArray, roundRGB: number, transparentBackground: boolean) {
  for (let index = 0; index < data.length; index += 4) {
    data[index] = roundByte(data[index], roundRGB)
    data[index + 1] = roundByte(data[index + 1], roundRGB)
    data[index + 2] = roundByte(data[index + 2], roundRGB)
    data[index + 3] = transparentBackground ? (data[index + 3] <= 127 ? 0 : 255) : 255
  }
}

export async function exportGif({
  generateSvgForFrame,
  width,
  height,
  frameCount,
  fps,
  scale,
  quality,
  loop,
  filename,
  transparentBackground,
  onProgress,
}: GifExportOptions) {
  const gif = GIFEncoder()
  const delay = Math.round(1000 / fps)
  const preset = qualityPresets[quality]
  const outputScale = Math.max(0.25, scale * preset.scale)
  const paletteFormat = transparentBackground ? "rgba4444" : "rgb565"
  const paletteSamples: number[] = []
  const sampleFrameCount = Math.min(frameCount, preset.sampleFrames)
  const sampleStride = Math.max(1, Math.floor(frameCount / Math.max(1, sampleFrameCount)))

  for (let sampleIndex = 0; sampleIndex < frameCount; sampleIndex += sampleStride) {
    const frameIndex = Math.min(frameCount - 1, sampleIndex)
    const phase = frameIndex / frameCount
    const svg = await generateSvgForFrame(frameIndex, phase)
    const canvas = await svgMarkupToCanvas(svg, width, height, outputScale)
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Canvas is unavailable.")
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    appendSampledPixels(paletteSamples, imageData.data, Math.max(1, Math.round(preset.samplePixelBudget / sampleFrameCount)))
    onProgress?.((sampleIndex / frameCount) * 0.22)
    await nextTick()
  }

  const paletteData = new Uint8ClampedArray(paletteSamples)
  prequantizeFrame(paletteData, preset.roundRGB, Boolean(transparentBackground))
  const palette = quantize(paletteData, preset.colors, {
    format: paletteFormat,
    oneBitAlpha: transparentBackground ? 127 : false,
  })
  const transparentIndex = transparentBackground
    ? palette.findIndex((color) => color[3] !== undefined && color[3] < 128)
    : -1

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const phase = frameIndex / frameCount
    const svg = await generateSvgForFrame(frameIndex, phase)
    const canvas = await svgMarkupToCanvas(svg, width, height, outputScale)
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Canvas is unavailable.")
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    prequantizeFrame(imageData.data, preset.roundRGB, Boolean(transparentBackground))
    const indexed = applyPalette(imageData.data, palette, paletteFormat)
    gif.writeFrame(indexed, canvas.width, canvas.height, {
      palette,
      delay,
      repeat: loop ? 0 : -1,
      transparent: Boolean(transparentBackground && transparentIndex >= 0),
      transparentIndex: transparentIndex >= 0 ? transparentIndex : 0,
    })
    onProgress?.(0.22 + ((frameIndex + 1) / frameCount) * 0.78)
    await nextTick()
  }

  gif.finish()
  const bytes = gif.bytesView()
  const output = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(output).set(bytes)
  downloadFile(output, filename, "image/gif")
}
