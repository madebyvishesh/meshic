import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties, MouseEvent } from "react"
import { flushSync } from "react-dom"
import { Check, Copy, Maximize2, Minus, Moon, Pause, Play, Plus, RefreshCw, RotateCcw, Sun } from "lucide-react"
import ControlPanel from "./components/ControlPanel"
import FlannelCanvas from "./components/FlannelCanvas"
import NodeGraphCanvas from "./components/NodeGraphCanvas"
import PatternPreview, { generateShapesForMode, renderPatternSvgMarkup } from "./components/PatternPreview"
import StarburstCanvas from "./components/StarburstCanvas"
import { EffectColorSettings, EffectToneSettings, GlobalSettings, ModeSettings, PatternModeId, PatternShape, UploadedAsset } from "./types"
import { exportGif } from "./utils/exportGif"
import { defaultFlannelSettings, drawFlannelFrame, renderFlannelEmbedMarkup, renderFlannelSvgMarkup } from "./utils/flannel"
import { exportMp4 } from "./utils/exportMp4"
import { exportNodeGraphGif } from "./utils/exportNodeGraphGif"
import { exportPng } from "./utils/exportPng"
import { exportStarburstGif } from "./utils/exportStarburstGif"
import { downloadFile, exportSvg, serializeSvg } from "./utils/exportSvg"

type Theme = "dark" | "light"
type ExportFormat = "svg" | "png" | "gif" | "mp4"
type BackgroundChoice = "transparent" | "dark" | "mid" | "light" | "white" | "custom"
type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => {
    ready: Promise<void>
    finished: Promise<void>
  }
}

const storageKey = "pattern-generator-v6"
const defaultUploadedAssetScale = 1
const uploadedAssetCanvasHeight = 720
const defaultSourceUrl = `${import.meta.env.BASE_URL}default-source.png`
const minStandaloneViewScale = 0.5
const maxStandaloneViewScale = 4
const maxUploadedVideoGifFrames = 360

const validPatternModes: PatternModeId[] = [
  "lego-mosaic",
  "masked-grid-shimmer",
  "node-graph",
  "starburst",
  "flannel",
  "halftone-dots",
  "ascii-grid",
  "scanline-reconstruction",
  "ordered-dither",
]

const defaultEffectColor: EffectColorSettings = {
  useOriginalColors: true,
  customColors: false,
  foregroundColor: "#f2f4ee",
  backgroundColor: "#050505",
}

const defaultEffectColors = validPatternModes.reduce((colors, mode) => ({
  ...colors,
  [mode]: { ...defaultEffectColor, ...(["node-graph", "starburst", "flannel"].includes(mode) ? { useOriginalColors: false, customColors: true } : {}) },
}), {} as Record<PatternModeId, EffectColorSettings>)

const defaultEffectTone: EffectToneSettings = {
  brightness: 50,
  contrast: 50,
  threshold: 50,
  gamma: 50,
}

const defaultEffectTones = validPatternModes.reduce((tones, mode) => ({
  ...tones,
  [mode]: { ...defaultEffectTone },
}), {} as Record<PatternModeId, EffectToneSettings>)

const starterPalettes: Record<Theme, { foreground: string; background: string; backgroundChoice: BackgroundChoice }> = {
  dark: { foreground: "#f2f4ee", background: "#050505", backgroundChoice: "dark" },
  light: { foreground: "#202421", background: "#ffffff", backgroundChoice: "white" },
}

function makeStarterEffectColors(theme: Theme) {
  const palette = starterPalettes[theme]
  return validPatternModes.reduce((colors, mode) => ({
    ...colors,
    [mode]: {
      useOriginalColors: false,
      customColors: true,
      foregroundColor: palette.foreground,
      backgroundColor: palette.background,
    },
  }), {} as Record<PatternModeId, EffectColorSettings>)
}

const defaultGlobalSettings: GlobalSettings = {
  canvasWidth: 720,
  canvasHeight: 720,
  foregroundColor: "#f2f4ee",
  backgroundColor: "#050505",
  randomSeed: 12047,
  animationEnabled: true,
  animationDuration: 10,
  fps: 8,
  frameCount: 60,
  animationPhase: 0,
  currentFrame: 0,
  posterLayoutEnabled: false,
  transparentBackground: false,
  exportScale: 4,
  titleText: "Pattern Study",
  descriptionText: "A procedural vector system\nwith editable geometry,\ncolor and motion.",
  patternAreaX: 70,
  patternAreaY: 310,
  patternAreaWidth: 580,
  patternAreaHeight: 300,
  gifWidth: 720,
  gifHeight: 720,
  gifScale: 1,
  gifFps: 30,
  gifFrameCount: 60,
  gifLoop: true,
  gifQuality: "high",
  mp4Resolution: 720,
  mp4Fps: 30,
}

const defaultModeSettings: ModeSettings = {
  legoMosaic: {
    shapeType: "lego-studs",
    gridRows: 36,
    cellGap: 1,
    tileCornerRadius: 2,
    exposure: 1,
    hueShift: 0,
    saturation: 1,
    contrast: 1,
    shapeRadius: 0.35,
    studRadius: 0.35,
    ringThickness: 0.1,
    lightAngle: 45,
    highlightStrength: 0.35,
    shadowStrength: 0.35,
    rimStrength: 0.35,
    hoverPreview: false,
    hoverRadius: 120,
    randomSeed: 404,
  },
  maskedGrid: {
    maskSourceMode: "auto",
    threshold: 0.5,
    invertMask: false,
    softMask: false,
    coverageThreshold: 0.5,
    alphaCutoff: 0.08,
    luminanceThreshold: 0.72,
    chromaKeyColor: "#ffffff",
    chromaTolerance: 0.2,
    edgeSensitivity: 0.35,
    foregroundIntensity: 1,
    foregroundSpeed: 1,
    foregroundSquareSize: 10,
    foregroundGridGap: 4,
    foregroundCornerRadius: 1,
    foregroundOpacityMin: 0.45,
    foregroundOpacityMax: 1,
    foregroundFlickerAmount: 0.35,
    foregroundFlickerThreshold: 0.18,
    foregroundSeed: 220,
    backgroundGridEnabled: true,
    backgroundGridColor: "#4a7c59",
    backgroundGridIntensity: 0.28,
    backgroundGridSpeed: 0.55,
    backgroundSquareSize: 7,
    backgroundGridGap: 9,
    backgroundCornerRadius: 1,
    backgroundOpacityMin: 0.06,
    backgroundOpacityMax: 0.28,
    backgroundFlickerAmount: 0.2,
    backgroundSeed: 770,
  },
  reconstruction: {
    threshold: 0.5,
    contrast: 1.15,
    exposure: 1,
    saturation: 1,
    invertColors: false,
    useOriginalColors: true,
    tintColor: "#f2f4ee",
    tintStrength: 0,
    posterizeColors: false,
    colorLevels: 6,
    dotSize: 18,
    gridSpacing: 18,
    dotShape: "circle",
    minDotSize: 0.5,
    maxDotSize: 13,
    dotOpacity: 1,
    characterSet: " .:-=+*#%@",
    characterSize: 14,
    characterSpacingX: 11,
    characterSpacingY: 16,
    fontFamily: "IBM Plex Mono, monospace",
    fontWeight: "600",
    textOpacity: 0.95,
    lineSpacing: 10,
    lineThickness: 2,
    scanlineOpacity: 0.95,
    lineLength: 18,
    scanDirection: "horizontal",
    matrixSize: 4,
    ditherStrength: 1,
    markSize: 9,
    markShape: "square",
    flickerAmount: 0,
    randomSeed: 990,
  },
  nodeGraph: {
    preset: "neural-web",
    nodeCount: 120,
    nodeSize: 2.5,
    glowIntensity: 8,
    maxDistance: 95,
    lineThickness: 0.35,
    lineOpacity: 0.45,
    showConnections: true,
    motionSpeed: 0.35,
    motionType: "drift",
    turbulence: 0.05,
    distribution: "gaussian",
    clusterRadius: 230,
    randomSeed: 606,
  },
  starburst: {
    rayCount: 35,
    rayLenMin: 80,
    rayLenMax: 320,
    clusterBias: 0,
    clusterDirection: 270,
    secondaryNodes: true,
    secondaryChance: 0.45,
    hubX: 0,
    hubY: 80,
    hubSize: 11,
    hubGlow: 30,
    nodeSizeMin: 4,
    nodeSizeMax: 8,
    nodeGlow: 12,
    lineColor: "#ffffff",
    lineOpacity: 0.45,
    lineWidth: 0.7,
    swayIntensity: 1.2,
    pulseSpeed: 1,
    animSpeed: 1,
    lengthBreathe: true,
    randomSeed: 808,
  },
  flannel: defaultFlannelSettings,
  effectColors: defaultEffectColors,
  effectTone: defaultEffectTones,
}

