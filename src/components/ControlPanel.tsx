import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ChevronsUpDown, RotateCcw } from "lucide-react"
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react"
import { useEffect, useRef, useState } from "react"
import { EffectColorSettings, EffectToneSettings, FlannelSettings, FlannelStripe, GlobalSettings, ModeSettings, PatternModeId, UploadedAsset } from "../types"
import { cloneFlannelSettings, createFlannelStripe, defaultFlannelSettings, drawFlannelFrame, flannelPresets } from "../utils/flannel"

type ExportFormat = "svg" | "png" | "gif" | "mp4"
type BackgroundChoice = "transparent" | "dark" | "mid" | "light" | "white" | "custom"

type ControlPanelProps = {
  selectedMode: PatternModeId
  globalSettings: GlobalSettings
  modeSettings: ModeSettings
  exportFormat: ExportFormat
  backgroundChoice: BackgroundChoice
  customBackground: string
  onModeChange: (mode: PatternModeId) => void
  onGlobalChange: <K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]) => void
  onModeSettingChange: (group: "legoMosaic" | "maskedGrid" | "reconstruction" | "nodeGraph" | "starburst" | "flannel", key: string, value: unknown) => void
  onModeGroupChange: (group: "legoMosaic" | "maskedGrid" | "reconstruction" | "nodeGraph" | "starburst" | "flannel", patch: Record<string, unknown>) => void
  onEffectColorChange: <K extends keyof EffectColorSettings>(mode: PatternModeId, key: K, value: EffectColorSettings[K]) => void
  onEffectToneChange: <K extends keyof EffectToneSettings>(mode: PatternModeId, key: K, value: EffectToneSettings[K]) => void
  onExportFormatChange: (format: ExportFormat) => void
  onBackgroundChoiceChange: (choice: BackgroundChoice) => void
  onCustomBackgroundChange: (color: string) => void
  onExport: () => void
  onFlannelExport: (format: "svg" | "png") => void
  onFlannelCopyEmbed: () => void
  onResetAll: () => void
  onResetCurrentMode: () => void
  onResetColors: () => void
  uploadedAsset: UploadedAsset | null
  onUploadAsset: (file: File) => void
  onUploadedAssetChange: (asset: UploadedAsset | null) => void
  onClearUploadedAsset: () => void
  exportingGif: boolean
  gifProgress: number
}

const uploadEffectModes: Array<{ id: PatternModeId; name: string; description: string; icon: string }> = [
  { id: "lego-mosaic", name: "LEGO Mosaic", description: "raised sampled plastic studs", icon: "▣" },
  { id: "masked-grid-shimmer", name: "Masked Grid Shimmer", description: "animated square-cell mask", icon: "▦" },
  { id: "halftone-dots", name: "Halftone Dots", description: "source rebuilt from dot scale", icon: "●" },
  { id: "ascii-grid", name: "ASCII Grid", description: "monospace character reconstruction", icon: "@" },
  { id: "scanline-reconstruction", name: "Scanlines", description: "horizontal screen-line rebuild", icon: "═" },
  { id: "ordered-dither", name: "Ordered Dither", description: "Bayer matrix mark pattern", icon: "▥" },
]

const generatorModes: Array<{ id: PatternModeId; name: string; description: string; icon: string }> = [
  { id: "node-graph", name: "Node Graph", description: "procedural connected nodes", icon: "✣" },
  { id: "starburst", name: "Starburst", description: "radiating animated ray system", icon: "✦" },
  { id: "flannel", name: "Flannel", description: "woven tartan pattern system", icon: "▧" },
]

const bgColors: Record<Exclude<BackgroundChoice, "transparent" | "custom">, string> = {
  dark: "#080808",
  mid: "#555555",
  light: "#e8e4de",
  white: "#ffffff",
}

const exportBackgroundOptions: Array<{ label: string; value: BackgroundChoice }> = [
  { label: "transparent", value: "transparent" },
  { label: "black", value: "dark" },
  { label: "white", value: "white" },
  { label: "custom", value: "custom" },
]

const asciiCharacterPresets = [
  " .:-=+*#%@",
  " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  " ▁▂▃▄▅▆▇█",
  " ·•●○◌◎",
  " .░▒▓█",
  " 0123456789",
  " AEIOUMNW@#",
]

const nodeGraphPresets = {
  "neural-web": { nodeCount: 120, nodeSize: 2.5, glowIntensity: 8, maxDistance: 95, lineThickness: 0.35, lineOpacity: 0.45, showConnections: true, motionSpeed: 0.35, motionType: "drift", turbulence: 0.05, distribution: "gaussian", clusterRadius: 230 },
  galaxy: { nodeCount: 160, nodeSize: 1.5, glowIntensity: 14, maxDistance: 52, lineThickness: 0.25, lineOpacity: 0.25, showConnections: true, motionSpeed: 1, motionType: "orbit", turbulence: 0.12, distribution: "fibonacci", clusterRadius: 300 },
  constellation: { nodeCount: 55, nodeSize: 3.5, glowIntensity: 12, maxDistance: 115, lineThickness: 0.3, lineOpacity: 0.28, showConnections: true, motionSpeed: 0, motionType: "freeze", turbulence: 0, distribution: "ring", clusterRadius: 280 },
  "crystal-grid": { nodeCount: 90, nodeSize: 2.5, glowIntensity: 12, maxDistance: 72, lineThickness: 0.6, lineOpacity: 0.7, showConnections: true, motionSpeed: 0.2, motionType: "pulse", turbulence: 0.02, distribution: "hex", clusterRadius: 240 },
  "plasma-storm": { nodeCount: 200, nodeSize: 2, glowIntensity: 16, maxDistance: 68, lineThickness: 0.3, lineOpacity: 0.5, showConnections: true, motionSpeed: 1.2, motionType: "pulse", turbulence: 0.4, distribution: "gaussian", clusterRadius: 260 },
  "circuit-board": { nodeCount: 80, nodeSize: 3, glowIntensity: 8, maxDistance: 78, lineThickness: 0.7, lineOpacity: 0.8, showConnections: true, motionSpeed: 0, motionType: "freeze", turbulence: 0, distribution: "grid", clusterRadius: 270 },
  "solar-system": { nodeCount: 65, nodeSize: 3.5, glowIntensity: 15, maxDistance: 60, lineThickness: 0.35, lineOpacity: 0.3, showConnections: true, motionSpeed: 0.7, motionType: "orbit", turbulence: 0.05, distribution: "radial", clusterRadius: 280 },
  nebula: { nodeCount: 180, nodeSize: 1.5, glowIntensity: 18, maxDistance: 80, lineThickness: 0.2, lineOpacity: 0.35, showConnections: true, motionSpeed: 0.6, motionType: "pulse", turbulence: 0.35, distribution: "fractal", clusterRadius: 250 },
  fireworks: { nodeCount: 100, nodeSize: 2.5, glowIntensity: 14, maxDistance: 55, lineThickness: 0.3, lineOpacity: 0.4, showConnections: true, motionSpeed: 0.5, motionType: "pulse", turbulence: 0.25, distribution: "explosion", clusterRadius: 280 },
  snowflake: { nodeCount: 72, nodeSize: 2, glowIntensity: 10, maxDistance: 68, lineThickness: 0.5, lineOpacity: 0.6, showConnections: true, motionSpeed: 0, motionType: "freeze", turbulence: 0, distribution: "star", clusterRadius: 270 },
  sunflower: { nodeCount: 150, nodeSize: 2, glowIntensity: 10, maxDistance: 45, lineThickness: 0.3, lineOpacity: 0.4, showConnections: true, motionSpeed: 0.15, motionType: "pulse", turbulence: 0.03, distribution: "fibonacci", clusterRadius: 290 },
  "dna-wave": { nodeCount: 90, nodeSize: 2.5, glowIntensity: 8, maxDistance: 58, lineThickness: 0.4, lineOpacity: 0.55, showConnections: true, motionSpeed: 0.4, motionType: "drift", turbulence: 0.06, distribution: "wave", clusterRadius: 280 },
  "hex-matrix": { nodeCount: 110, nodeSize: 2, glowIntensity: 9, maxDistance: 65, lineThickness: 0.5, lineOpacity: 0.65, showConnections: true, motionSpeed: 0.25, motionType: "pulse", turbulence: 0.05, distribution: "hex", clusterRadius: 250 },
  "twin-stars": { nodeCount: 140, nodeSize: 2, glowIntensity: 10, maxDistance: 70, lineThickness: 0.35, lineOpacity: 0.4, showConnections: true, motionSpeed: 0.5, motionType: "orbit", turbulence: 0.1, distribution: "double", clusterRadius: 240 },
  "red-lattice": { nodeCount: 80, nodeSize: 2.5, glowIntensity: 7, maxDistance: 70, lineThickness: 0.6, lineOpacity: 0.7, showConnections: true, motionSpeed: 0, motionType: "freeze", turbulence: 0, distribution: "tri", clusterRadius: 260 },
  vortex: { nodeCount: 130, nodeSize: 2, glowIntensity: 11, maxDistance: 60, lineThickness: 0.35, lineOpacity: 0.45, showConnections: true, motionSpeed: 0.8, motionType: "orbit", turbulence: 0.2, distribution: "spiral", clusterRadius: 290 },
} as const

