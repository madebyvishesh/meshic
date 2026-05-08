export type ShapeType =
  | "circle"
  | "ring"
  | "roundedSquare"
  | "hollowRoundedSquare"
  | "diamond"
  | "squircle"
  | "line"
  | "text"

export type PatternShape = {
  id: string
  x: number
  y: number
  size: number
  width?: number
  height?: number
  x2?: number
  y2?: number
  rotation: number
  cornerRadius: number
  shapeType: ShapeType
  text?: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: string | number
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity: number
  scale?: number
}

export type UploadedAsset = {
  name: string
  href: string
  previewHref?: string
  mediaType: "image" | "video"
  isDefaultSource?: boolean
  fitMode: "contain" | "cover" | "stretch"
  width: number
  height: number
  opacity: number
  scale: number
  visible: boolean
  animated?: boolean
  mediaId?: string
  objectUrl?: string
  sample?: UploadedAssetSample
}

export type UploadedAssetSample = {
  width: number
  height: number
  data: Uint8ClampedArray
}

export type PatternModeId =
  | "lego-mosaic"
  | "masked-grid-shimmer"
  | "node-graph"
  | "starburst"
  | "flannel"
  | "halftone-dots"
  | "ascii-grid"
  | "scanline-reconstruction"
  | "ordered-dither"

export type GlobalSettings = {
  canvasWidth: number
  canvasHeight: number
  foregroundColor: string
  backgroundColor: string
  randomSeed: number
  animationEnabled: boolean
  animationDuration: number
  fps: number
  frameCount: number
  animationPhase: number
  currentFrame: number
  posterLayoutEnabled: boolean
  transparentBackground: boolean
  exportScale: number
  titleText: string
  descriptionText: string
  patternAreaX: number
  patternAreaY: number
  patternAreaWidth: number
  patternAreaHeight: number
  gifWidth: number
  gifHeight: number
  gifScale: number
  gifFps: number
  gifFrameCount: number
  gifLoop: boolean
  gifQuality: "high" | "medium" | "low"
  mp4Resolution: 480 | 720 | 1080
  mp4Fps: 24 | 30 | 60
}

export type EffectColorSettings = {
  useOriginalColors: boolean
  customColors: boolean
  foregroundColor: string
  backgroundColor: string
}

export type EffectToneSettings = {
  brightness: number
  contrast: number
  threshold: number
  gamma: number
}

export type LegoMosaicSettings = {
  shapeType: "lego-studs" | "rounded-square" | "flat-square" | "circle" | "diamond"
  gridRows: number
  cellGap: number
  tileCornerRadius: number
  exposure: number
  hueShift: number
  saturation: number
  contrast: number
  shapeRadius: number
  studRadius: number
  ringThickness: number
  lightAngle: number
  highlightStrength: number
  shadowStrength: number
  rimStrength: number
  hoverPreview: boolean
  hoverRadius: number
  randomSeed: number
}

export type MaskedGridSettings = {
  maskSourceMode: "auto" | "alpha" | "luminance" | "inverted-luminance" | "chroma-key" | "edge-contour"
  threshold: number
  invertMask: boolean
  softMask: boolean
  coverageThreshold: number
  alphaCutoff: number
  luminanceThreshold: number
  chromaKeyColor: string
  chromaTolerance: number
  edgeSensitivity: number
  foregroundIntensity: number
  foregroundSpeed: number
  foregroundSquareSize: number
  foregroundGridGap: number
  foregroundCornerRadius: number
  foregroundOpacityMin: number
  foregroundOpacityMax: number
  foregroundFlickerAmount: number
  foregroundFlickerThreshold: number
  foregroundSeed: number
  backgroundGridEnabled: boolean
  backgroundGridColor: string
  backgroundGridIntensity: number
  backgroundGridSpeed: number
  backgroundSquareSize: number
  backgroundGridGap: number
  backgroundCornerRadius: number
  backgroundOpacityMin: number
  backgroundOpacityMax: number
  backgroundFlickerAmount: number
  backgroundSeed: number
}