const backgroundChoices: Record<Exclude<BackgroundChoice, "transparent" | "custom">, string> = {
  dark: "#050505",
  mid: "#555555",
  light: "#e8e4de",
  white: "#ffffff",
}

function normalizePatternMode(mode?: PatternModeId) {
  return mode && validPatternModes.includes(mode) ? mode : "lego-mosaic"
}

function parseSvgDimensions(svgText: string) {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml")
  const svg = doc.querySelector("svg")
  const width = Number.parseFloat(svg?.getAttribute("width") ?? "")
  const height = Number.parseFloat(svg?.getAttribute("height") ?? "")
  const viewBox = svg?.getAttribute("viewBox")?.split(/[\s,]+/).map(Number)
  return {
    width: Number.isFinite(width) && width > 0 ? width : viewBox && viewBox.length === 4 ? viewBox[2] : 720,
    height: Number.isFinite(height) && height > 0 ? height : viewBox && viewBox.length === 4 ? viewBox[3] : 720,
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Could not read uploaded file."))
    reader.readAsDataURL(file)
  })
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Could not read uploaded SVG."))
    reader.readAsText(file)
  })
}

function getImageDimensions(src: string) {
  return new Promise<{ width: number; height: number; element: HTMLImageElement }>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth || 720, height: image.naturalHeight || 720, element: image })
    image.onerror = () => reject(new Error("Could not load uploaded image."))
    image.src = src
  })
}

function getVideoDimensions(src: string) {
  return new Promise<{ width: number; height: number; element: HTMLVideoElement }>((resolve, reject) => {
    const video = document.createElement("video")
    video.muted = true
    video.loop = true
    video.playsInline = true
    video.preload = "auto"
    video.onloadeddata = () => {
      video.play().catch(() => undefined)
      resolve({ width: video.videoWidth || 720, height: video.videoHeight || 720, element: video })
    }
    video.onerror = () => reject(new Error("Could not load uploaded video."))
    video.src = src
    video.load()
  })
}

function attachAnimatedMediaElement(element: HTMLImageElement | HTMLVideoElement) {
  element.style.position = "fixed"
  element.style.left = "-9999px"
  element.style.top = "0"
  element.style.width = "1px"
  element.style.height = "1px"
  element.style.opacity = "0"
  element.style.pointerEvents = "none"
  element.setAttribute("aria-hidden", "true")
  document.body.appendChild(element)
}

function sampleMediaElement(
  element: HTMLImageElement | HTMLVideoElement,
  width: number,
  height: number,
  includePreview = false,
) {
  const maxSampleSize = includePreview ? 480 : 720
  const sampleScale = Math.min(1, maxSampleSize / Math.max(width, height))
  const sampleWidth = Math.max(1, Math.round(width * sampleScale))
  const sampleHeight = Math.max(1, Math.round(height * sampleScale))
  const canvas = document.createElement("canvas")
  canvas.width = sampleWidth
  canvas.height = sampleHeight
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) throw new Error("Could not sample uploaded file.")
  context.clearRect(0, 0, sampleWidth, sampleHeight)
  context.drawImage(element, 0, 0, sampleWidth, sampleHeight)
  const imageData = context.getImageData(0, 0, sampleWidth, sampleHeight)
  return {
    sample: { width: sampleWidth, height: sampleHeight, data: imageData.data },
    previewHref: includePreview ? canvas.toDataURL("image/png") : undefined,
  }
}

function isVideoFile(file: File) {
  return file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name)
}

function isGifFile(file: File) {
  return file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif")
}

function waitForMediaEvent(element: HTMLMediaElement, eventName: string, timeout = 1200) {
  return new Promise<void>((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      element.removeEventListener(eventName, done)
      resolve()
    }
    const timer = window.setTimeout(done, timeout)
    element.addEventListener(eventName, done, { once: true })
  })
}

async function exportCanvasPng(canvas: HTMLCanvasElement, filename: string, scale: number, width: number, height: number) {
  const output = document.createElement("canvas")
  output.width = Math.round(width * scale)
  output.height = Math.round(height * scale)
  const context = output.getContext("2d")
  if (!context) throw new Error("Canvas is unavailable.")
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = "high"
  context.drawImage(canvas, 0, 0, output.width, output.height)
  const blob = await new Promise<Blob>((resolve, reject) => {
    output.toBlob((result) => (result ? resolve(result) : reject(new Error("Could not export PNG."))), "image/png")
  })
  downloadFile(await blob.arrayBuffer(), filename, "image/png")
}

function clampStandaloneViewScale(value: number) {
  return Math.min(maxStandaloneViewScale, Math.max(minStandaloneViewScale, value))
}

function applySvgViewScale(markup: string, width: number, height: number, scale: number) {
  const clampedScale = clampStandaloneViewScale(scale)
  if (Math.abs(clampedScale - 1) < 0.001) return markup
  const transform = `translate(${width / 2} ${height / 2}) scale(${clampedScale}) translate(${-width / 2} ${-height / 2})`
  const open = `  <g id="standalone-view-scale" data-edit="Generated artwork zoom" transform="${transform}">`
  if (markup.includes('<g id="node-graph-connections"')) {
    return markup
      .replace('  <g id="node-graph-connections"', `${open}\n  <g id="node-graph-connections"`)
      .replace(/\n<\/svg>$/, "\n  </g>\n</svg>")
  }
  if (markup.includes('<g id="starburst-lines"')) {
    return markup
      .replace('  <g id="starburst-lines"', `${open}\n  <g id="starburst-lines"`)
      .replace(/\n<\/svg>$/, "\n  </g>\n</svg>")
  }
  if (markup.includes('<g id="flannel-weave"')) {
    return markup
      .replace('  <g id="flannel-weave"', `${open}\n  <g id="flannel-weave"`)
      .replace(/\n<\/svg>$/, "\n  </g>\n</svg>")
  }
  return markup
}

function getCanvasSizeForAsset(width: number, height: number) {
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  return {
    width: Math.max(1, Math.round((uploadedAssetCanvasHeight * safeWidth) / safeHeight)),
    height: uploadedAssetCanvasHeight,
  }
}

function getVideoExportSize(canvasWidth: number, canvasHeight: number, resolution: 480 | 720 | 1080) {
  const aspect = canvasWidth / Math.max(1, canvasHeight)
  const landscape = aspect >= 1
  const width = landscape ? Math.round(resolution * aspect) : resolution
  const height = landscape ? resolution : Math.round(resolution / aspect)
  const maxLongEdge = resolution === 1080 ? 1920 : resolution === 720 ? 1280 : 854
  const longEdge = Math.max(width, height)
  if (longEdge <= maxLongEdge) return { width, height }
  const scale = maxLongEdge / longEdge
  return {
    width: Math.max(2, Math.round(width * scale)),
    height: Math.max(2, Math.round(height * scale)),
  }
}

function getCanvasBackgroundForMode(mode: PatternModeId, global: GlobalSettings, modeSettings: ModeSettings) {
  const colors = modeSettings.effectColors[mode]
  return colors?.customColors ? colors.backgroundColor : global.backgroundColor
}

function roundedRectPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.max(0, Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2))
  context.beginPath()
  context.moveTo(x + r, y)
  context.lineTo(x + width - r, y)
  context.quadraticCurveTo(x + width, y, x + width, y + r)
  context.lineTo(x + width, y + height - r)
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  context.lineTo(x + r, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - r)
  context.lineTo(x, y + r)
  context.quadraticCurveTo(x, y, x + r, y)
  context.closePath()
}