const nodeGraphPresetColors: Record<keyof typeof nodeGraphPresets, { foreground: string; background: string }> = {
  "neural-web": { foreground: "#c8d8ff", background: "#000510" },
  galaxy: { foreground: "#a0d0ff", background: "#00000a" },
  constellation: { foreground: "#ffffff", background: "#020208" },
  "crystal-grid": { foreground: "#70ffee", background: "#000c09" },
  "plasma-storm": { foreground: "#ff80ff", background: "#080008" },
  "circuit-board": { foreground: "#40ff80", background: "#000a02" },
  "solar-system": { foreground: "#ffdd60", background: "#030100" },
  nebula: { foreground: "#c080ff", background: "#030008" },
  fireworks: { foreground: "#ff7040", background: "#060100" },
  snowflake: { foreground: "#c0e8ff", background: "#000408" },
  sunflower: { foreground: "#ffcc40", background: "#060400" },
  "dna-wave": { foreground: "#60ff90", background: "#000802" },
  "hex-matrix": { foreground: "#40d0ff", background: "#000810" },
  "twin-stars": { foreground: "#ffffff", background: "#020208" },
  "red-lattice": { foreground: "#ff8888", background: "#080000" },
  vortex: { foreground: "#80ffcc", background: "#000806" },
}

const starburstPalettes = [
  { name: "Ember", foreground: "#ff6030", line: "#ff3800", background: "#0a0200" },
  { name: "Ocean", foreground: "#40d0ff", line: "#0088cc", background: "#000a12" },
  { name: "Aurora", foreground: "#40ffaa", line: "#00cc66", background: "#000a05" },
  { name: "Violet", foreground: "#cc88ff", line: "#8844ee", background: "#08000f" },
  { name: "Gold", foreground: "#ffcc44", line: "#ff9900", background: "#0a0600" },
  { name: "Rose", foreground: "#ff88bb", line: "#ee3377", background: "#0a0005" },
  { name: "Ice", foreground: "#aaeeff", line: "#66ccff", background: "#000810" },
  { name: "Neon", foreground: "#ccff00", line: "#88ff00", background: "#030800" },
  { name: "Ghost", foreground: "#ddeeff", line: "#99bbcc", background: "#020408" },
]

function randomRange(min: number, max: number, step = 1) {
  const raw = min + Math.random() * (max - min)
  return Math.round(raw / step) * step
}

function randomItem<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)]
}

function randomHexColor() {
  return `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const wrapHue = (value: number) => ((value % 360) + 360) % 360
const unsnappedRange = (min: number, max: number) => min + Math.random() * (max - min)

function hslToHex(hue: number, saturation: number, lightness: number) {
  const h = wrapHue(hue)
  const s = clamp01(saturation)
  const l = clamp01(lightness)
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const x = chroma * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l - chroma / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [chroma, x, 0]
  else if (h < 120) [r, g, b] = [x, chroma, 0]
  else if (h < 180) [r, g, b] = [0, chroma, x]
  else if (h < 240) [r, g, b] = [0, x, chroma]
  else if (h < 300) [r, g, b] = [x, 0, chroma]
  else [r, g, b] = [chroma, 0, x]
  return `#${[r, g, b].map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, "0")).join("")}`
}

const flannelEarthHues = [26, 38, 52, 76, 102, 164, 204, 342]
const flannelJewelHues = [214, 250, 282, 318, 352, 36, 160, 188]
const flannelNeutralAccentHues = [24, 36, 44, 208, 224, 260]
const flannelSchemes = ["analog", "complement", "triad", "muted", "pastel", "earth", "jewel", "mono", "neutralAccent", "cool", "warm"] as const
type FlannelScheme = typeof flannelSchemes[number]

function flannelHueSet(scheme: FlannelScheme, baseHue: number) {
  switch (scheme) {
    case "analog": return [baseHue - 34, baseHue - 16, baseHue, baseHue + 18, baseHue + 38]
    case "complement": return [baseHue - 12, baseHue + 8, baseHue + 180, baseHue + 196, baseHue + 150]
    case "triad": return [baseHue, baseHue + 112, baseHue + 232, baseHue + 124, baseHue + 244]
    case "earth": return flannelEarthHues
    case "jewel": return flannelJewelHues
    case "neutralAccent": return [...flannelNeutralAccentHues, baseHue, baseHue + 180]
    case "cool": return [176, 196, 212, 232, 258, 286]
    case "warm": return [350, 12, 28, 42, 58, 78]
    default: return [baseHue - 8, baseHue, baseHue + 10, baseHue + 24, baseHue - 22]
  }
}

function flannelSchemeColor(scheme: FlannelScheme, hues: number[], index: number) {
  const hue = randomItem(hues) + unsnappedRange(-7, 7)
  if (scheme === "pastel") return hslToHex(hue, unsnappedRange(0.32, 0.62), unsnappedRange(0.72, 0.88))
  if (scheme === "muted") return hslToHex(hue, unsnappedRange(0.18, 0.48), unsnappedRange(0.3, 0.66))
  if (scheme === "earth") return hslToHex(hue, unsnappedRange(0.22, 0.55), unsnappedRange(0.3, 0.62))
  if (scheme === "jewel") return hslToHex(hue, unsnappedRange(0.52, 0.82), unsnappedRange(0.28, 0.52))
  if (scheme === "mono") return hslToHex(hue, unsnappedRange(0.1, 0.36), unsnappedRange(0.14 + (index % 5) * 0.14, 0.28 + (index % 5) * 0.14))
  if (scheme === "neutralAccent") {
    const accent = index % 4 === 0
    return hslToHex(hue, accent ? unsnappedRange(0.52, 0.85) : unsnappedRange(0.04, 0.18), accent ? unsnappedRange(0.36, 0.66) : unsnappedRange(0.18, 0.82))
  }
  return scheme === "cool"
    ? hslToHex(hue, unsnappedRange(0.38, 0.78), unsnappedRange(0.32, 0.72))
    : hslToHex(hue, unsnappedRange(0.42, 0.84), unsnappedRange(0.34, 0.7))
}

function randomFlannelPalette(count: number) {
  const scheme = randomItem(flannelSchemes)
  const hues = flannelHueSet(scheme, Math.random() * 360)
  const colors = Array.from({ length: count }, (_, index) => flannelSchemeColor(scheme, hues, index))
  if (count >= 3 && Math.random() < 0.55) {
    colors[Math.floor(Math.random() * count)] = randomItem(["#080808", "#141414", "#f0eee6", "#ded7c6", "#ffffff"])
  }
  return colors
}

function randomFlannelWeaveParams(): FlannelSettings["weaveParams"] {
  return {
    dotSize: randomRange(1, 6, 0.1),
    dotSpacing: randomRange(4, 12, 0.5),
    dotCoverage: randomRange(0.25, 0.75, 0.01),
    lineWidth: randomRange(0.5, 4, 0.1),
    lineSpacing: randomRange(2, 10, 0.5),
    lineAngle: randomRange(0, 90),
  }
}

function Section({ title, children, onReset }: { title: string; children: ReactNode; onReset?: () => void }) {
  return (
    <section className="section-card">
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        {onReset && (
          <button className="section-reset" type="button" onClick={onReset} title={`Reset ${title}`}>
            <RotateCcw size={13} />
          </button>
        )}
      </div>
      <div className="control-group">{children}</div>
    </section>
  )
}

function SliderControl({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix = "",
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  suffix?: string
}) {
  const [draftValue, setDraftValue] = useState(value)
  const [isDragging, setIsDragging] = useState(false)
  const frameRef = useRef<number | null>(null)
  const pendingValueRef = useRef(value)
  const activePointerRef = useRef<number | null>(null)
  const pct = ((draftValue - min) / (max - min)) * 100
  const indicatorPosition = `calc(${pct}% + ${7 - pct * 0.14}px)`
  const fillPosition = `calc(${pct}% + ${14 - pct * 0.14}px)`
  const firstTick = Math.ceil(min)
  const lastTick = Math.floor(max)
  const tickValues = lastTick - firstTick >= 1 && lastTick <= 10
    ? Array.from({ length: lastTick - firstTick + 1 }, (_, index) => firstTick + index)
    : []

  useEffect(() => {
    setDraftValue(value)
  }, [value])

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
  }, [])

  const updateValue = (nextValue: number) => {
    setDraftValue(nextValue)
    pendingValueRef.current = nextValue
    if (frameRef.current !== null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      onChange(pendingValueRef.current)
    })
  }

  const updateFromPointer = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width <= 0) return
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    const steps = Math.round((min + ratio * (max - min) - min) / step)
    const precision = Math.max(0, (String(step).split(".")[1] ?? "").length)
    const nextValue = Number(Math.min(max, Math.max(min, min + steps * step)).toFixed(precision))
    updateValue(nextValue)
  }

  const beginPointerDrag = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return
    activePointerRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsDragging(true)
    updateFromPointer(event)
    event.preventDefault()
  }

  const continuePointerDrag = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (activePointerRef.current !== event.pointerId) return
    updateFromPointer(event)
    event.preventDefault()
  }

  const endPointerDrag = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (activePointerRef.current !== event.pointerId) return
    activePointerRef.current = null
    setIsDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <label className="control-row">
      <span className="control-label">
        <span className="control-name">{label}</span>
        <span className="control-val">
          {Number.isInteger(step) ? Math.round(draftValue) : Number(draftValue).toFixed(step < 0.1 ? 2 : 1)}
          {suffix}
        </span>
      </span>
      <span
        className={`slider-shell ${isDragging ? "is-dragging" : ""}`}
        style={{
          "--value-percent": `${pct}%`,
          "--indicator-position": indicatorPosition,
          "--fill-position": fillPosition,
        } as CSSProperties}
        onPointerDown={beginPointerDrag}
        onPointerMove={continuePointerDrag}
        onPointerUp={endPointerDrag}
        onPointerCancel={endPointerDrag}
        onLostPointerCapture={() => {
          activePointerRef.current = null
          setIsDragging(false)
        }}
      >
        <input className="slider" type="range" min={min} max={max} step={step} value={draftValue} onChange={(event) => updateValue(Number(event.target.value))} />
        {tickValues.length > 0 && (
          <span className="slider-ticks" aria-hidden="true">
            {tickValues.map((tick) => (
              <i
                key={tick}
                style={{ left: `${((tick - min) / (max - min)) * 100}%` }}
              />
            ))}
          </span>
        )}
        <span className="slider-indicator" aria-hidden="true" />
      </span>
    </label>
  )
}