export type ReconstructionSettings = {
  threshold: number
  contrast: number
  exposure: number
  saturation: number
  invertColors: boolean
  useOriginalColors: boolean
  tintColor: string
  tintStrength: number
  posterizeColors: boolean
  colorLevels: number
  dotSize: number
  gridSpacing: number
  dotShape: "circle" | "square" | "diamond"
  minDotSize: number
  maxDotSize: number
  dotOpacity: number
  characterSet: string
  characterSize: number
  characterSpacingX: number
  characterSpacingY: number
  fontFamily: string
  fontWeight: string
  textOpacity: number
  lineSpacing: number
  lineThickness: number
  scanlineOpacity: number
  lineLength: number
  scanDirection: "horizontal" | "vertical"
  matrixSize: 2 | 4 | 8
  ditherStrength: number
  markSize: number
  markShape: "square" | "circle" | "diamond"
  flickerAmount: number
  randomSeed: number
}

export type NodeGraphSettings = {
  preset: "custom" | "neural-web" | "galaxy" | "constellation" | "crystal-grid" | "plasma-storm" | "circuit-board" | "solar-system" | "nebula" | "fireworks" | "snowflake" | "sunflower" | "dna-wave" | "hex-matrix" | "twin-stars" | "red-lattice" | "vortex"
  nodeCount: number
  nodeSize: number
  glowIntensity: number
  maxDistance: number
  lineThickness: number
  lineOpacity: number
  showConnections: boolean
  motionSpeed: number
  motionType: "drift" | "pulse" | "orbit" | "freeze"
  turbulence: number
  distribution: "gaussian" | "uniform" | "ring" | "double" | "grid" | "hex" | "tri" | "radial" | "star" | "cross" | "spiral" | "fibonacci" | "randomWalk" | "fractal" | "wave" | "explosion"
  clusterRadius: number
  randomSeed: number
}

export type StarburstSettings = {
  rayCount: number
  rayLenMin: number
  rayLenMax: number
  clusterBias: number
  clusterDirection: number
  secondaryNodes: boolean
  secondaryChance: number
  hubX: number
  hubY: number
  hubSize: number
  hubGlow: number
  nodeSizeMin: number
  nodeSizeMax: number
  nodeGlow: number
  lineColor: string
  lineOpacity: number
  lineWidth: number
  swayIntensity: number
  pulseSpeed: number
  animSpeed: number
  lengthBreathe: boolean
  randomSeed: number
}

export type FlannelStripe = {
  id: string
  color: string
  width: number
  opacity: number
}

export type FlannelSettings = {
  preset: "pop-clash" | "neon-grid" | "maritime-twill" | "custom"
  sett: FlannelStripe[]
  symmetric: boolean
  weaveStyle: "halftone" | "twill" | "solid" | "crosshatch"
  weaveParams: {
    dotSize: number
    dotSpacing: number
    dotCoverage: number
    lineWidth: number
    lineSpacing: number
    lineAngle: number
  }
  scale: number
  rotation: number
  backgroundColor: string
  invertColors: boolean
  canvasResolution: 800 | 1200 | 2000 | 2800
  pngScale: 1 | 2 | 3 | 4 | 5
}

export type ModeSettings = {
  legoMosaic: LegoMosaicSettings
  maskedGrid: MaskedGridSettings
  reconstruction: ReconstructionSettings
  nodeGraph: NodeGraphSettings
  starburst: StarburstSettings
  flannel: FlannelSettings
  effectColors: Record<PatternModeId, EffectColorSettings>
  effectTone: Record<PatternModeId, EffectToneSettings>
}

export type PatternGenerationContext<T> = {
  global: GlobalSettings
  settings: T
  phase: number
  frame: number
  area: PatternArea
}

export type PatternArea = {
  x: number
  y: number
  width: number
  height: number
}

export type GifExportOptions = {
  generateSvgForFrame: (frameIndex: number, phase: number) => string | Promise<string>
  width: number
  height: number
  frameCount: number
  fps: number
  scale: number
  quality: "high" | "medium" | "low"
  loop: boolean
  filename: string
  transparentBackground?: boolean
  onProgress?: (progress: number) => void
}
