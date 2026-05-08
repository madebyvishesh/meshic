import { UploadedAsset } from "../types"
import { clamp } from "./geometry"

export type SourceSample = {
  r: number
  g: number
  b: number
  a: number
}

export function getContainedAssetPlacement(asset: UploadedAsset, width: number, height: number) {
  const fitMode = asset.fitMode ?? "contain"
  const fitScale =
    fitMode === "cover"
      ? Math.max(width / asset.width, height / asset.height)
      : fitMode === "stretch"
        ? 1
        : Math.min(width / asset.width, height / asset.height)
  const placedWidth = fitMode === "stretch" ? width * asset.scale : asset.width * fitScale * asset.scale
  const placedHeight = fitMode === "stretch" ? height * asset.scale : asset.height * fitScale * asset.scale
  return {
    x: (width - placedWidth) / 2,
    y: (height - placedHeight) / 2,
    width: placedWidth,
    height: placedHeight,
  }
}

export function sampleUploadedAssetArea(
  asset: UploadedAsset | null | undefined,
  x: number,
  y: number,
  sampleWidth: number,
  sampleHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  steps = 3,
): SourceSample | null {
  if (!asset?.visible || !asset.sample) return null
  let r = 0
  let g = 0
  let b = 0
  let a = 0
  let count = 0
  const safeSteps = Math.max(1, Math.round(steps))
  for (let iy = 0; iy < safeSteps; iy += 1) {
    for (let ix = 0; ix < safeSteps; ix += 1) {
      const px = x - sampleWidth / 2 + ((ix + 0.5) / safeSteps) * sampleWidth
      const py = y - sampleHeight / 2 + ((iy + 0.5) / safeSteps) * sampleHeight
      const sample = sampleUploadedAsset(asset, px, py, canvasWidth, canvasHeight)
      if (!sample) continue
      r += sample.r * sample.a
      g += sample.g * sample.a
      b += sample.b * sample.a
      a += sample.a
      count += 1
    }
  }
  if (count === 0 || a <= 0) return null
  return {
    r: r / a,
    g: g / a,
    b: b / a,
    a: clamp(a / count, 0, 1),
  }
}

export function sampleUploadedAsset(
  asset: UploadedAsset | null | undefined,
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
): SourceSample | null {
  if (!asset?.visible || !asset.sample) return null
  const placement = getContainedAssetPlacement(asset, canvasWidth, canvasHeight)
  const nx = (x - placement.x) / placement.width
  const ny = (y - placement.y) / placement.height
  if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null

  const sx = clamp(Math.floor(nx * asset.sample.width), 0, asset.sample.width - 1)
  const sy = clamp(Math.floor(ny * asset.sample.height), 0, asset.sample.height - 1)
  const index = (sy * asset.sample.width + sx) * 4
  const alpha = asset.sample.data[index + 3] / 255
  if (alpha < 0.08) return null

  return {
    r: asset.sample.data[index],
    g: asset.sample.data[index + 1],
    b: asset.sample.data[index + 2],
    a: alpha * asset.opacity,
  }
}

export function sourceSampleToRgb(sample: SourceSample) {
  return `rgb(${sample.r}, ${sample.g}, ${sample.b})`
}

export function hexToRgb(color: string) {
  if (!color.startsWith("#")) return null
  const raw = color.slice(1)
  if (raw.length === 3) {
    return {
      r: Number.parseInt(raw[0] + raw[0], 16),
      g: Number.parseInt(raw[1] + raw[1], 16),
      b: Number.parseInt(raw[2] + raw[2], 16),
    }
  }
  if (raw.length === 6) {
    return {
      r: Number.parseInt(raw.slice(0, 2), 16),
      g: Number.parseInt(raw.slice(2, 4), 16),
      b: Number.parseInt(raw.slice(4, 6), 16),
    }
  }
  return null
}

function colorDistance(a: SourceSample, b: { r: number; g: number; b: number }) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2)
}

export function sourceSampleToVisibleRgb(sample: SourceSample, foregroundColor: string, backgroundColor: string) {
  const background = hexToRgb(backgroundColor)
  if (background && colorDistance(sample, background) < 70) {
    return foregroundColor
  }
  return sourceSampleToRgb(sample)
}

export function sourceSampleToMonochromeRgb(sample: SourceSample, foregroundColor: string) {
  const foreground = hexToRgb(foregroundColor)
  if (!foreground) return foregroundColor
  const luminance = (0.2126 * sample.r + 0.7152 * sample.g + 0.0722 * sample.b) / 255
  return `rgb(${Math.round(foreground.r * luminance)}, ${Math.round(foreground.g * luminance)}, ${Math.round(foreground.b * luminance)})`
}

export function sourceSampleToModeRgb(
  sample: SourceSample,
  foregroundColor: string,
  backgroundColor: string,
  mode: "source" | "monochrome" | "black-white" | "custom",
  customColor = foregroundColor,
) {
  if (mode === "monochrome") return sourceSampleToMonochromeRgb(sample, foregroundColor)
  if (mode === "custom") return sourceSampleToMonochromeRgb(sample, customColor)
  if (mode === "black-white") {
    const luminance = (0.2126 * sample.r + 0.7152 * sample.g + 0.0722 * sample.b) / 255
    return luminance >= 0.5 ? "#ffffff" : "#000000"
  }
  return sourceSampleToVisibleRgb(sample, foregroundColor, backgroundColor)
}