function ToggleControl({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button className="toggle-row" type="button" onClick={() => onChange(!value)}>
      <span className="toggle-label">{label}</span>
      <span className={`toggle ${value ? "on" : ""}`} />
    </button>
  )
}

function PillGroup<T extends string>({ label, options, value, onChange }: { label: string; options: Array<{ label: string; value: T }>; value: T; onChange: (value: T) => void }) {
  return (
    <div className="control-row">
      <span className="control-sublabel">{label}</span>
      <div className="pill-row">
        {options.map((option) => (
          <button key={option.value} type="button" className={`pill-btn ${value === option.value ? "active" : ""}`} onClick={() => onChange(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function SelectControl<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ label: string; value: T; disabled?: boolean }>; onChange: (value: T) => void }) {
  return (
    <label className="control-row">
      <span className="select-shell">
        <span className="select-label" aria-hidden="true">{label}</span>
        <select className="export-select" aria-label={label} value={value} onChange={(event) => onChange(event.target.value as T)}>
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>
          ))}
        </select>
        <ChevronsUpDown className="select-chevron" size={16} aria-hidden="true" />
      </span>
    </label>
  )
}

function NumberInput({ label, value, onChange, min = 0, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min?: number; step?: number }) {
  return (
    <label className="number-row">
      <span className="control-name">{label}</span>
      <input className="number-input" type="number" min={min} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}

function ColorSwatchControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="color-swatch-btn">
      <span className="color-block" style={{ background: value }} />
      <span className="color-name">{label}</span>
      <span className="color-hex">{value}</span>
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function FlannelPresetThumb({ settings, globalSettings }: { settings: FlannelSettings; globalSettings: GlobalSettings }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d")
    if (!canvas || !context) return
    canvas.width = 96
    canvas.height = 96
    drawFlannelFrame(
      context,
      settings,
      { ...globalSettings, canvasWidth: 96, canvasHeight: 96, transparentBackground: false },
      { useOriginalColors: false, customColors: true, foregroundColor: "#ffffff", backgroundColor: settings.backgroundColor },
      96,
      96,
      false,
    )
  }, [globalSettings, settings])

  return <canvas ref={canvasRef} className="preset-thumb-canvas" aria-hidden="true" />
}

const flannelWeaveModes: Array<{ value: FlannelSettings["weaveStyle"]; label: string; description: string; icon: string }> = [
  { value: "halftone", label: "Halftone", description: "dot texture overlay", icon: "●" },
  { value: "twill", label: "Twill", description: "diagonal woven linework", icon: "╱" },
  { value: "solid", label: "Solid", description: "flat color blend", icon: "■" },
  { value: "crosshatch", label: "Crosshatch", description: "crossed thread marks", icon: "▧" },
]

type SortableFlannelStripeProps = {
  entry: FlannelStripe
  index: number
  canRemove: boolean
  onUpdate: (patch: Partial<FlannelStripe>) => void
  onRemove: () => void
}