function drawShapeToCanvas(context: CanvasRenderingContext2D, shape: PatternShape) {
  const opacity = Math.max(0, Math.min(1, shape.opacity))
  if (opacity <= 0) return
  context.save()
  context.globalAlpha *= opacity

  if (shape.shapeType === "text") {
    context.fillStyle = shape.fill ?? "currentColor"
    context.font = `${shape.fontWeight ?? 600} ${shape.fontSize ?? shape.size}px ${shape.fontFamily ?? "IBM Plex Mono, monospace"}`
    context.textAlign = "center"
    context.textBaseline = "middle"
    context.fillText(shape.text ?? "", shape.x, shape.y)
    context.restore()
    return
  }

  if (shape.shapeType === "circle") {
    context.fillStyle = shape.fill ?? "currentColor"
    context.beginPath()
    context.arc(shape.x, shape.y, shape.size / 2, 0, Math.PI * 2)
    context.fill()
    context.restore()
    return
  }

  if (shape.shapeType === "ring") {
    context.strokeStyle = shape.stroke ?? shape.fill ?? "currentColor"
    context.lineWidth = shape.strokeWidth ?? 1
    context.beginPath()
    context.arc(shape.x, shape.y, shape.size / 2, 0, Math.PI * 2)
    context.stroke()
    context.restore()
    return
  }

  if (shape.shapeType === "line") {
    context.strokeStyle = shape.stroke ?? shape.fill ?? "currentColor"
    context.lineWidth = shape.strokeWidth ?? shape.height ?? 1
    context.lineCap = "round"
    context.beginPath()
    context.moveTo(shape.x, shape.y)
    context.lineTo(shape.x2 ?? shape.x, shape.y2 ?? shape.y)
    context.stroke()
    context.restore()
    return
  }

  const width = shape.width ?? shape.size
  const height = shape.height ?? shape.size
  const radius = shape.shapeType === "squircle"
    ? shape.size * 0.32
    : Math.min(shape.cornerRadius, width / 2, height / 2)
  context.translate(shape.x, shape.y)
  context.rotate((shape.rotation * Math.PI) / 180)
  context.scale(shape.scale ?? 1, shape.scale ?? 1)
  roundedRectPath(context, -width / 2, -height / 2, width, height, radius)
  if (shape.shapeType === "hollowRoundedSquare") {
    context.strokeStyle = shape.stroke ?? "currentColor"
    context.lineWidth = shape.strokeWidth ?? 1
    context.stroke()
  } else {
    context.fillStyle = shape.fill ?? "currentColor"
    context.fill()
  }
  context.restore()
}

function drawPatternFrameToCanvas(
  context: CanvasRenderingContext2D,
  mode: PatternModeId,
  global: GlobalSettings,
  modeSettings: ModeSettings,
  uploadedAsset: UploadedAsset | null | undefined,
  phase: number,
) {
  context.clearRect(0, 0, global.canvasWidth, global.canvasHeight)
  if (!global.transparentBackground) {
    context.fillStyle = getCanvasBackgroundForMode(mode, global, modeSettings)
    context.fillRect(0, 0, global.canvasWidth, global.canvasHeight)
  }
  const shapes = generateShapesForMode(mode, global, modeSettings, phase, global.currentFrame, uploadedAsset)
  for (const shape of shapes) drawShapeToCanvas(context, shape)
}

function loadSavedState() {
  try {
    const saved = localStorage.getItem(storageKey)
    if (!saved) return null
    return JSON.parse(saved) as Partial<{
      selectedMode: PatternModeId
      globalSettings: GlobalSettings
      modeSettings: ModeSettings
      theme: Theme
      exportFormat: ExportFormat
      backgroundChoice: BackgroundChoice
      customBackground: string
    }>
  } catch {
    return null
  }
}

function mergeDefaults<T extends Record<string, unknown>>(defaults: T, saved?: Partial<T>): T {
  return { ...defaults, ...(saved ?? {}) }
}

function mergeEffectColors(saved?: Partial<Record<PatternModeId, Partial<EffectColorSettings>>>) {
  return validPatternModes.reduce((colors, mode) => ({
    ...colors,
    [mode]: mergeDefaults(defaultEffectColors[mode], saved?.[mode]),
  }), {} as Record<PatternModeId, EffectColorSettings>)
}

function mergeEffectTones(saved?: Partial<Record<PatternModeId, Partial<EffectToneSettings>>>) {
  return validPatternModes.reduce((tones, mode) => ({
    ...tones,
    [mode]: mergeDefaults(defaultEffectTones[mode], saved?.[mode]),
  }), {} as Record<PatternModeId, EffectToneSettings>)
}

