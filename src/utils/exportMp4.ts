import { svgMarkupToCanvas } from "./exportPng"
import { downloadFile } from "./exportSvg"

type Mp4ExportOptions = {
  generateSvgForFrame?: (frameIndex: number, phase: number) => string | Promise<string>
  drawFrame?: (context: CanvasRenderingContext2D, frameIndex: number, phase: number, width: number, height: number) => void | Promise<void>
  realtime?: boolean
  width: number
  height: number
  duration: number
  fps: number
  filename: string
  onProgress?: (progress: number) => void
}

const mp4MimeTypes = [
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4;codecs=h264",
  "video/mp4",
]

function getSupportedMp4MimeType() {
  if (typeof MediaRecorder === "undefined") return ""
  return mp4MimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? ""
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function animationFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

function bitrateForSize(width: number, height: number, fps: number) {
  const pixels = width * height
  const base = pixels >= 1920 * 1080 ? 10_000_000 : pixels >= 1280 * 720 ? 6_500_000 : 3_500_000
  return Math.round(base * (fps > 30 ? 1.45 : 1))
}

export async function exportMp4({ generateSvgForFrame, drawFrame, realtime = false, width, height, duration, fps, filename, onProgress }: Mp4ExportOptions) {
  if (!("captureStream" in HTMLCanvasElement.prototype)) {
    throw new Error("MP4 export is not supported in this browser.")
  }
  const mimeType = getSupportedMp4MimeType()
  if (!mimeType) {
    throw new Error("MP4 export is not supported in this browser.")
  }

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d", { alpha: true })
  if (!context) throw new Error("Canvas is unavailable.")
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = "high"

  const safeFps = Math.min(60, Math.max(1, Math.round(fps)))
  const safeDuration = Math.max(0.5, duration)
  const frameCount = Math.max(1, Math.ceil(safeDuration * safeFps))
  const delay = 1000 / safeFps

  const stream = canvas.captureStream(safeFps)
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined
  if (!track) throw new Error("Could not start MP4 stream.")

  const chunks: Blob[] = []
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: bitrateForSize(width, height, fps),
  })
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }

  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve()
    recorder.onerror = () => reject(new Error("MP4 export failed."))
  })

  recorder.start(1000)
  const startedAt = performance.now()
  try {
    if (realtime) {
      let frameIndex = 0
      while (performance.now() - startedAt < safeDuration * 1000) {
        const elapsed = Math.max(0, performance.now() - startedAt)
        const phase = Math.min(1, elapsed / (safeDuration * 1000))
        if (drawFrame) {
          await drawFrame(context, frameIndex, phase, width, height)
        } else if (generateSvgForFrame) {
          const svg = await generateSvgForFrame(frameIndex, phase)
          const frameCanvas = await svgMarkupToCanvas(svg, width, height, 1)
          context.clearRect(0, 0, width, height)
          context.drawImage(frameCanvas, 0, 0, width, height)
        } else {
          throw new Error("MP4 export has no frame renderer.")
        }
        track.requestFrame?.()
        onProgress?.(phase)
        frameIndex += 1
        await animationFrame()
      }
      onProgress?.(1)
    } else {
      for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
        const phase = frameIndex / frameCount
        if (drawFrame) {
          await drawFrame(context, frameIndex, phase, width, height)
        } else if (generateSvgForFrame) {
          const svg = await generateSvgForFrame(frameIndex, phase)
          const frameCanvas = await svgMarkupToCanvas(svg, width, height, 1)
          context.clearRect(0, 0, width, height)
          context.drawImage(frameCanvas, 0, 0, width, height)
        } else {
          throw new Error("MP4 export has no frame renderer.")
        }
        track.requestFrame?.()
        onProgress?.((frameIndex + 1) / frameCount)
        const nextFrameAt = startedAt + (frameIndex + 1) * delay
        const waitMs = nextFrameAt - performance.now()
        if (waitMs > 0) await wait(waitMs)
        else await animationFrame()
      }
    }
  } finally {
    if (recorder.state !== "inactive") recorder.stop()
    track.stop()
    stream.getTracks().forEach((streamTrack) => streamTrack.stop())
  }

  await stopped
  const blob = new Blob(chunks, { type: mimeType })
  downloadFile(await blob.arrayBuffer(), filename, mimeType)
}