function SortableFlannelStripe({ entry, index, canRemove, onUpdate, onRemove }: SortableFlannelStripeProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    transition: {
      duration: 120,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
    },
  })

  return (
    <div
      ref={setNodeRef}
      className={`sett-entry ${isDragging ? "dragging" : ""}`}
      style={{
        transform: CSS.Translate.toString(transform),
        transition: isDragging ? undefined : transition,
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      <button className="drag-handle" type="button" title="Drag to reorder" aria-label={`Drag stripe ${index + 1} to reorder`} {...attributes} {...listeners}>
        ⠿
      </button>
      <label className="sett-color" title={`Stripe ${index + 1}`}>
        <span style={{ background: entry.color }} />
        <input type="color" value={entry.color} onChange={(event) => onUpdate({ color: event.target.value })} />
      </label>
      <div className="sett-entry-sliders">
        <label className="sett-entry-width" style={{ "--value-percent": `${((entry.width - 2) / (200 - 2)) * 100}%` } as CSSProperties}>
          <span className="entry-label">φ</span>
          <input className="mini-slider" type="range" min={2} max={200} step={1} value={entry.width} onChange={(event) => onUpdate({ width: Number(event.target.value) })} />
          <input className="width-input" type="number" min={2} max={200} value={Math.round(entry.width)} onChange={(event) => onUpdate({ width: Number(event.target.value) })} />
        </label>
        <label className="sett-entry-opacity" style={{ "--value-percent": `${entry.opacity * 100}%` } as CSSProperties}>
          <span className="entry-label">α</span>
          <input className="mini-slider" type="range" min={0} max={1} step={0.01} value={entry.opacity} onChange={(event) => onUpdate({ opacity: Number(event.target.value) })} />
          <input className="opacity-input" type="number" min={0} max={1} step={0.01} value={entry.opacity.toFixed(2)} onChange={(event) => onUpdate({ opacity: Number(event.target.value) })} />
        </label>
      </div>
      <button className="remove-btn sett-remove" type="button" onClick={onRemove} disabled={!canRemove}>×</button>
    </div>
  )
}

export default function ControlPanel({
  selectedMode,
  globalSettings,
  modeSettings,
  exportFormat,
  backgroundChoice,
  customBackground,
  onModeChange,
  onGlobalChange,
  onModeSettingChange,
  onModeGroupChange,
  onEffectColorChange,
  onEffectToneChange,
  onExportFormatChange,
  onBackgroundChoiceChange,
  onCustomBackgroundChange,
  onExport,
  onFlannelExport,
  onFlannelCopyEmbed,
  onResetAll,
  onResetCurrentMode,
  onResetColors,
  uploadedAsset,
  onUploadAsset,
  onUploadedAssetChange,
  onClearUploadedAsset,
  exportingGif,
  gifProgress,
}: ControlPanelProps) {
  const [gifSettingsOpen, setGifSettingsOpen] = useState(false)
  const flannelSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const flannelMode = selectedMode === "flannel"
  const standaloneMode = ["node-graph", "starburst"].includes(selectedMode)
  const independentMode = standaloneMode || flannelMode
  const animatedStandaloneMode = ["node-graph", "starburst"].includes(selectedMode)
  const reconstructionMode = !["lego-mosaic", "masked-grid-shimmer", "node-graph", "starburst", "flannel"].includes(selectedMode)
  const userUploadedAsset = uploadedAsset && !uploadedAsset.isDefaultSource
  const gifExportEnabled = animatedStandaloneMode || Boolean(uploadedAsset?.mediaType === "video" && uploadedAsset.animated)
  const mp4ExportEnabled = Boolean(uploadedAsset?.mediaType === "video" && uploadedAsset.animated)
  const gifFrameMax = uploadedAsset?.mediaType === "video" && uploadedAsset.animated ? 360 : 180
  const flannelExportFormat: "svg" | "png" = exportFormat === "png" ? "png" : "svg"
  const setLego = (key: string) => (value: number) => onModeSettingChange("legoMosaic", key, value)
  const setMask = (key: string) => (value: number) => onModeSettingChange("maskedGrid", key, value)
  const setRecon = (key: string) => (value: number) => onModeSettingChange("reconstruction", key, value)
  const setNode = (key: string) => (value: number) => onModeSettingChange("nodeGraph", key, value)
  const setStarburst = (key: string) => (value: number) => onModeSettingChange("starburst", key, value)
  const setFlannel = (key: string) => (value: number) => onModeSettingChange("flannel", key, value)
  const effectColors = modeSettings.effectColors[selectedMode]
  const effectTone = modeSettings.effectTone[selectedMode]
  const applyNodePreset = (preset: keyof typeof nodeGraphPresets | "custom") => {
    onModeSettingChange("nodeGraph", "preset", preset)
    if (preset === "custom") return
    Object.entries(nodeGraphPresets[preset]).forEach(([key, value]) => {
      onModeSettingChange("nodeGraph", key, value)
    })
    onEffectColorChange("node-graph", "foregroundColor", nodeGraphPresetColors[preset].foreground)
    onEffectColorChange("node-graph", "backgroundColor", nodeGraphPresetColors[preset].background)
    onEffectColorChange("node-graph", "customColors", true)
  }
  const applyFlannelPreset = (preset: FlannelSettings["preset"]) => {
    if (preset === "custom") return
    const next = cloneFlannelSettings(flannelPresets[preset])
    onModeGroupChange("flannel", {
      preset,
      sett: next.sett,
      symmetric: next.symmetric,
      weaveStyle: next.weaveStyle,
      weaveParams: next.weaveParams,
      scale: next.scale,
      rotation: next.rotation,
      backgroundColor: next.backgroundColor,
      invertColors: next.invertColors,
    })
    onEffectColorChange("flannel", "backgroundColor", next.backgroundColor)
    onEffectColorChange("flannel", "customColors", true)
  }
  const resetEffectTone = () => {
    onEffectToneChange(selectedMode, "brightness", 50)
    onEffectToneChange(selectedMode, "contrast", 50)
    onEffectToneChange(selectedMode, "threshold", 50)
    onEffectToneChange(selectedMode, "gamma", 50)
  }
  const resetExportSettings = () => {
    onBackgroundChoiceChange("dark")
    onCustomBackgroundChange("#050505")
    onExportFormatChange("svg")
    onGlobalChange("exportScale", 4)
    onGlobalChange("gifFps", 30)
    onGlobalChange("gifFrameCount", 60)
    onGlobalChange("gifLoop", true)
    onGlobalChange("gifQuality", "high")
    onGlobalChange("mp4Resolution", 720)
    onGlobalChange("mp4Fps", 30)
  }
  const resetFlannelPreset = () => applyFlannelPreset(defaultFlannelSettings.preset)
  const resetFlannelSett = () => {
    const next = cloneFlannelSettings(defaultFlannelSettings)
    onModeGroupChange("flannel", { preset: "custom", sett: next.sett, symmetric: next.symmetric })
  }
  const resetFlannelWeave = () => {
    const next = cloneFlannelSettings(defaultFlannelSettings)
    onModeGroupChange("flannel", { preset: "custom", weaveStyle: next.weaveStyle, weaveParams: next.weaveParams })
  }
  const resetFlannelGeometry = () => {
    const next = cloneFlannelSettings(defaultFlannelSettings)
    onModeGroupChange("flannel", { preset: "custom", scale: next.scale, rotation: next.rotation, invertColors: next.invertColors })
  }
  const resetFlannelExportResolution = () => {
    onModeSettingChange("flannel", "canvasResolution", defaultFlannelSettings.canvasResolution)
  }
  const resetFlannelExport = () => {
    onExportFormatChange("svg")
    onModeSettingChange("flannel", "pngScale", defaultFlannelSettings.pngScale)
  }
  const updateFlannelParams = (patch: Partial<FlannelSettings["weaveParams"]>) => {
    onModeGroupChange("flannel", { preset: "custom", weaveParams: { ...modeSettings.flannel.weaveParams, ...patch } })
  }
  const updateFlannelStripe = (id: string, patch: Partial<FlannelStripe>) => {
    onModeGroupChange("flannel", { preset: "custom", sett: modeSettings.flannel.sett.map((entry) => entry.id === id ? { ...entry, ...patch } : entry) })
  }
  const removeFlannelStripe = (id: string) => {
    if (modeSettings.flannel.sett.length <= 1) return
    onModeGroupChange("flannel", { preset: "custom", sett: modeSettings.flannel.sett.filter((entry) => entry.id !== id) })
  }
  const addFlannelStripe = () => {
    const current = modeSettings.flannel.sett
    onModeGroupChange("flannel", { preset: "custom", sett: [...current, createFlannelStripe(current.length, current[current.length - 1])] })
  }
  const setFlannelStripeCount = (count: number) => {
    const nextCount = Math.max(1, Math.min(24, Math.round(count)))
    const current = modeSettings.flannel.sett
    let next = current.slice(0, nextCount)
    while (next.length < nextCount) {
      next = [...next, createFlannelStripe(next.length, next[next.length - 1])]
    }
    onModeGroupChange("flannel", { preset: "custom", sett: next })
  }
  const reorderFlannelStripe = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    const current = modeSettings.flannel.sett
    if (fromIndex < 0 || toIndex < 0) return
    if (fromIndex >= current.length || toIndex >= current.length) return
    const next = [...current]
    const [entry] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, entry)
    onModeGroupChange("flannel", { preset: "custom", sett: next })
  }
  const handleFlannelDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const current = modeSettings.flannel.sett
    const fromIndex = current.findIndex((entry) => entry.id === active.id)
    const toIndex = current.findIndex((entry) => entry.id === over.id)
    reorderFlannelStripe(fromIndex, toIndex)
  }
  const randomizeFlannelWeave = () => {
    const choices = flannelWeaveModes.filter((mode) => mode.value !== modeSettings.flannel.weaveStyle)
    const style = randomItem(choices.length > 0 ? choices : flannelWeaveModes).value
    onModeGroupChange("flannel", { preset: "custom", weaveStyle: style })
  }
  const randomizeAsciiCharacters = () => onModeSettingChange("reconstruction", "characterSet", randomItem(asciiCharacterPresets))
  const randomizeEffectControls = () => {
    if (selectedMode === "node-graph") {
      applyNodePreset(randomItem(Object.keys(nodeGraphPresets)) as keyof typeof nodeGraphPresets)
      onModeSettingChange("nodeGraph", "randomSeed", Math.floor(Math.random() * 99999) + 1)
      return
    }
    if (selectedMode === "starburst") {
      const palette = randomItem(starburstPalettes)
      onEffectColorChange("starburst", "foregroundColor", palette.foreground)
      onEffectColorChange("starburst", "backgroundColor", palette.background)
      onModeSettingChange("starburst", "lineColor", palette.line)
      onModeSettingChange("starburst", "rayCount", randomRange(18, 55))
      onModeSettingChange("starburst", "rayLenMin", randomRange(40, 130))
      onModeSettingChange("starburst", "rayLenMax", randomRange(180, 500))
      onModeSettingChange("starburst", "clusterBias", randomRange(0, 0.7, 0.01))
      onModeSettingChange("starburst", "clusterDirection", randomRange(0, 360))
      onModeSettingChange("starburst", "secondaryChance", randomRange(0.2, 0.8, 0.01))
      onModeSettingChange("starburst", "hubX", 0)
      onModeSettingChange("starburst", "hubY", 0)
      onModeSettingChange("starburst", "hubSize", randomRange(6, 16, 0.5))
      onModeSettingChange("starburst", "hubGlow", randomRange(15, 40))
      onModeSettingChange("starburst", "nodeSizeMin", randomRange(2, 5, 0.5))
      onModeSettingChange("starburst", "nodeSizeMax", randomRange(5, 12, 0.5))
      onModeSettingChange("starburst", "nodeGlow", randomRange(8, 28))
      onModeSettingChange("starburst", "lineOpacity", randomRange(0.2, 0.7, 0.01))
      onModeSettingChange("starburst", "lineWidth", randomRange(0.4, 1.4, 0.1))
      onModeSettingChange("starburst", "swayIntensity", randomRange(0.3, 2.2, 0.05))
      onModeSettingChange("starburst", "pulseSpeed", randomRange(0.4, 2, 0.05))
      onModeSettingChange("starburst", "animSpeed", randomRange(0.4, 1.8, 0.05))
      onModeSettingChange("starburst", "randomSeed", Math.floor(Math.random() * 99999) + 1)
      return
    }
    if (selectedMode === "flannel") {
      const count = 5 + Math.floor(Math.random() * 5)
      const colors = randomFlannelPalette(count)
      const sett = Array.from({ length: count }, (_, index) => ({
        id: `stripe-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        color: colors[index],
        width: index % 3 === 0 ? 10 + Math.random() * 20 : 40 + Math.random() * 100,
        opacity: 1,
      }))
      onModeGroupChange("flannel", {
        preset: "custom",
        sett,
        weaveStyle: randomItem(flannelWeaveModes).value,
        weaveParams: randomFlannelWeaveParams(),
        symmetric: true,
      })
      return
    }
    if (selectedMode === "lego-mosaic") {
      onModeSettingChange("legoMosaic", "shapeType", randomItem(["lego-studs", "rounded-square", "flat-square", "circle", "diamond"]))
      onModeSettingChange("legoMosaic", "gridRows", randomRange(18, 88))
      onModeSettingChange("legoMosaic", "cellGap", randomRange(0, 4, 0.25))
      onModeSettingChange("legoMosaic", "tileCornerRadius", randomRange(0, 6, 0.25))
      onModeSettingChange("legoMosaic", "studRadius", randomRange(0.22, 0.44, 0.01))
      onModeSettingChange("legoMosaic", "ringThickness", randomRange(0.03, 0.14, 0.01))
      onModeSettingChange("legoMosaic", "lightAngle", randomRange(0, 360))
      onModeSettingChange("legoMosaic", "highlightStrength", randomRange(0.18, 0.65, 0.01))
      onModeSettingChange("legoMosaic", "shadowStrength", randomRange(0.18, 0.65, 0.01))
      onModeSettingChange("legoMosaic", "rimStrength", randomRange(0.15, 0.9, 0.01))
      return
    }
    if (selectedMode === "masked-grid-shimmer") {
      onModeSettingChange("maskedGrid", "maskSourceMode", randomItem(["auto", "alpha", "luminance", "inverted-luminance"]))
      onModeSettingChange("maskedGrid", "foregroundSquareSize", randomRange(5, 18))
      onModeSettingChange("maskedGrid", "foregroundGridGap", randomRange(1, 10))
      onModeSettingChange("maskedGrid", "foregroundSpeed", randomRange(0.3, 2.4, 0.05))
      onModeSettingChange("maskedGrid", "foregroundFlickerAmount", randomRange(0.05, 0.75, 0.01))
      onModeSettingChange("maskedGrid", "backgroundGridEnabled", Math.random() > 0.25)
      onModeSettingChange("maskedGrid", "backgroundGridColor", randomHexColor())
      onModeSettingChange("maskedGrid", "backgroundSquareSize", randomRange(3, 13))
      onModeSettingChange("maskedGrid", "backgroundGridIntensity", randomRange(0.08, 0.45, 0.01))
      return
    }
    if (selectedMode === "halftone-dots") {
      const spacing = randomRange(8, 30)
      onModeSettingChange("reconstruction", "gridSpacing", spacing)
      onModeSettingChange("reconstruction", "minDotSize", randomRange(0, 3, 0.25))
      onModeSettingChange("reconstruction", "maxDotSize", randomRange(spacing * 0.45, spacing * 1.4))
      onModeSettingChange("reconstruction", "dotShape", randomItem(["circle", "square", "diamond"]))
      onModeSettingChange("reconstruction", "dotOpacity", randomRange(0.65, 1, 0.01))
      return
    }
    if (selectedMode === "ascii-grid") {
      onModeSettingChange("reconstruction", "characterSize", randomRange(8, 24))
      onModeSettingChange("reconstruction", "characterSpacingX", randomRange(7, 22))
      onModeSettingChange("reconstruction", "characterSpacingY", randomRange(10, 30))
      onModeSettingChange("reconstruction", "fontWeight", randomItem(["400", "500", "600", "700", "800"]))
      onModeSettingChange("reconstruction", "textOpacity", randomRange(0.65, 1, 0.01))
      randomizeAsciiCharacters()
      return
    }
    if (selectedMode === "scanline-reconstruction") {
      onModeSettingChange("reconstruction", "lineSpacing", randomRange(4, 18))
      onModeSettingChange("reconstruction", "lineThickness", randomRange(0.75, 5, 0.25))
      onModeSettingChange("reconstruction", "lineLength", randomRange(8, 36))
      onModeSettingChange("reconstruction", "scanlineOpacity", randomRange(0.55, 1, 0.01))
      return
    }
    if (selectedMode === "ordered-dither") {
      onModeSettingChange("reconstruction", "ditherStrength", randomRange(0.45, 2.1, 0.05))
      onModeSettingChange("reconstruction", "markSize", randomRange(4, 15))
      onModeSettingChange("reconstruction", "markShape", randomItem(["square", "circle", "diamond"]))
      onModeSettingChange("reconstruction", "matrixSize", randomItem([2, 4, 8]))
    }
  }
  const randomizeColorPreset = () => {
    if (selectedMode === "flannel") {
      const colors = randomFlannelPalette(modeSettings.flannel.sett.length)
      const nextSett = modeSettings.flannel.sett.map((entry, index) => ({ ...entry, color: colors[index] }))
      onModeGroupChange("flannel", { preset: "custom", sett: nextSett })
      return
    }
    onEffectColorChange(selectedMode, "foregroundColor", randomHexColor())
    onEffectColorChange(selectedMode, "backgroundColor", randomItem(["#050505", "#ffffff", "#101820", "#f2efe8", "#111111", randomHexColor()]))
    if (selectedMode === "starburst") onModeSettingChange("starburst", "lineColor", randomHexColor())
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-scroll">
        {!independentMode && (
          <Section title="Upload" onReset={onClearUploadedAsset}>
            <label
              className="upload-box"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const file = event.dataTransfer.files?.[0]
                if (file) onUploadAsset(file)
              }}
            >
              <span className="upload-title">{userUploadedAsset ? uploadedAsset.name : "Upload your file"}</span>
              <span className="upload-caption">Browse or drop • SVG, PNG, JPG, WebP, MP4, MOV, WebM</span>
              <input
                type="file"
                accept="image/svg+xml,image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,video/*"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) onUploadAsset(file)
                  event.currentTarget.value = ""
                }}
              />
            </label>
            {userUploadedAsset && (
              <>
                <SliderControl label="Scale" value={uploadedAsset.scale} min={0.1} max={1.5} step={0.01} onChange={(scale) => onUploadedAssetChange({ ...uploadedAsset, scale })} />
                <button className="ghost-btn" type="button" onClick={onClearUploadedAsset}>Clear Upload</button>
              </>
            )}
          </Section>
        )}

        <Section title="Effect" onReset={onResetCurrentMode}>
          <div className="mode-group-label">Upload reconstruction</div>
          <div className="mode-grid">
            {uploadEffectModes.map((mode) => (
              <button key={mode.id} type="button" className={`mode-card ${selectedMode === mode.id ? "active" : ""}`} onClick={() => onModeChange(mode.id)}>
                <span className="mode-icon">{mode.icon}</span>
                <span>
                  <strong>{mode.name}</strong>
                  <small>{mode.description}</small>
                </span>
              </button>
            ))}
          </div>
          <div className="mode-divider" />
          <div className="mode-group-label">Standalone generators</div>
          <div className="mode-grid">
            {generatorModes.map((mode) => (
              <button key={mode.id} type="button" className={`mode-card ${selectedMode === mode.id ? "active" : ""}`} onClick={() => onModeChange(mode.id)}>
                <span className="mode-icon">{mode.icon}</span>
                <span>
                  <strong>{mode.name}</strong>
                  <small>{mode.description}</small>
                </span>
              </button>
            ))}
          </div>
        </Section>

        {flannelMode ? (
          <>
            <Section title="Presets" onReset={resetFlannelPreset}>
              <div className="preset-buttons">
                {(Object.keys(flannelPresets) as Array<Exclude<FlannelSettings["preset"], "custom">>).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`preset-btn ${modeSettings.flannel.preset === preset ? "active" : ""}`}
                    onClick={() => applyFlannelPreset(preset)}
                  >
                    <FlannelPresetThumb settings={flannelPresets[preset]} globalSettings={globalSettings} />
                    <span>{preset === "pop-clash" ? "Pop Clash" : preset === "neon-grid" ? "Neon Grid" : "Maritime"}</span>
                  </button>
                ))}
              </div>
              <button className="ghost-btn" type="button" onClick={randomizeEffectControls}>Randomize All</button>
            </Section>

            <Section title="Sett editor" onReset={resetFlannelSett}>
              <div className="sett-editor">
              <div className="stripe-count-row">
                <span className="slider-label">Stripes</span>
                <div className="stripe-count-ctrl">
                  <button className="count-btn" type="button" onClick={() => setFlannelStripeCount(modeSettings.flannel.sett.length - 1)} disabled={modeSettings.flannel.sett.length <= 1}>−</button>
                  <input
                    className="count-input"
                    type="number"
                    min={1}
                    max={24}
                    value={modeSettings.flannel.sett.length}
                    onChange={(event) => setFlannelStripeCount(Number(event.target.value))}
                  />
                  <button className="count-btn" type="button" onClick={() => setFlannelStripeCount(modeSettings.flannel.sett.length + 1)} disabled={modeSettings.flannel.sett.length >= 24}>+</button>
                  <small className="count-expanded">→ {modeSettings.flannel.symmetric ? modeSettings.flannel.sett.length * 2 - 2 : modeSettings.flannel.sett.length} expanded</small>
                </div>
              </div>
              <DndContext
                sensors={flannelSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleFlannelDragEnd}
              >
                <SortableContext items={modeSettings.flannel.sett.map((entry) => entry.id)} strategy={verticalListSortingStrategy}>
                  <div className="sett-list">
                    {modeSettings.flannel.sett.map((entry, index) => (
                      <SortableFlannelStripe
                        key={entry.id}
                        entry={entry}
                        index={index}
                        canRemove={modeSettings.flannel.sett.length > 1}
                        onUpdate={(patch) => updateFlannelStripe(entry.id, patch)}
                        onRemove={() => removeFlannelStripe(entry.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              <div className="sett-footer">
                <button className="add-stripe-btn" type="button" onClick={addFlannelStripe}>+ Add Stripe</button>
                <ToggleControl label="Mirror" value={modeSettings.flannel.symmetric} onChange={(value) => {
                  onModeSettingChange("flannel", "preset", "custom")
                  onModeSettingChange("flannel", "symmetric", value)
                }} />
              </div>
              <button className="ghost-btn" type="button" onClick={randomizeColorPreset}>Randomize Colors</button>
              </div>
            </Section>

            <Section title="Weave style" onReset={resetFlannelWeave}>
              <div className="weave-picker weave-mode-grid">
                {flannelWeaveModes.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    className={`weave-btn mode-card ${modeSettings.flannel.weaveStyle === mode.value ? "active" : ""}`}
                    onClick={() => {
                      onModeSettingChange("flannel", "preset", "custom")
                      onModeSettingChange("flannel", "weaveStyle", mode.value)
                    }}
                  >
                    <span className={`mode-icon mode-icon-${mode.value}`}>{mode.icon}</span>
                    <span>
                      <strong>{mode.label}</strong>
                      <small>{mode.description}</small>
                    </span>
                  </button>
                ))}
              </div>
              <button className="ghost-btn" type="button" onClick={randomizeFlannelWeave}>Randomize Weave</button>
              {modeSettings.flannel.weaveStyle === "halftone" && (
                <>
                  <SliderControl label="Dot Size" value={modeSettings.flannel.weaveParams.dotSize} min={1} max={6} step={0.1} suffix="px" onChange={(value) => updateFlannelParams({ dotSize: value })} />
                  <SliderControl label="Dot Spacing" value={modeSettings.flannel.weaveParams.dotSpacing} min={4} max={12} step={0.5} suffix="px" onChange={(value) => updateFlannelParams({ dotSpacing: value })} />
                  <SliderControl label="Coverage" value={modeSettings.flannel.weaveParams.dotCoverage} min={0.25} max={0.75} step={0.01} suffix="%" onChange={(value) => updateFlannelParams({ dotCoverage: value })} />
                </>
              )}
              {(modeSettings.flannel.weaveStyle === "twill" || modeSettings.flannel.weaveStyle === "crosshatch") && (
                <>
                  <SliderControl label="Line Width" value={modeSettings.flannel.weaveParams.lineWidth} min={0.5} max={4} step={0.1} suffix="px" onChange={(value) => updateFlannelParams({ lineWidth: value })} />
                  <SliderControl label="Line Spacing" value={modeSettings.flannel.weaveParams.lineSpacing} min={2} max={10} step={0.5} suffix="px" onChange={(value) => updateFlannelParams({ lineSpacing: value })} />
                </>
              )}
              {modeSettings.flannel.weaveStyle === "twill" && (
                <SliderControl label="Angle" value={modeSettings.flannel.weaveParams.lineAngle} min={0} max={90} suffix="°" onChange={(value) => updateFlannelParams({ lineAngle: value })} />
              )}
            </Section>

            <Section title="Scale & geometry" onReset={resetFlannelGeometry}>
              <SliderControl label="Pattern Scale" value={modeSettings.flannel.scale} min={0.25} max={3} step={0.01} suffix="×" onChange={(value) => {
                onModeSettingChange("flannel", "preset", "custom")
                onModeSettingChange("flannel", "scale", value)
              }} />
              <SliderControl label="Rotation" value={modeSettings.flannel.rotation} min={0} max={360} suffix="°" onChange={(value) => {
                onModeSettingChange("flannel", "preset", "custom")
                onModeSettingChange("flannel", "rotation", value)
              }} />
              <ToggleControl label="Invert Colors" value={modeSettings.flannel.invertColors} onChange={(value) => {
                onModeSettingChange("flannel", "preset", "custom")
                onModeSettingChange("flannel", "invertColors", value)
              }} />
            </Section>

            <Section title="Export resolution" onReset={resetFlannelExportResolution}>
              <PillGroup
                label="Resolution"
                value={String(modeSettings.flannel.canvasResolution)}
                onChange={(value) => onModeSettingChange("flannel", "canvasResolution", Number(value))}
                options={[
                  { label: "800", value: "800" },
                  { label: "1200", value: "1200" },
                  { label: "2000", value: "2000" },
                  { label: "2800", value: "2800" },
                ]}
              />
            </Section>

            <Section title="Export" onReset={resetFlannelExport}>
              <PillGroup
                label="Format"
                value={flannelExportFormat}
                onChange={onExportFormatChange}
                options={[
                  { label: "SVG", value: "svg" },
                  { label: "PNG", value: "png" },
                ]}
              />
              {flannelExportFormat === "png" && (
                <PillGroup
                  label="PNG Size"
                  value={String(modeSettings.flannel.pngScale)}
                  onChange={(value) => onModeSettingChange("flannel", "pngScale", Number(value))}
                  options={[
                    { label: "1x", value: "1" },
                    { label: "2x", value: "2" },
                    { label: "3x", value: "3" },
                    { label: "4x", value: "4" },
                    { label: "5x", value: "5" },
                  ]}
                />
              )}
              <div className="export-hint">
                {flannelExportFormat === "svg"
                  ? `Vector export at ${modeSettings.flannel.canvasResolution}px.`
                  : `Raster export at ${modeSettings.flannel.pngScale}x.`}
              </div>
              <button className="download-btn" type="button" onClick={() => onFlannelExport(flannelExportFormat)}>
                {flannelExportFormat === "svg" ? "Export SVG" : "Export PNG"}
              </button>
              <button className="ghost-btn" type="button" onClick={onFlannelCopyEmbed}>Copy embed</button>
            </Section>
          </>
        ) : (
          <>

        {!standaloneMode && (
          <Section title="Effect Tone" onReset={resetEffectTone}>
            <SliderControl label="Brightness" value={effectTone.brightness} min={0} max={100} onChange={(value) => onEffectToneChange(selectedMode, "brightness", Math.round(value))} />
            <SliderControl label="Contrast" value={effectTone.contrast} min={0} max={100} onChange={(value) => onEffectToneChange(selectedMode, "contrast", Math.round(value))} />
            <SliderControl label="Threshold" value={effectTone.threshold} min={0} max={100} onChange={(value) => onEffectToneChange(selectedMode, "threshold", Math.round(value))} />
            <SliderControl label="Gamma" value={effectTone.gamma} min={0} max={100} onChange={(value) => onEffectToneChange(selectedMode, "gamma", Math.round(value))} />
            {selectedMode === "masked-grid-shimmer" && (
              <>
                <SliderControl label="Coverage Threshold" value={Math.round(modeSettings.maskedGrid.coverageThreshold * 100)} min={0} max={100} step={1} suffix="%" onChange={(v) => onModeSettingChange("maskedGrid", "coverageThreshold", v / 100)} />
                <ToggleControl label="Invert Mask" value={modeSettings.maskedGrid.invertMask} onChange={(value) => onModeSettingChange("maskedGrid", "invertMask", value)} />
              </>
            )}
            {reconstructionMode && (
              <ToggleControl label="Invert Colors" value={modeSettings.reconstruction.invertColors} onChange={(value) => onModeSettingChange("reconstruction", "invertColors", value)} />
            )}
          </Section>
        )}

        <Section title="Effect Controls" onReset={onResetCurrentMode}>
          {selectedMode === "lego-mosaic" && (
            <>
              <SelectControl
                label="Shape Type"
                value={modeSettings.legoMosaic.shapeType}
                onChange={(value) => onModeSettingChange("legoMosaic", "shapeType", value)}
                options={[
                  { label: "Lego Studs", value: "lego-studs" },
                  { label: "Rounded Square", value: "rounded-square" },
                  { label: "Flat Square", value: "flat-square" },
                  { label: "Circle", value: "circle" },
                  { label: "Diamond", value: "diamond" },
                ]}
              />
              <SliderControl label="Grid Rows" value={modeSettings.legoMosaic.gridRows} min={12} max={72} onChange={setLego("gridRows")} />
              <SliderControl label="Cell Gap" value={modeSettings.legoMosaic.cellGap} min={0} max={8} step={0.25} onChange={setLego("cellGap")} />
              <SliderControl label="Tile Corner Radius" value={modeSettings.legoMosaic.tileCornerRadius} min={0} max={8} step={0.25} onChange={setLego("tileCornerRadius")} />
              <SliderControl label="Stud Radius" value={Math.round(modeSettings.legoMosaic.studRadius * 100)} min={18} max={48} step={1} suffix="%" onChange={(v) => onModeSettingChange("legoMosaic", "studRadius", v / 100)} />
              <SliderControl label="Ring Thickness" value={Math.round(modeSettings.legoMosaic.ringThickness * 100)} min={1} max={20} step={1} suffix="%" onChange={(v) => onModeSettingChange("legoMosaic", "ringThickness", v / 100)} />
              <SliderControl label="Light Angle" value={modeSettings.legoMosaic.lightAngle} min={0} max={360} onChange={setLego("lightAngle")} />
              <SliderControl label="Highlight" value={Math.round(modeSettings.legoMosaic.highlightStrength * 100)} min={0} max={80} step={1} suffix="%" onChange={(v) => onModeSettingChange("legoMosaic", "highlightStrength", v / 100)} />
              <SliderControl label="Shadow" value={Math.round(modeSettings.legoMosaic.shadowStrength * 100)} min={0} max={80} step={1} suffix="%" onChange={(v) => onModeSettingChange("legoMosaic", "shadowStrength", v / 100)} />
              <SliderControl label="Rim Strength" value={Math.round(modeSettings.legoMosaic.rimStrength * 100)} min={0} max={100} step={1} suffix="%" onChange={(v) => onModeSettingChange("legoMosaic", "rimStrength", v / 100)} />
            </>
          )}

          {selectedMode === "masked-grid-shimmer" && (
            <>
              <SelectControl
                label="Mask Source Mode"
                value={modeSettings.maskedGrid.maskSourceMode}
                onChange={(value) => onModeSettingChange("maskedGrid", "maskSourceMode", value)}
                options={[
                  { label: "Auto", value: "auto" },
                  { label: "Alpha", value: "alpha" },
                  { label: "Luminance", value: "luminance" },
                  { label: "Inverted Luminance", value: "inverted-luminance" },
                  { label: "Chroma Key", value: "chroma-key" },
                  { label: "Edge / Contour", value: "edge-contour" },
                ]}
              />
              <SliderControl label="Foreground Square" value={modeSettings.maskedGrid.foregroundSquareSize} min={3} max={24} onChange={setMask("foregroundSquareSize")} />
              <SliderControl label="Foreground Gap" value={modeSettings.maskedGrid.foregroundGridGap} min={0} max={12} onChange={setMask("foregroundGridGap")} />
              <SliderControl label="Foreground Speed" value={modeSettings.maskedGrid.foregroundSpeed} min={0} max={4} step={0.05} onChange={setMask("foregroundSpeed")} />
              <SliderControl label="Foreground Flicker" value={Math.round(modeSettings.maskedGrid.foregroundFlickerAmount * 100)} min={0} max={100} step={1} suffix="%" onChange={(v) => onModeSettingChange("maskedGrid", "foregroundFlickerAmount", v / 100)} />
              <ToggleControl label="Background Grid" value={modeSettings.maskedGrid.backgroundGridEnabled} onChange={(value) => onModeSettingChange("maskedGrid", "backgroundGridEnabled", value)} />
              <ColorSwatchControl label="Background Grid Color" value={modeSettings.maskedGrid.backgroundGridColor} onChange={(value) => onModeSettingChange("maskedGrid", "backgroundGridColor", value)} />
              <SliderControl label="Background Square" value={modeSettings.maskedGrid.backgroundSquareSize} min={2} max={18} onChange={setMask("backgroundSquareSize")} />
              <SliderControl label="Background Intensity" value={Math.round(modeSettings.maskedGrid.backgroundGridIntensity * 100)} min={0} max={100} step={1} suffix="%" onChange={(v) => onModeSettingChange("maskedGrid", "backgroundGridIntensity", v / 100)} />
            </>
          )}

          {selectedMode === "node-graph" && (
            <>
              <SelectControl
                label="Preset"
                value={modeSettings.nodeGraph.preset}
                onChange={(value) => applyNodePreset(value as keyof typeof nodeGraphPresets | "custom")}
                options={[
                  { label: "Custom", value: "custom" },
                  { label: "Neural Web", value: "neural-web" },
                  { label: "Galaxy", value: "galaxy" },
                  { label: "Constellation", value: "constellation" },
                  { label: "Crystal Grid", value: "crystal-grid" },
                  { label: "Plasma Storm", value: "plasma-storm" },
                  { label: "Circuit Board", value: "circuit-board" },
                  { label: "Solar System", value: "solar-system" },
                  { label: "Nebula", value: "nebula" },
                  { label: "Fireworks", value: "fireworks" },
                  { label: "Snowflake", value: "snowflake" },
                  { label: "Sunflower", value: "sunflower" },
                  { label: "DNA Wave", value: "dna-wave" },
                  { label: "Hex Matrix", value: "hex-matrix" },
                  { label: "Twin Stars", value: "twin-stars" },
                  { label: "Red Lattice", value: "red-lattice" },
                  { label: "Vortex", value: "vortex" },
                ]}
              />
              <SliderControl label="Node Count" value={modeSettings.nodeGraph.nodeCount} min={20} max={300} onChange={setNode("nodeCount")} />
              <SliderControl label="Node Size" value={modeSettings.nodeGraph.nodeSize} min={1} max={8} step={0.5} suffix=" px" onChange={setNode("nodeSize")} />
              <SliderControl label="Glow Intensity" value={modeSettings.nodeGraph.glowIntensity} min={0} max={20} onChange={setNode("glowIntensity")} />
              <ToggleControl label="Show Connections" value={modeSettings.nodeGraph.showConnections} onChange={(value) => onModeSettingChange("nodeGraph", "showConnections", value)} />
              <SliderControl label="Max Distance" value={modeSettings.nodeGraph.maxDistance} min={30} max={200} suffix=" px" onChange={setNode("maxDistance")} />
              <SliderControl label="Line Thickness" value={modeSettings.nodeGraph.lineThickness} min={0.1} max={2} step={0.1} onChange={setNode("lineThickness")} />
              <SliderControl label="Line Opacity" value={Math.round(modeSettings.nodeGraph.lineOpacity * 100)} min={0} max={100} step={5} suffix="%" onChange={(v) => onModeSettingChange("nodeGraph", "lineOpacity", v / 100)} />
              <SelectControl
                label="Motion Type"
                value={modeSettings.nodeGraph.motionType}
                onChange={(value) => onModeSettingChange("nodeGraph", "motionType", value)}
                options={[
                  { label: "Drift", value: "drift" },
                  { label: "Pulse", value: "pulse" },
                  { label: "Orbit", value: "orbit" },
                  { label: "Freeze", value: "freeze" },
                ]}
              />
              <SliderControl label="Motion Speed" value={modeSettings.nodeGraph.motionSpeed} min={0} max={3} step={0.05} onChange={setNode("motionSpeed")} />
              <SliderControl label="Turbulence" value={Math.round(modeSettings.nodeGraph.turbulence * 100)} min={0} max={100} step={5} suffix="%" onChange={(v) => onModeSettingChange("nodeGraph", "turbulence", v / 100)} />
              <SelectControl
                label="Distribution"
                value={modeSettings.nodeGraph.distribution}
                onChange={(value) => onModeSettingChange("nodeGraph", "distribution", value)}
                options={[
                  { label: "Gaussian", value: "gaussian" },
                  { label: "Uniform", value: "uniform" },
                  { label: "Ring", value: "ring" },
                  { label: "Double Cluster", value: "double" },
                  { label: "Square Grid", value: "grid" },
                  { label: "Hexagonal Grid", value: "hex" },
                  { label: "Triangular Lattice", value: "tri" },
                  { label: "Concentric Rings", value: "radial" },
                  { label: "Star Burst", value: "star" },
                  { label: "Cross / Plus", value: "cross" },
                  { label: "Spiral", value: "spiral" },
                  { label: "Fibonacci", value: "fibonacci" },
                  { label: "Random Walk", value: "randomWalk" },
                  { label: "Fractal Clusters", value: "fractal" },
                  { label: "Wave Bands", value: "wave" },
                  { label: "Explosion Burst", value: "explosion" },
                ]}
              />
              <SliderControl label="Cluster Radius" value={modeSettings.nodeGraph.clusterRadius} min={50} max={390} step={5} onChange={setNode("clusterRadius")} />
              <button className="ghost-btn" type="button" onClick={() => onModeSettingChange("nodeGraph", "randomSeed", Math.floor(Math.random() * 99999) + 1)}>Regenerate Nodes</button>
            </>
          )}

          {selectedMode === "starburst" && (
            <>
              <SliderControl label="Ray Count" value={modeSettings.starburst.rayCount} min={10} max={80} onChange={setStarburst("rayCount")} />
              <SliderControl label="Ray Length Min" value={modeSettings.starburst.rayLenMin} min={30} max={300} suffix=" px" onChange={setStarburst("rayLenMin")} />
              <SliderControl label="Ray Length Max" value={modeSettings.starburst.rayLenMax} min={100} max={600} suffix=" px" onChange={setStarburst("rayLenMax")} />
              <SliderControl label="Cluster Bias" value={Math.round(modeSettings.starburst.clusterBias * 100)} min={0} max={100} step={1} suffix="%" onChange={(v) => onModeSettingChange("starburst", "clusterBias", v / 100)} />
              <SliderControl label="Cluster Direction" value={modeSettings.starburst.clusterDirection} min={0} max={360} suffix="°" onChange={setStarburst("clusterDirection")} />
              <ToggleControl label="Secondary Nodes" value={modeSettings.starburst.secondaryNodes} onChange={(value) => onModeSettingChange("starburst", "secondaryNodes", value)} />
              <SliderControl label="Secondary Chance" value={Math.round(modeSettings.starburst.secondaryChance * 100)} min={0} max={100} step={1} suffix="%" onChange={(v) => onModeSettingChange("starburst", "secondaryChance", v / 100)} />
              <SliderControl label="Hub X Offset" value={modeSettings.starburst.hubX} min={-300} max={300} suffix=" px" onChange={setStarburst("hubX")} />
              <SliderControl label="Hub Y Offset" value={modeSettings.starburst.hubY} min={-300} max={300} suffix=" px" onChange={setStarburst("hubY")} />
              <SliderControl label="Hub Size" value={modeSettings.starburst.hubSize} min={4} max={20} step={0.5} suffix=" px" onChange={setStarburst("hubSize")} />
              <SliderControl label="Hub Glow" value={modeSettings.starburst.hubGlow} min={0} max={40} onChange={setStarburst("hubGlow")} />
              <SliderControl label="Node Size Min" value={modeSettings.starburst.nodeSizeMin} min={2} max={10} step={0.5} suffix=" px" onChange={setStarburst("nodeSizeMin")} />
              <SliderControl label="Node Size Max" value={modeSettings.starburst.nodeSizeMax} min={4} max={16} step={0.5} suffix=" px" onChange={setStarburst("nodeSizeMax")} />
              <SliderControl label="Node Glow" value={modeSettings.starburst.nodeGlow} min={0} max={30} onChange={setStarburst("nodeGlow")} />
              <ColorSwatchControl label="Line Color" value={modeSettings.starburst.lineColor} onChange={(value) => onModeSettingChange("starburst", "lineColor", value)} />
              <SliderControl label="Line Opacity" value={Math.round(modeSettings.starburst.lineOpacity * 100)} min={5} max={100} step={1} suffix="%" onChange={(v) => onModeSettingChange("starburst", "lineOpacity", v / 100)} />
              <SliderControl label="Line Width" value={modeSettings.starburst.lineWidth} min={0.3} max={2} step={0.1} suffix=" px" onChange={setStarburst("lineWidth")} />
              <SliderControl label="Sway Intensity" value={modeSettings.starburst.swayIntensity} min={0} max={3} step={0.05} onChange={setStarburst("swayIntensity")} />
              <SliderControl label="Pulse Speed" value={modeSettings.starburst.pulseSpeed} min={0} max={3} step={0.05} onChange={setStarburst("pulseSpeed")} />
              <SliderControl label="Anim Speed" value={modeSettings.starburst.animSpeed} min={0} max={3} step={0.05} onChange={setStarburst("animSpeed")} />
              <ToggleControl label="Length Breathe" value={modeSettings.starburst.lengthBreathe} onChange={(value) => onModeSettingChange("starburst", "lengthBreathe", value)} />
              <button className="ghost-btn" type="button" onClick={() => onModeSettingChange("starburst", "randomSeed", Math.floor(Math.random() * 99999) + 1)}>Regenerate</button>
            </>
          )}

          {reconstructionMode && (
            <>
              {selectedMode === "halftone-dots" && (
                <>
                  <SliderControl label="Grid Spacing" value={modeSettings.reconstruction.gridSpacing} min={4} max={36} onChange={setRecon("gridSpacing")} />
                  <SliderControl label="Min Dot Size" value={modeSettings.reconstruction.minDotSize} min={0} max={8} step={0.25} onChange={setRecon("minDotSize")} />
                  <SliderControl label="Max Dot Size" value={modeSettings.reconstruction.maxDotSize} min={2} max={36} onChange={setRecon("maxDotSize")} />
                  <SliderControl label="Dot Opacity" value={Math.round(modeSettings.reconstruction.dotOpacity * 100)} min={0} max={100} step={1} suffix="%" onChange={(v) => onModeSettingChange("reconstruction", "dotOpacity", v / 100)} />
                  <PillGroup
                    label="Dot Shape"
                    value={modeSettings.reconstruction.dotShape}
                    onChange={(value) => onModeSettingChange("reconstruction", "dotShape", value)}
                    options={[
                      { label: "Circle", value: "circle" },
                      { label: "Square", value: "square" },
                      { label: "Diamond", value: "diamond" },
                    ]}
                  />
                </>
              )}
              {selectedMode === "ascii-grid" && (
                <>
                  <label className="text-row">
                    <span className="control-name">Characters</span>
                    <input
                      className="text-input"
                      value={modeSettings.reconstruction.characterSet}
                      onChange={(event) => onModeSettingChange("reconstruction", "characterSet", event.target.value)}
                    />
                  </label>
                  <button className="ghost-btn" type="button" onClick={randomizeAsciiCharacters}>Randomize</button>
                  <SliderControl label="Character Size" value={modeSettings.reconstruction.characterSize} min={6} max={32} onChange={setRecon("characterSize")} />
                  <SliderControl label="Spacing X" value={modeSettings.reconstruction.characterSpacingX} min={4} max={30} onChange={setRecon("characterSpacingX")} />
                  <SliderControl label="Spacing Y" value={modeSettings.reconstruction.characterSpacingY} min={6} max={36} onChange={setRecon("characterSpacingY")} />
                  <SliderControl label="Text Opacity" value={Math.round(modeSettings.reconstruction.textOpacity * 100)} min={0} max={100} step={1} suffix="%" onChange={(v) => onModeSettingChange("reconstruction", "textOpacity", v / 100)} />
                </>
              )}
              {selectedMode === "scanline-reconstruction" && (
                <>
                  <SliderControl label="Line Spacing" value={modeSettings.reconstruction.lineSpacing} min={2} max={24} onChange={setRecon("lineSpacing")} />
                  <SliderControl label="Line Thickness" value={modeSettings.reconstruction.lineThickness} min={0.5} max={8} step={0.25} onChange={setRecon("lineThickness")} />
                  <SliderControl label="Line Length" value={modeSettings.reconstruction.lineLength} min={4} max={44} onChange={setRecon("lineLength")} />
                  <SliderControl label="Opacity" value={Math.round(modeSettings.reconstruction.scanlineOpacity * 100)} min={0} max={100} step={1} suffix="%" onChange={(v) => onModeSettingChange("reconstruction", "scanlineOpacity", v / 100)} />
                </>
              )}
              {selectedMode === "ordered-dither" && (
                <>
                  <SliderControl label="Dither Strength" value={modeSettings.reconstruction.ditherStrength} min={0.2} max={2.5} step={0.05} onChange={setRecon("ditherStrength")} />
                  <SliderControl label="Mark Size" value={modeSettings.reconstruction.markSize} min={2} max={18} onChange={setRecon("markSize")} />
                  <PillGroup
                    label="Mark Shape"
                    value={modeSettings.reconstruction.markShape}
                    onChange={(value) => onModeSettingChange("reconstruction", "markShape", value)}
                    options={[
                      { label: "Square", value: "square" },
                      { label: "Circle", value: "circle" },
                      { label: "Diamond", value: "diamond" },
                    ]}
                  />
                  <PillGroup
                    label="Matrix"
                    value={String(modeSettings.reconstruction.matrixSize)}
                    onChange={(value) => onModeSettingChange("reconstruction", "matrixSize", Number(value))}
                    options={[
                      { label: "2×2", value: "2" },
                      { label: "4×4", value: "4" },
                      { label: "8×8", value: "8" },
                    ]}
                  />
                  <SliderControl label="Mark Opacity" value={Math.round(modeSettings.reconstruction.dotOpacity * 100)} min={0} max={100} step={1} suffix="%" onChange={(v) => onModeSettingChange("reconstruction", "dotOpacity", v / 100)} />
                </>
              )}
              <ToggleControl label="Posterize Colors" value={modeSettings.reconstruction.posterizeColors} onChange={(value) => onModeSettingChange("reconstruction", "posterizeColors", value)} />
              {modeSettings.reconstruction.posterizeColors && (
                <SliderControl label="Color Levels" value={modeSettings.reconstruction.colorLevels} min={2} max={16} onChange={setRecon("colorLevels")} />
              )}
            </>
          )}
          <button className="ghost-btn" type="button" onClick={randomizeEffectControls}>Randomize</button>
        </Section>

        <Section title="Colors" onReset={onResetColors}>
          {!standaloneMode && (
            <>
              <ToggleControl
                label="Original Source Colour"
                value={effectColors.useOriginalColors}
                onChange={(value) => onEffectColorChange(selectedMode, "useOriginalColors", value)}
              />
              <ToggleControl
                label="Custom Colours"
                value={effectColors.customColors}
                onChange={(value) => onEffectColorChange(selectedMode, "customColors", value)}
              />
            </>
          )}
          {(standaloneMode || effectColors.customColors) && (
            <>
              <div className="color-grid">
                <ColorSwatchControl label="Foreground" value={effectColors.foregroundColor} onChange={(v) => onEffectColorChange(selectedMode, "foregroundColor", v)} />
                <ColorSwatchControl label="Background" value={effectColors.backgroundColor} onChange={(v) => onEffectColorChange(selectedMode, "backgroundColor", v)} />
              </div>
              <button className="ghost-btn" type="button" onClick={randomizeColorPreset}>Randomize</button>
            </>
          )}
        </Section>

        <Section title="Export" onReset={resetExportSettings}>
          <div className="bg-picker">
            {exportBackgroundOptions.map((option) => (
              <button key={option.value} className={`bg-opt ${backgroundChoice === option.value ? "active" : ""}`} type="button" onClick={() => onBackgroundChoiceChange(option.value)}>
                <span className={`bg-opt-thumb ${option.value === "transparent" ? "bg-thumb-transparent" : ""}`} style={{ background: option.value === "custom" ? customBackground : option.value === "transparent" ? undefined : bgColors[option.value as keyof typeof bgColors] }} />
                <span className="bg-opt-label">{option.label}</span>
              </button>
            ))}
          </div>
          <SelectControl
            label="Format"
            value={exportFormat}
            onChange={onExportFormatChange}
            options={[
              { label: "SVG", value: "svg" },
              { label: "PNG", value: "png" },
              { label: "GIF", value: "gif", disabled: !gifExportEnabled },
              { label: "MP4", value: "mp4", disabled: !mp4ExportEnabled },
            ]}
          />
          {!gifExportEnabled && <div className="export-hint">GIF export is available for Starburst, Node Graph, or video uploads.</div>}
          {exportFormat === "mp4" && !mp4ExportEnabled && <div className="export-hint">MP4 export is available for uploaded videos.</div>}
          {exportFormat === "png" && <PillGroup label="PNG Scale" value={String(globalSettings.exportScale)} onChange={(v) => onGlobalChange("exportScale", Number(v))} options={[{ label: "1x", value: "1" }, { label: "2x", value: "2" }, { label: "4x", value: "4" }]} />}
          {exportFormat === "gif" && gifExportEnabled && (
            <>
              <button className="export-settings-toggle" type="button" onClick={() => setGifSettingsOpen((open) => !open)}>
                <span>GIF export settings</span>
                <span>{gifSettingsOpen ? "−" : "+"}</span>
              </button>
              {gifSettingsOpen && (
                <div className="export-settings-panel">
                  <SliderControl label="GIF FPS" value={globalSettings.gifFps} min={4} max={30} onChange={(v) => onGlobalChange("gifFps", Math.round(v))} />
                  <SliderControl label="GIF Frames" value={Math.min(globalSettings.gifFrameCount, gifFrameMax)} min={12} max={gifFrameMax} onChange={(v) => onGlobalChange("gifFrameCount", Math.round(v))} />
                  {gifFrameMax > 180 && <div className="export-hint">Video GIF export can use up to 360 frames for smoother motion.</div>}
                  <SelectControl label="GIF Quality" value={globalSettings.gifQuality} onChange={(v) => onGlobalChange("gifQuality", v)} options={[{ label: "High", value: "high" }, { label: "Medium", value: "medium" }, { label: "Low", value: "low" }]} />
                  <ToggleControl label="Loop GIF" value={globalSettings.gifLoop} onChange={(v) => onGlobalChange("gifLoop", v)} />
                </div>
              )}
              {exportingGif && <div className="export-progress">Exporting GIF... {Math.round(gifProgress * 100)}%</div>}
            </>
          )}
          {exportFormat === "mp4" && mp4ExportEnabled && (
            <>
              <PillGroup label="MP4 Resolution" value={String(globalSettings.mp4Resolution)} onChange={(v) => onGlobalChange("mp4Resolution", Number(v) as 480 | 720 | 1080)} options={[{ label: "480p", value: "480" }, { label: "720p", value: "720" }, { label: "1080p", value: "1080" }]} />
              <PillGroup label="MP4 FPS" value={String(globalSettings.mp4Fps)} onChange={(v) => onGlobalChange("mp4Fps", Number(v) as 24 | 30 | 60)} options={[{ label: "24", value: "24" }, { label: "30", value: "30" }, { label: "60", value: "60" }]} />
              <div className="export-hint">MP4 exports the uploaded video once at its original duration. 1080p / 60 FPS is the heaviest option.</div>
              {exportingGif && <div className="export-progress">Exporting MP4... {Math.round(gifProgress * 100)}%</div>}
            </>
          )}
          <button className="download-btn" type="button" onClick={onExport} disabled={exportingGif || (exportFormat === "gif" && !gifExportEnabled) || (exportFormat === "mp4" && !mp4ExportEnabled)}>
            {exportingGif ? `Exporting ${exportFormat.toUpperCase()}...` : exportFormat === "svg" ? "Export Static SVG" : exportFormat === "png" ? "Export Static PNG" : exportFormat === "mp4" ? "Export MP4" : "Export Animated GIF"}
          </button>
        </Section>
          </>
        )}
      </div>
    </aside>
  )
}