export default function App() {
  const saved = useMemo(loadSavedState, [])
  const [selectedMode, setSelectedMode] = useState<PatternModeId>("halftone-dots")
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(() =>
    ({
      ...mergeDefaults(defaultGlobalSettings, saved?.globalSettings),
      gifFps: defaultGlobalSettings.gifFps,
      gifScale: defaultGlobalSettings.gifScale,
      gifQuality: defaultGlobalSettings.gifQuality,
    }),
  )
  const [modeSettings, setModeSettings] = useState<ModeSettings>(() => ({
    legoMosaic: mergeDefaults(defaultModeSettings.legoMosaic, saved?.modeSettings?.legoMosaic),
    maskedGrid: mergeDefaults(defaultModeSettings.maskedGrid, saved?.modeSettings?.maskedGrid),
    reconstruction: mergeDefaults(defaultModeSettings.reconstruction, saved?.modeSettings?.reconstruction),
    nodeGraph: mergeDefaults(defaultModeSettings.nodeGraph, saved?.modeSettings?.nodeGraph),
    starburst: mergeDefaults(defaultModeSettings.starburst, saved?.modeSettings?.starburst),
    flannel: mergeDefaults(defaultModeSettings.flannel, saved?.modeSettings?.flannel),
    effectColors: mergeEffectColors(saved?.modeSettings?.effectColors),
    effectTone: mergeEffectTones(saved?.modeSettings?.effectTone),
  }))
  const [theme, setTheme] = useState<Theme>(saved?.theme ?? "dark")
  const [exportFormat, setExportFormat] = useState<ExportFormat>(saved?.exportFormat ?? "png")
  const [backgroundChoice, setBackgroundChoice] = useState<BackgroundChoice>(saved?.backgroundChoice ?? "dark")
  const [customBackground, setCustomBackground] = useState(saved?.customBackground ?? "#050505")
  const [toast, setToast] = useState("Ready")
  const [sidebarWidth, setSidebarWidth] = useState(340)
  const [isResizing, setIsResizing] = useState(false)
  const [exportingGif, setExportingGif] = useState(false)
  const [gifProgress, setGifProgress] = useState(0)
  const [standaloneViewScale, setStandaloneViewScale] = useState(1)
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied" | "failed">("idle")
  const [uploadedAsset, setUploadedAsset] = useState<UploadedAsset | null>(null)
  const uploadedAssetRef = useRef<UploadedAsset | null>(null)
  const mediaElementsRef = useRef(new Map<string, HTMLImageElement | HTMLVideoElement>())
  const svgRef = useRef<SVGSVGElement>(null)
  const nodeGraphCanvasRef = useRef<HTMLCanvasElement>(null)
  const starburstCanvasRef = useRef<HTMLCanvasElement>(null)
  const flannelCanvasRef = useRef<HTMLCanvasElement>(null)
  const animationStartRef = useRef<number | null>(null)
  const lastAnimationUpdateRef = useRef(0)
  const saveTimeoutRef = useRef<number | null>(null)
  const copyStatusTimeoutRef = useRef<number | null>(null)
  const appBodyRef = useRef<HTMLElement>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    uploadedAssetRef.current = uploadedAsset
  }, [uploadedAsset])

  useEffect(() => () => {
    if (copyStatusTimeoutRef.current) {
      window.clearTimeout(copyStatusTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    const asset = uploadedAsset
    return () => {
      if (!asset?.mediaId) return
      const element = mediaElementsRef.current.get(asset.mediaId)
      if (element instanceof HTMLVideoElement) element.pause()
      element?.remove()
      mediaElementsRef.current.delete(asset.mediaId)
      if (asset?.objectUrl) URL.revokeObjectURL(asset.objectUrl)
    }
  }, [uploadedAsset?.mediaId, uploadedAsset?.objectUrl])

  useEffect(() => {
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = window.setTimeout(() => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          selectedMode,
          globalSettings: { ...globalSettings, animationPhase: 0, currentFrame: 0 },
          modeSettings,
          theme,
          exportFormat,
          backgroundChoice,
          customBackground,
        }),
      )
    }, 500)
    return () => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current)
    }
  }, [selectedMode, globalSettings, modeSettings, theme, exportFormat, backgroundChoice, customBackground])

  useEffect(() => {
    if (!globalSettings.animationEnabled) {
      animationStartRef.current = null
      lastAnimationUpdateRef.current = 0
      return
    }

    let raf = 0
    const tick = (now: number) => {
      if (animationStartRef.current === null) animationStartRef.current = now - globalSettings.animationPhase * globalSettings.animationDuration * 1000
      const updateInterval = 1000 / Math.max(1, Math.min(24, globalSettings.fps))
      if (now - lastAnimationUpdateRef.current >= updateInterval) {
        lastAnimationUpdateRef.current = now
        const elapsed = (now - animationStartRef.current) / 1000
        const phase = (elapsed % globalSettings.animationDuration) / globalSettings.animationDuration
        const currentFrame = Math.floor(phase * globalSettings.frameCount)
        setGlobalSettings((current) => (
          current.currentFrame === currentFrame && Math.abs(current.animationPhase - phase) < 0.001
            ? current
            : { ...current, animationPhase: phase, currentFrame }
        ))
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [globalSettings.animationEnabled, globalSettings.animationDuration, globalSettings.fps, globalSettings.frameCount])

  useEffect(() => {
    const asset = uploadedAssetRef.current
    if (exportingGif) return
    if (!asset?.animated || !asset.mediaId || !asset.visible) return

    let raf = 0
    let lastSampleTime = 0
    const sampleInterval = 1000 / Math.max(4, Math.min(8, globalSettings.fps))
    const tick = (now: number) => {
      const currentAsset = uploadedAssetRef.current
      if (!currentAsset?.animated || !currentAsset.mediaId || currentAsset.mediaId !== asset.mediaId || !currentAsset.visible) return
      const element = mediaElementsRef.current.get(currentAsset.mediaId)
      if (!element) return
      if (now - lastSampleTime >= sampleInterval) {
        lastSampleTime = now
        try {
          const frame = sampleMediaElement(
            element,
            currentAsset.width,
            currentAsset.height,
            currentAsset.mediaType === "video" || Boolean(currentAsset.animated),
          )
          setUploadedAsset((current) => {
            if (!current || current.mediaId !== currentAsset.mediaId) return current
            return { ...current, sample: frame.sample, previewHref: frame.previewHref ?? current.previewHref }
          })
        } catch {
          // Some video frames can be temporarily unavailable while decoding. Keep the previous sample.
        }
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [uploadedAsset?.mediaId, uploadedAsset?.animated, uploadedAsset?.visible, globalSettings.fps, exportingGif])

  useEffect(() => {
    if (exportFormat === "gif" && !["node-graph", "starburst"].includes(selectedMode) && !(uploadedAsset?.mediaType === "video" && uploadedAsset.animated)) setExportFormat("png")
    if (exportFormat === "mp4" && !(uploadedAsset?.mediaType === "video" && uploadedAsset.animated)) setExportFormat("png")
  }, [exportFormat, selectedMode, uploadedAsset?.animated, uploadedAsset?.mediaType])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return
      if (event.code === "Space") {
        event.preventDefault()
        setGlobalSettings((current) => ({ ...current, animationEnabled: !current.animationEnabled }))
      }
      if (event.key.toLowerCase() === "r") randomizeSeed()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  })

  useEffect(() => {
    if (!isResizing) return
    const onPointerMove = (event: PointerEvent) => {
      const rect = appBodyRef.current?.getBoundingClientRect()
      if (!rect) return
      const nextWidth = Math.min(560, Math.max(260, event.clientX - rect.left - 10))
      setSidebarWidth(nextWidth)
    }
    const onPointerUp = () => setIsResizing(false)
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
    }
  }, [isResizing])

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast("Ready"), 1800)
  }, [])

  const writeClipboardText = useCallback(async (text: string) => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch {
        // Fall through to the selection-based copy path for stricter browsers.
      }
    }

    const textArea = document.createElement("textarea")
    textArea.value = text
    textArea.setAttribute("readonly", "")
    textArea.style.position = "fixed"
    textArea.style.left = "-9999px"
    textArea.style.top = "0"
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    const copied = document.execCommand("copy")
    textArea.remove()
    return copied
  }, [])

  const markCopyStatus = useCallback((status: "copied" | "failed") => {
    setCopyStatus(status)
    if (copyStatusTimeoutRef.current) {
      window.clearTimeout(copyStatusTimeoutRef.current)
    }
    copyStatusTimeoutRef.current = window.setTimeout(() => setCopyStatus("idle"), 1400)
  }, [])

  const flannelMode = selectedMode === "flannel"
  const standaloneMode = selectedMode === "node-graph" || selectedMode === "starburst"

  const updateGlobal = useCallback(<K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]) => {
    setGlobalSettings((current) => ({ ...current, [key]: value }))
  }, [])

  const updateModeSetting = useCallback((group: "legoMosaic" | "maskedGrid" | "reconstruction" | "nodeGraph" | "starburst" | "flannel", key: string, value: unknown) => {
    setModeSettings((current) => ({
      ...current,
      [group]: {
        ...current[group],
        [key]:
          typeof value === "number" && Number.isInteger(current[group][key as keyof (typeof current)[typeof group]])
            ? Math.round(value)
            : value,
      },
    }))
    if (typeof value === "number" && key === "animationPhase") {
      setGlobalSettings((current) => ({
        ...current,
        animationPhase: value,
        currentFrame: Math.floor(value * current.frameCount),
        animationEnabled: false,
      }))
    }
  }, [])

  const updateModeGroup = useCallback((group: "legoMosaic" | "maskedGrid" | "reconstruction" | "nodeGraph" | "starburst" | "flannel", patch: Record<string, unknown>) => {
    setModeSettings((current) => {
      const groupSettings = current[group]
      const normalizedPatch = Object.fromEntries(Object.entries(patch).map(([key, value]) => [
        key,
        typeof value === "number" && Number.isInteger(groupSettings[key as keyof typeof groupSettings])
          ? Math.round(value)
          : value,
      ]))
      return {
        ...current,
        [group]: {
          ...groupSettings,
          ...normalizedPatch,
        },
      }
    })
  }, [])

	  const updateEffectColorSetting = useCallback(<K extends keyof EffectColorSettings>(
	    mode: PatternModeId,
	    key: K,
	    value: EffectColorSettings[K],
	  ) => {
	    if (key === "backgroundColor" && typeof value === "string") {
	      setBackgroundChoice("custom")
	      setCustomBackground(value)
	      setGlobalSettings((current) => ({
	        ...current,
	        backgroundColor: value,
	        transparentBackground: false,
	      }))
	    }
	    setModeSettings((current) => {
	      const currentColors = current.effectColors[mode] ?? defaultEffectColors[mode]
      const nextColors = {
        ...currentColors,
        [key]: value,
        ...(key === "useOriginalColors" && value === true ? { customColors: false } : {}),
        ...(key === "useOriginalColors" && value === false ? { customColors: true } : {}),
        ...(key === "customColors" && value === true ? { useOriginalColors: false } : {}),
        ...(key === "customColors" && value === false ? { useOriginalColors: true } : {}),
      }
      return {
        ...current,
        effectColors: {
          ...current.effectColors,
          [mode]: nextColors,
        },
      }
    })
  }, [])

  const updateEffectToneSetting = useCallback(<K extends keyof EffectToneSettings>(
    mode: PatternModeId,
    key: K,
    value: EffectToneSettings[K],
  ) => {
    setModeSettings((current) => ({
      ...current,
      effectTone: {
        ...current.effectTone,
        [mode]: {
          ...(current.effectTone[mode] ?? defaultEffectTones[mode]),
          [key]: value,
        },
      },
    }))
  }, [])

  const applyThemeToCanvas = useCallback((nextTheme: Theme, adaptStarterSource: boolean) => {
    const palette = starterPalettes[nextTheme]
    setBackgroundChoice(palette.backgroundChoice)
    setCustomBackground(palette.background)
    setGlobalSettings((current) => ({
      ...current,
      foregroundColor: palette.foreground,
      backgroundColor: palette.background,
      transparentBackground: false,
    }))
    if (adaptStarterSource) {
      setModeSettings((current) => ({
        ...current,
        starburst: { ...current.starburst, lineColor: palette.foreground },
        effectColors: makeStarterEffectColors(nextTheme),
      }))
    }
  }, [])

  const toggleTheme = useCallback((event?: MouseEvent<HTMLButtonElement>) => {
    const nextTheme = theme === "dark" ? "light" : "dark"
    const adaptStarterSource = Boolean(uploadedAssetRef.current?.isDefaultSource)
    const commitTheme = () => {
      setTheme(nextTheme)
      applyThemeToCanvas(nextTheme, adaptStarterSource)
    }
    const transitionDocument = document as ViewTransitionDocument
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    if (!transitionDocument.startViewTransition || prefersReducedMotion) {
      commitTheme()
      return
    }

    const rect = event?.currentTarget.getBoundingClientRect()
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth - 32
    const y = rect ? rect.top + rect.height / 2 : 26
    const radius = Math.ceil(Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 96)
    const rootStyle = document.documentElement.style
    rootStyle.setProperty("--theme-wipe-x", `${x}px`)
    rootStyle.setProperty("--theme-wipe-y", `${y}px`)
    rootStyle.setProperty("--theme-wipe-radius", `${radius}px`)
    document.documentElement.classList.add("theme-wipe-active")

    const transition = transitionDocument.startViewTransition(() => {
      flushSync(commitTheme)
    })
    transition.finished.finally(() => {
      document.documentElement.classList.remove("theme-wipe-active")
    })
  }, [applyThemeToCanvas, theme])

  const resizeCanvasToUploadedAsset = useCallback((width: number, height: number) => {
    const nextSize = getCanvasSizeForAsset(width, height)
    setGlobalSettings((current) => ({
      ...current,
      canvasWidth: nextSize.width,
      canvasHeight: nextSize.height,
      gifWidth: nextSize.width,
      gifHeight: nextSize.height,
    }))
  }, [])

  const loadDefaultSource = useCallback(async () => {
    try {
      const dimensions = await getImageDimensions(defaultSourceUrl)
      const mediaId = "default-source"
      const frame = sampleMediaElement(dimensions.element, dimensions.width, dimensions.height)
      mediaElementsRef.current.set(mediaId, dimensions.element)
      resizeCanvasToUploadedAsset(dimensions.width, dimensions.height)
      setUploadedAsset({
        name: "default-source.png",
        href: defaultSourceUrl,
        mediaType: "image",
        isDefaultSource: true,
        fitMode: "contain",
        width: dimensions.width,
        height: dimensions.height,
        opacity: 1,
        scale: defaultUploadedAssetScale,
        visible: true,
        mediaId,
        sample: frame.sample,
      })
      applyThemeToCanvas(theme, true)
    } catch {
      // The app still works as an upload tool if the bundled starter image is unavailable.
    }
  }, [applyThemeToCanvas, resizeCanvasToUploadedAsset, theme])

  const randomizeSeed = useCallback(() => {
    setGlobalSettings((current) => ({ ...current, randomSeed: Math.floor(Math.random() * 99999) + 1 }))
    showToast("Seed randomized")
  }, [showToast])

  const resetControlSettings = useCallback(() => {
    const palette = starterPalettes[theme]
    const adaptStarterSource = Boolean(uploadedAssetRef.current?.isDefaultSource)
    const assetSize = uploadedAssetRef.current
      ? getCanvasSizeForAsset(uploadedAssetRef.current.width, uploadedAssetRef.current.height)
      : { width: defaultGlobalSettings.canvasWidth, height: defaultGlobalSettings.canvasHeight }
    setSelectedMode("halftone-dots")
    setGlobalSettings({
      ...defaultGlobalSettings,
      foregroundColor: palette.foreground,
      backgroundColor: palette.background,
      canvasWidth: assetSize.width,
      canvasHeight: assetSize.height,
      gifWidth: assetSize.width,
      gifHeight: assetSize.height,
    })
    setModeSettings(adaptStarterSource
      ? { ...defaultModeSettings, starburst: { ...defaultModeSettings.starburst, lineColor: palette.foreground }, effectColors: makeStarterEffectColors(theme) }
      : defaultModeSettings)
    setBackgroundChoice(palette.backgroundChoice)
    setCustomBackground(palette.background)
    showToast("Controls reset")
  }, [showToast, theme])

  const resetAll = useCallback(async () => {
    resetControlSettings()
    await loadDefaultSource()
    showToast("Reset all")
  }, [loadDefaultSource, resetControlSettings, showToast])

  const resetCurrentMode = useCallback(() => {
    setModeSettings((current) => {
      if (selectedMode === "lego-mosaic") return { ...current, legoMosaic: defaultModeSettings.legoMosaic }
      if (selectedMode === "masked-grid-shimmer") return { ...current, maskedGrid: defaultModeSettings.maskedGrid }
      if (selectedMode === "node-graph") return { ...current, nodeGraph: defaultModeSettings.nodeGraph }
      if (selectedMode === "starburst") return { ...current, starburst: defaultModeSettings.starburst }
      if (selectedMode === "flannel") return { ...current, flannel: defaultModeSettings.flannel }
      return { ...current, reconstruction: defaultModeSettings.reconstruction }
    })
    showToast("Current mode reset")
  }, [selectedMode, showToast])

  const resetColors = useCallback(() => {
    setModeSettings((current) => ({
      ...current,
      effectColors: {
        ...current.effectColors,
        [selectedMode]: { ...defaultEffectColors[selectedMode] },
      },
    }))
    showToast("Effect colors reset")
  }, [selectedMode, showToast])

  const applyBackgroundChoice = useCallback((choice: BackgroundChoice) => {
    setBackgroundChoice(choice)
    if (choice === "transparent") {
      setGlobalSettings((current) => ({ ...current, transparentBackground: true }))
      return
    }
    const nextBackground = choice === "custom" ? (modeSettings.effectColors[selectedMode]?.backgroundColor ?? customBackground) : backgroundChoices[choice]
    setGlobalSettings((current) => ({
      ...current,
      transparentBackground: false,
      backgroundColor: nextBackground,
    }))
  }, [customBackground, modeSettings.effectColors, selectedMode])

  const updateCustomBackground = useCallback((color: string) => {
    setCustomBackground(color)
    setBackgroundChoice("custom")
    setGlobalSettings((current) => ({ ...current, transparentBackground: false, backgroundColor: color }))
  }, [])

  const effectCustomBackground = modeSettings.effectColors[selectedMode]?.backgroundColor ?? customBackground
  const resolvedExportBackground = backgroundChoice === "custom" || backgroundChoice === "transparent"
    ? effectCustomBackground
    : backgroundChoices[backgroundChoice]
  const previewGlobalSettings = useMemo(
    () => ({
      ...globalSettings,
      backgroundColor: resolvedExportBackground,
      transparentBackground: backgroundChoice === "transparent",
    }),
    [backgroundChoice, globalSettings, resolvedExportBackground],
  )
  const previewModeSettings = useMemo(
    () => ({
      ...modeSettings,
      effectColors: {
        ...modeSettings.effectColors,
        [selectedMode]: {
          ...modeSettings.effectColors[selectedMode],
          backgroundColor: resolvedExportBackground,
        },
      },
    }),
    [modeSettings, resolvedExportBackground, selectedMode],
  )

  const getStandalonePreviewGlobal = useCallback(() => {
    const canvas = selectedMode === "node-graph"
      ? nodeGraphCanvasRef.current
      : selectedMode === "starburst"
        ? starburstCanvasRef.current
        : null
    const rect = canvas?.getBoundingClientRect()
    if (!rect || rect.width < 2 || rect.height < 2) return previewGlobalSettings
    const width = Math.round(rect.width)
    const height = Math.round(rect.height)
    return {
      ...previewGlobalSettings,
      canvasWidth: width,
      canvasHeight: height,
      gifWidth: width,
      gifHeight: height,
    }
  }, [previewGlobalSettings, selectedMode])

  useEffect(() => {
    if (!uploadedAsset) return
    const nextSize = getCanvasSizeForAsset(uploadedAsset.width, uploadedAsset.height)
    if (globalSettings.canvasWidth !== nextSize.width || globalSettings.canvasHeight !== nextSize.height) {
      setGlobalSettings((current) => ({
        ...current,
        canvasWidth: nextSize.width,
        canvasHeight: nextSize.height,
        gifWidth: nextSize.width,
        gifHeight: nextSize.height,
      }))
    }
    if (!uploadedAsset.fitMode) {
      setUploadedAsset((current) => (current ? { ...current, fitMode: "contain", scale: defaultUploadedAssetScale } : current))
    }
  }, [globalSettings.canvasHeight, globalSettings.canvasWidth, uploadedAsset])

  const handleUploadAsset = useCallback(async (file: File) => {
    try {
      const mediaId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
        const svgText = await readFileAsText(file)
        const dimensions = parseSvgDimensions(svgText)
        const href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`
        const loaded = await getImageDimensions(href)
        const frame = sampleMediaElement(loaded.element, dimensions.width, dimensions.height)
        mediaElementsRef.current.set(mediaId, loaded.element)
        resizeCanvasToUploadedAsset(dimensions.width, dimensions.height)
        setUploadedAsset({
          name: file.name,
          href,
          mediaType: "image",
          fitMode: "contain",
          width: dimensions.width,
          height: dimensions.height,
          opacity: 1,
          scale: defaultUploadedAssetScale,
          visible: true,
          mediaId,
          sample: frame.sample,
        })
      } else if (isVideoFile(file)) {
        const href = URL.createObjectURL(file)
        const dimensions = await getVideoDimensions(href)
        const frame = sampleMediaElement(dimensions.element, dimensions.width, dimensions.height, true)
        attachAnimatedMediaElement(dimensions.element)
        mediaElementsRef.current.set(mediaId, dimensions.element)
        resizeCanvasToUploadedAsset(dimensions.width, dimensions.height)
        setUploadedAsset({
          name: file.name,
          href,
          previewHref: frame.previewHref,
          mediaType: "video",
          fitMode: "contain",
          width: dimensions.width,
          height: dimensions.height,
          opacity: 1,
          scale: defaultUploadedAssetScale,
          visible: true,
          animated: true,
          mediaId,
          objectUrl: href,
          sample: frame.sample,
        })
      } else if (file.type.startsWith("image/")) {
        if (isGifFile(file)) {
          showToast("GIF upload removed. Use MP4, MOV, or WebM.")
          return
        }
        const href = await readFileAsDataUrl(file)
        const dimensions = await getImageDimensions(href)
        const frame = sampleMediaElement(dimensions.element, dimensions.width, dimensions.height)
        mediaElementsRef.current.set(mediaId, dimensions.element)
        resizeCanvasToUploadedAsset(dimensions.width, dimensions.height)
        setUploadedAsset({
          name: file.name,
          href,
          previewHref: frame.previewHref,
          mediaType: "image",
          fitMode: "contain",
          width: dimensions.width,
          height: dimensions.height,
          opacity: 1,
          scale: defaultUploadedAssetScale,
          visible: true,
          mediaId,
          sample: frame.sample,
        })
      } else {
        showToast("Upload SVG, image, or video")
        return
      }
      showToast("Upload ready")
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Upload failed")
    }
  }, [resizeCanvasToUploadedAsset, showToast])

  useEffect(() => {
    let cancelled = false
    const loadInitialDefaultSource = async () => {
      if (uploadedAssetRef.current) return
      await loadDefaultSource()
      if (!cancelled) setSelectedMode("halftone-dots")
    }
    loadInitialDefaultSource()
    return () => {
      cancelled = true
    }
  }, [loadDefaultSource])

  const renderSvgMarkupForFrame = useCallback(
    (frameIndex: number, phase: number, transparentOverride?: boolean) => {
      const baseGlobal = ["node-graph", "starburst"].includes(selectedMode) ? getStandalonePreviewGlobal() : previewGlobalSettings
      const frameGlobal: GlobalSettings = {
        ...baseGlobal,
        animationPhase: phase,
        currentFrame: frameIndex,
        transparentBackground: transparentOverride ?? baseGlobal.transparentBackground,
      }
      const markup = renderPatternSvgMarkup(selectedMode, frameGlobal, previewModeSettings, uploadedAsset, phase, frameIndex, `export-${frameIndex}`)
      return ["node-graph", "starburst"].includes(selectedMode)
        ? applySvgViewScale(markup, frameGlobal.canvasWidth, frameGlobal.canvasHeight, standaloneViewScale)
        : markup
    },
    [getStandalonePreviewGlobal, previewGlobalSettings, previewModeSettings, selectedMode, standaloneViewScale, uploadedAsset],
  )

  const renderSvgMarkupForGifFrame = useCallback(
    async (frameIndex: number, phase: number, transparentOverride?: boolean, sourceDurationOverride?: number) => {
      let frameAsset = uploadedAsset
      if (uploadedAsset?.animated && uploadedAsset.mediaId) {
        const element = mediaElementsRef.current.get(uploadedAsset.mediaId)
        if (element instanceof HTMLVideoElement) {
          const duration = sourceDurationOverride ?? (Number.isFinite(element.duration) && element.duration > 0 ? element.duration : globalSettings.animationDuration)
          const targetTime = Math.min(Math.max(phase * duration, 0), Math.max(0, duration - 0.02))
          if (Math.abs(element.currentTime - targetTime) > 0.002) {
            element.currentTime = targetTime
            await waitForMediaEvent(element, "seeked", 1800)
          }
          if ("requestVideoFrameCallback" in element) {
            await new Promise<void>((resolve) => {
              const timeout = window.setTimeout(resolve, 120)
              element.requestVideoFrameCallback(() => {
                window.clearTimeout(timeout)
                resolve()
              })
            })
          }
          const frame = sampleMediaElement(element, uploadedAsset.width, uploadedAsset.height, true)
          frameAsset = { ...uploadedAsset, sample: frame.sample, previewHref: frame.previewHref ?? uploadedAsset.previewHref }
        } else if (element instanceof HTMLImageElement) {
          await new Promise((resolve) => window.setTimeout(resolve, Math.max(40, 1000 / Math.max(1, globalSettings.gifFps))))
          const frame = sampleMediaElement(element, uploadedAsset.width, uploadedAsset.height, true)
          frameAsset = { ...uploadedAsset, sample: frame.sample, previewHref: frame.previewHref ?? uploadedAsset.previewHref }
        }
      }
      const frameGlobal: GlobalSettings = {
        ...previewGlobalSettings,
        animationPhase: phase,
        currentFrame: frameIndex,
        transparentBackground: transparentOverride ?? previewGlobalSettings.transparentBackground,
      }
      return renderPatternSvgMarkup(selectedMode, frameGlobal, previewModeSettings, frameAsset, phase, frameIndex, `export-${frameIndex}`)
    },
    [globalSettings.animationDuration, globalSettings.gifFps, previewGlobalSettings, previewModeSettings, selectedMode, uploadedAsset],
  )

  const renderSvgMarkupForCurrentVideoFrame = useCallback(
    async (frameIndex: number, phase: number) => {
      let frameAsset = uploadedAsset
      if (uploadedAsset?.animated && uploadedAsset.mediaId) {
        const element = mediaElementsRef.current.get(uploadedAsset.mediaId)
        if (element instanceof HTMLVideoElement) {
          const frame = sampleMediaElement(element, uploadedAsset.width, uploadedAsset.height, true)
          frameAsset = { ...uploadedAsset, sample: frame.sample, previewHref: frame.previewHref ?? uploadedAsset.previewHref }
        }
      }
      const frameGlobal: GlobalSettings = {
        ...previewGlobalSettings,
        animationPhase: phase,
        currentFrame: frameIndex,
        transparentBackground: false,
      }
      return renderPatternSvgMarkup(selectedMode, frameGlobal, previewModeSettings, frameAsset, phase, frameIndex, `export-${frameIndex}`)
    },
    [previewGlobalSettings, previewModeSettings, selectedMode, uploadedAsset],
  )

  const drawCurrentVideoFrameToCanvas = useCallback(
    async (context: CanvasRenderingContext2D, frameIndex: number, phase: number, width: number, height: number) => {
      let frameAsset = uploadedAsset
      if (uploadedAsset?.animated && uploadedAsset.mediaId) {
        const element = mediaElementsRef.current.get(uploadedAsset.mediaId)
        if (element instanceof HTMLVideoElement) {
          const frame = sampleMediaElement(element, uploadedAsset.width, uploadedAsset.height, true)
          frameAsset = { ...uploadedAsset, sample: frame.sample, previewHref: frame.previewHref ?? uploadedAsset.previewHref }
        }
      }
      const frameGlobal: GlobalSettings = {
        ...previewGlobalSettings,
        canvasWidth: width,
        canvasHeight: height,
        animationPhase: phase,
        currentFrame: frameIndex,
        transparentBackground: false,
      }
      drawPatternFrameToCanvas(context, selectedMode, frameGlobal, previewModeSettings, frameAsset, phase)
    },
    [previewGlobalSettings, previewModeSettings, selectedMode, uploadedAsset],
  )

  const getFlannelExportGlobal = useCallback((resolution: number = modeSettings.flannel.canvasResolution): GlobalSettings => ({
    ...previewGlobalSettings,
    canvasWidth: resolution,
    canvasHeight: resolution,
    gifWidth: resolution,
    gifHeight: resolution,
    transparentBackground: false,
    backgroundColor: modeSettings.flannel.backgroundColor,
  }), [modeSettings.flannel.backgroundColor, modeSettings.flannel.canvasResolution, previewGlobalSettings])

  const copyFlannelEmbed = useCallback(async () => {
    const exportGlobal = getFlannelExportGlobal()
    const copied = await writeClipboardText(renderFlannelEmbedMarkup(exportGlobal, modeSettings.flannel, previewModeSettings.effectColors.flannel))
    showToast(copied ? "Embed copied" : "Copy failed")
  }, [getFlannelExportGlobal, modeSettings.flannel, previewModeSettings.effectColors.flannel, showToast, writeClipboardText])

  const exportFlannel = useCallback(async (format: "svg" | "png") => {
    if (format === "svg") {
      const exportGlobal = getFlannelExportGlobal()
      downloadFile(renderFlannelSvgMarkup(exportGlobal, modeSettings.flannel, previewModeSettings.effectColors.flannel), `flannel-${exportGlobal.canvasWidth}px.svg`, "image/svg+xml;charset=utf-8")
      showToast("SVG exported")
      return
    }

    const size = Math.round(800 * modeSettings.flannel.pngScale)
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Canvas is unavailable.")
    drawFlannelFrame(
      context,
      modeSettings.flannel,
      { ...getFlannelExportGlobal(size), canvasWidth: size, canvasHeight: size },
      previewModeSettings.effectColors.flannel,
      size,
      size,
      false,
    )
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("Could not export PNG."))), "image/png")
    })
    downloadFile(await blob.arrayBuffer(), `flannel-${size}px.png`, "image/png")
    showToast("PNG exported")
  }, [getFlannelExportGlobal, modeSettings.flannel, previewModeSettings.effectColors.flannel, showToast])

  const copySvg = useCallback(async () => {
    setCopyStatus("copying")
    try {
      const markup = selectedMode === "flannel"
        ? renderFlannelSvgMarkup(getFlannelExportGlobal(), modeSettings.flannel, previewModeSettings.effectColors.flannel)
        : ["node-graph", "starburst"].includes(selectedMode)
          ? renderSvgMarkupForFrame(globalSettings.currentFrame, globalSettings.animationPhase)
          : svgRef.current
            ? serializeSvg(svgRef.current)
            : ""
      if (!markup) throw new Error("No SVG markup available.")
      const copied = await writeClipboardText(markup)
      if (!copied) throw new Error("Clipboard write failed.")
      markCopyStatus("copied")
      showToast("SVG copied")
    } catch (error) {
      console.error(error)
      markCopyStatus("failed")
      showToast("Copy failed")
    }
  }, [getFlannelExportGlobal, globalSettings.animationPhase, globalSettings.currentFrame, markCopyStatus, modeSettings.flannel, previewModeSettings.effectColors.flannel, renderSvgMarkupForFrame, selectedMode, showToast, writeClipboardText])

  const handleExport = useCallback(async () => {
    try {
      if (exportFormat === "svg") {
        if (["node-graph", "starburst", "flannel"].includes(selectedMode)) {
          downloadFile(renderSvgMarkupForFrame(globalSettings.currentFrame, globalSettings.animationPhase), "pattern.svg", "image/svg+xml;charset=utf-8")
        } else if (svgRef.current) {
          exportSvg(svgRef.current, "pattern.svg")
        }
        showToast("SVG exported")
      } else if (exportFormat === "png") {
        if (selectedMode === "node-graph" && nodeGraphCanvasRef.current) {
          const exportGlobal = getStandalonePreviewGlobal()
          await exportCanvasPng(nodeGraphCanvasRef.current, "pattern.png", previewGlobalSettings.exportScale, exportGlobal.canvasWidth, exportGlobal.canvasHeight)
        } else if (selectedMode === "starburst" && starburstCanvasRef.current) {
          const exportGlobal = getStandalonePreviewGlobal()
          await exportCanvasPng(starburstCanvasRef.current, "pattern.png", previewGlobalSettings.exportScale, exportGlobal.canvasWidth, exportGlobal.canvasHeight)
        } else if (selectedMode === "flannel" && flannelCanvasRef.current) {
          const exportGlobal = getStandalonePreviewGlobal()
          await exportCanvasPng(flannelCanvasRef.current, "pattern.png", previewGlobalSettings.exportScale, exportGlobal.canvasWidth, exportGlobal.canvasHeight)
        } else if (svgRef.current) {
          await exportPng(svgRef.current, "pattern.png", previewGlobalSettings.exportScale, previewGlobalSettings.backgroundColor, previewGlobalSettings.transparentBackground)
        }
        showToast("PNG exported")
      } else if (exportFormat === "gif") {
        if (!["node-graph", "starburst"].includes(selectedMode) && !(uploadedAsset?.mediaType === "video" && uploadedAsset.animated)) {
          setExportFormat("png")
          showToast("GIF export needs Starburst, Node Graph, or video")
          return
        }
        const animatedElement = uploadedAsset?.mediaId ? mediaElementsRef.current.get(uploadedAsset.mediaId) : null
        const shouldResumeVideo = animatedElement instanceof HTMLVideoElement && !animatedElement.paused
        const previousTime = animatedElement instanceof HTMLVideoElement ? animatedElement.currentTime : 0
        const previousLoop = animatedElement instanceof HTMLVideoElement ? animatedElement.loop : false
        if (animatedElement instanceof HTMLVideoElement) {
          animatedElement.pause()
          animatedElement.loop = false
          animatedElement.currentTime = 0
          await waitForMediaEvent(animatedElement, "seeked", 1800)
          if ("requestVideoFrameCallback" in animatedElement) {
            await new Promise<void>((resolve) => {
              const timeout = window.setTimeout(resolve, 150)
              animatedElement.requestVideoFrameCallback(() => {
                window.clearTimeout(timeout)
                resolve()
              })
            })
          }
        }
        setExportingGif(true)
        setGifProgress(0)
        await new Promise((resolve) => requestAnimationFrame(resolve))
        try {
          if (selectedMode === "node-graph") {
            const exportGlobal = getStandalonePreviewGlobal()
            await exportNodeGraphGif({
              global: exportGlobal,
              settings: modeSettings.nodeGraph,
              colors: previewModeSettings.effectColors["node-graph"],
              filename: "pattern.gif",
              viewScale: standaloneViewScale,
              onProgress: setGifProgress,
            })
          } else if (selectedMode === "starburst") {
            const exportGlobal = getStandalonePreviewGlobal()
            await exportStarburstGif({
              global: exportGlobal,
              settings: modeSettings.starburst,
              colors: previewModeSettings.effectColors["starburst"],
              filename: "pattern.gif",
              viewScale: standaloneViewScale,
              onProgress: setGifProgress,
            })
          } else {
            const videoElement = uploadedAsset?.mediaId ? mediaElementsRef.current.get(uploadedAsset.mediaId) : null
            const sourceDuration = videoElement instanceof HTMLVideoElement && Number.isFinite(videoElement.duration) && videoElement.duration > 0
              ? videoElement.duration
              : previewGlobalSettings.animationDuration
            const fps = Math.max(1, previewGlobalSettings.gifFps)
            const durationFrameCount = Math.ceil(sourceDuration * fps)
            const frameCount = uploadedAsset?.mediaType === "video"
              ? Math.min(maxUploadedVideoGifFrames, Math.max(1, durationFrameCount))
              : previewGlobalSettings.gifFrameCount
            await exportGif({
              generateSvgForFrame: (frameIndex, phase) => renderSvgMarkupForGifFrame(frameIndex, phase, previewGlobalSettings.transparentBackground, sourceDuration),
              width: previewGlobalSettings.gifWidth,
              height: previewGlobalSettings.gifHeight,
              frameCount,
              fps,
              scale: 1,
              quality: previewGlobalSettings.gifQuality,
              loop: previewGlobalSettings.gifLoop,
              filename: "pattern.gif",
              transparentBackground: previewGlobalSettings.transparentBackground,
              onProgress: setGifProgress,
            })
          }
        } finally {
          if (animatedElement instanceof HTMLVideoElement) {
            animatedElement.pause()
            animatedElement.loop = previousLoop
            animatedElement.currentTime = previousTime
            if (shouldResumeVideo) animatedElement.play().catch(() => {})
          }
        }
        showToast("GIF exported")
      } else {
        if (!(uploadedAsset?.mediaType === "video" && uploadedAsset.animated)) {
          setExportFormat("png")
          showToast("MP4 export needs an uploaded video")
          return
        }
        const animatedElement = uploadedAsset.mediaId ? mediaElementsRef.current.get(uploadedAsset.mediaId) : null
        const shouldResumeVideo = animatedElement instanceof HTMLVideoElement && !animatedElement.paused
        const previousTime = animatedElement instanceof HTMLVideoElement ? animatedElement.currentTime : 0
        const previousLoop = animatedElement instanceof HTMLVideoElement ? animatedElement.loop : false
        if (animatedElement instanceof HTMLVideoElement) {
          animatedElement.pause()
          animatedElement.loop = false
          animatedElement.currentTime = 0
          await waitForMediaEvent(animatedElement, "seeked", 1800)
          if ("requestVideoFrameCallback" in animatedElement) {
            await new Promise<void>((resolve) => {
              const timeout = window.setTimeout(resolve, 150)
              animatedElement.requestVideoFrameCallback(() => {
                window.clearTimeout(timeout)
                resolve()
              })
            })
          }
          animatedElement.playbackRate = 1
          await animatedElement.play()
        }
        setExportingGif(true)
        setGifProgress(0)
        await new Promise((resolve) => requestAnimationFrame(resolve))
        try {
          const sourceDuration = animatedElement instanceof HTMLVideoElement && Number.isFinite(animatedElement.duration) && animatedElement.duration > 0
            ? animatedElement.duration
            : previewGlobalSettings.animationDuration
          const size = getVideoExportSize(previewGlobalSettings.canvasWidth, previewGlobalSettings.canvasHeight, previewGlobalSettings.mp4Resolution)
          await exportMp4({
            drawFrame: drawCurrentVideoFrameToCanvas,
            realtime: true,
            width: size.width,
            height: size.height,
            duration: sourceDuration,
            fps: previewGlobalSettings.mp4Fps,
            filename: "pattern.mp4",
            onProgress: setGifProgress,
          })
        } finally {
          if (animatedElement instanceof HTMLVideoElement) {
            animatedElement.pause()
            animatedElement.loop = previousLoop
            animatedElement.currentTime = previousTime
            if (shouldResumeVideo) animatedElement.play().catch(() => {})
          }
        }
        showToast("MP4 exported")
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Export failed")
    } finally {
      setExportingGif(false)
    }
  }, [drawCurrentVideoFrameToCanvas, exportFormat, getStandalonePreviewGlobal, globalSettings, modeSettings.nodeGraph, modeSettings.starburst, previewGlobalSettings, previewModeSettings.effectColors, renderSvgMarkupForFrame, renderSvgMarkupForGifFrame, selectedMode, showToast, standaloneViewScale, uploadedAsset])

  return (
    <div className="app-shell">
      <header className="header">
        <span className="header-logo">Meshic</span>
        <div className="header-gap" />
        <button className="header-btn" type="button" onClick={resetAll}>
          <RotateCcw size={14} /> Reset
        </button>
        <button className="theme-switch" type="button" aria-label="Toggle theme" onClick={(event) => toggleTheme(event)}>
          {theme === "dark" ? <Moon size={15} /> : <Sun size={15} />}
        </button>
      </header>

      <main
        ref={appBodyRef}
        className={`app-body ${isResizing ? "is-resizing" : ""} ${flannelMode ? "flannel-layout" : ""}`}
        style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      >
        <ControlPanel
          selectedMode={selectedMode}
          globalSettings={globalSettings}
          modeSettings={modeSettings}
          exportFormat={exportFormat}
          backgroundChoice={backgroundChoice}
          customBackground={customBackground}
          onModeChange={setSelectedMode}
          onGlobalChange={updateGlobal}
          onModeSettingChange={updateModeSetting}
          onModeGroupChange={updateModeGroup}
          onEffectColorChange={updateEffectColorSetting}
          onEffectToneChange={updateEffectToneSetting}
          onExportFormatChange={setExportFormat}
          onBackgroundChoiceChange={applyBackgroundChoice}
          onCustomBackgroundChange={updateCustomBackground}
          onExport={handleExport}
          onFlannelExport={exportFlannel}
          onFlannelCopyEmbed={copyFlannelEmbed}
          onResetAll={resetAll}
          onResetCurrentMode={resetCurrentMode}
          onResetColors={resetColors}
          uploadedAsset={uploadedAsset}
          onUploadAsset={handleUploadAsset}
          onUploadedAssetChange={setUploadedAsset}
          onClearUploadedAsset={() => {
            setUploadedAsset(null)
            showToast("Upload cleared")
          }}
          exportingGif={exportingGif}
          gifProgress={gifProgress}
        />

        {!flannelMode && (
          <div
            className={`resize-handle ${isResizing ? "active" : ""}`}
            onPointerDown={(event) => {
              event.preventDefault()
              setIsResizing(true)
            }}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panels"
          >
            <div className="resize-handle-bar" />
          </div>
        )}

        <section className="preview-panel">
          <div className="preview-header">
            <div className="preview-actions preview-actions-left">
              <button
                className={`preview-icon-btn copy-preview-btn ${copyStatus === "copied" ? "is-copied" : ""}`}
                type="button"
                onClick={copySvg}
                title="Copy SVG"
                disabled={copyStatus === "copying"}
              >
                <span className="copy-icon-wrap" aria-hidden="true">
                  {copyStatus === "copied" ? <Check size={15} /> : <Copy size={15} />}
                </span>
              </button>
            </div>
            <div className="preview-actions">
              {standaloneMode && (
                <button
                  className="preview-icon-btn"
                  type="button"
                  onClick={() => setGlobalSettings((current) => ({ ...current, animationEnabled: !current.animationEnabled }))}
                  title={globalSettings.animationEnabled ? "Pause animation" : "Play animation"}
                >
                  {globalSettings.animationEnabled ? <Pause size={15} /> : <Play size={15} />}
                </button>
              )}
              <button className="preview-icon-btn" type="button" onClick={resetControlSettings} title="Reset controls">
                <RefreshCw size={15} />
              </button>
              {standaloneMode && (
                <button className="preview-icon-btn" type="button" onClick={() => setStandaloneViewScale(1)} title="Fit view">
                  <Maximize2 size={15} />
                </button>
              )}
            </div>
          </div>
          <div
            className={`canvas-view ${standaloneMode ? "standalone-view" : ""} ${flannelMode ? "flannel-view" : ""} ${previewGlobalSettings.transparentBackground ? "bg-transparent" : ""}`}
            onWheel={(event) => {
              if (!standaloneMode) return
              event.preventDefault()
              const direction = event.deltaY > 0 ? -0.08 : 0.08
              setStandaloneViewScale((current) => clampStandaloneViewScale(Number((current + direction).toFixed(2))))
            }}
          >
            <div
              className={`preview-stage ${standaloneMode ? "node-graph-stage" : ""} ${flannelMode ? "flannel-stage" : ""}`}
              style={{
                "--preview-aspect": `${previewGlobalSettings.canvasWidth} / ${previewGlobalSettings.canvasHeight}`,
              } as CSSProperties}
            >
              {selectedMode === "node-graph" ? (
                <NodeGraphCanvas
                  ref={nodeGraphCanvasRef}
                  globalSettings={previewGlobalSettings}
                  settings={previewModeSettings.nodeGraph}
                  colors={previewModeSettings.effectColors["node-graph"]}
                  transparentBackground={previewGlobalSettings.transparentBackground}
                  viewScale={standaloneViewScale}
                />
              ) : selectedMode === "starburst" ? (
                <StarburstCanvas
                  ref={starburstCanvasRef}
                  globalSettings={previewGlobalSettings}
                  settings={previewModeSettings.starburst}
                  colors={previewModeSettings.effectColors["starburst"]}
                  transparentBackground={previewGlobalSettings.transparentBackground}
                  viewScale={standaloneViewScale}
                />
              ) : selectedMode === "flannel" ? (
                <FlannelCanvas
                  ref={flannelCanvasRef}
                  globalSettings={previewGlobalSettings}
                  settings={previewModeSettings.flannel}
                  colors={previewModeSettings.effectColors["flannel"]}
                  transparentBackground={false}
                />
              ) : (
                <PatternPreview
                  ref={svgRef}
                  selectedMode={selectedMode}
                  globalSettings={previewGlobalSettings}
                  modeSettings={previewModeSettings}
                  uploadedAsset={uploadedAsset}
                />
              )}
            </div>
            {standaloneMode && (
              <>
                <div className="standalone-zoom-value" aria-label="Current zoom">
                  {Math.round(standaloneViewScale * 100)}%
                </div>
                <div className="standalone-zoom-controls" aria-label="Canvas zoom controls">
                  <button type="button" onClick={() => setStandaloneViewScale((current) => clampStandaloneViewScale(Number((current + 0.25).toFixed(2))))} title="Zoom in">
                    <Plus size={17} />
                  </button>
                  <button type="button" onClick={() => setStandaloneViewScale((current) => clampStandaloneViewScale(Number((current - 0.25).toFixed(2))))} title="Zoom out">
                    <Minus size={17} />
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      </main>

      <footer className="footer">
        <span>{toast}</span>
        <span className="footer-credit">
          crafted by{" "}
          <a href="https://twitter.com/madebyvishesh" target="_blank" rel="noreferrer">
            vishesh
          </a>{" "}
          with love
        </span>
      </footer>
    </div>
  )
}
