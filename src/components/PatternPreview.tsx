import { forwardRef, useMemo } from "react"
import { generateMediaReconstruction } from "../generators/generateMediaReconstruction"
import { GlobalSettings, ModeSettings, PatternArea, PatternModeId, PatternShape, UploadedAsset } from "../types"
import { renderFlannelSvgMarkup } from "../utils/flannel"
import { renderStarburstSvgMarkup } from "../utils/starburst"
import MorphShape from "./MorphShape"

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function shapeToMarkup(shape: PatternShape) {
  const scale = shape.scale ?? 1
  const fill = shape.fill ? ` fill="${escapeXml(shape.fill)}"` : ` fill="none"`
  const opacity = ` opacity="${shape.opacity}"`
  if (shape.shapeType === "text") {
    return `<text x="${shape.x}" y="${shape.y}"${fill}${opacity} font-family="${escapeXml(shape.fontFamily ?? "IBM Plex Mono, monospace")}" font-size="${shape.fontSize ?? shape.size}" font-weight="${escapeXml(String(shape.fontWeight ?? 600))}" text-anchor="middle" dominant-baseline="middle">${escapeXml(shape.text ?? "")}</text>`
  }
  if (shape.shapeType === "circle") {
    return `<circle cx="${shape.x}" cy="${shape.y}" r="${shape.size / 2}"${fill}${opacity}/>`
  }
  if (shape.shapeType === "ring") {
    return `<circle cx="${shape.x}" cy="${shape.y}" r="${shape.size / 2}" fill="none" stroke="${escapeXml(shape.stroke ?? "currentColor")}" stroke-width="${shape.strokeWidth ?? 1}"${opacity}/>`
  }
  if (shape.shapeType === "line") {
    return `<line x1="${shape.x}" y1="${shape.y}" x2="${shape.x2 ?? shape.x}" y2="${shape.y2 ?? shape.y}" stroke="${escapeXml(shape.stroke ?? shape.fill ?? "currentColor")}" stroke-width="${shape.strokeWidth ?? shape.height ?? 1}" stroke-linecap="round"${opacity}/>`
  }
  const width = shape.width ?? shape.size
  const height = shape.height ?? shape.size
  const halfWidth = width / 2
  const halfHeight = height / 2
  const radius = shape.shapeType === "squircle" ? shape.size * 0.32 : Math.min(shape.cornerRadius, halfWidth, halfHeight)
  const isHollow = shape.shapeType === "hollowRoundedSquare"
  const stroke = isHollow ? ` stroke="${escapeXml(shape.stroke ?? "currentColor")}" stroke-width="${shape.strokeWidth ?? 1}"` : ""
  return `<rect x="${-halfWidth}" y="${-halfHeight}" width="${width}" height="${height}" rx="${radius}" ry="${radius}" transform="translate(${shape.x} ${shape.y}) rotate(${shape.rotation}) scale(${scale})"${isHollow ? ` fill="none"` : fill}${stroke}${opacity} vector-effect="non-scaling-stroke"/>`
}

function n(value: number) {
  return Number(value.toFixed(3))
}

function renderNodeGraphSvgMarkup(globalSettings: GlobalSettings, modeSettings: ModeSettings, phase: number, frame: number) {
  const shapes = getVisibleShapes("node-graph", globalSettings, modeSettings, null, phase, frame)
  const colors = modeSettings.effectColors["node-graph"]
  const nodeGraph = modeSettings.nodeGraph
  const nodeColor = colors.foregroundColor
  const backgroundColor = colors.backgroundColor
  const links = shapes.filter((shape) => shape.shapeType === "line")
  const glows = shapes.filter((shape) => shape.id.startsWith("node-glow"))
  const nodes = shapes.filter((shape) => shape.id.startsWith("node-") && !shape.id.startsWith("node-glow") && shape.shapeType === "circle")
  const background = globalSettings.transparentBackground
    ? ""
    : `<g id="node-graph-background" data-edit="Background layer"><rect class="background" x="0" y="0" width="${globalSettings.canvasWidth}" height="${globalSettings.canvasHeight}" fill="${escapeXml(backgroundColor)}"/></g>`
  const linkMarkup = links
    .map((shape, index) => `<line class="connection" data-index="${index}" x1="${n(shape.x)}" y1="${n(shape.y)}" x2="${n(shape.x2 ?? shape.x)}" y2="${n(shape.y2 ?? shape.y)}" opacity="${n(shape.opacity)}"/>`)
    .join("\n    ")
  const glowMarkup = glows
    .map((shape, index) => `<circle class="glow" data-index="${index}" cx="${n(shape.x)}" cy="${n(shape.y)}" r="${n(shape.size / 2)}" opacity="${n(shape.opacity)}"/>`)
    .join("\n    ")
  const nodeMarkup = nodes
    .map((shape, index) => `<circle class="node" data-index="${index}" cx="${n(shape.x)}" cy="${n(shape.y)}" r="${n(shape.size / 2)}" opacity="${n(shape.opacity)}"/>`)
    .join("\n    ")

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg id="node-graph-export" xmlns="http://www.w3.org/2000/svg" width="${globalSettings.canvasWidth}" height="${globalSettings.canvasHeight}" viewBox="0 0 ${globalSettings.canvasWidth} ${globalSettings.canvasHeight}" role="img" aria-label="Node graph pattern">
  <title>Node Graph Pattern</title>
  <desc>Editable grouped Node Graph export. Background, connection lines, glow circles, and node circles are separated into visible groups with direct SVG attributes for Figma compatibility.</desc>
  ${background}
  <g id="node-graph-connections" data-edit="All connection line elements" fill="none" stroke="${escapeXml(nodeColor)}" stroke-width="${nodeGraph.lineThickness}" stroke-linecap="round" vector-effect="non-scaling-stroke">
    ${linkMarkup}
  </g>
  <g id="node-graph-glows" data-edit="All glow circle elements" fill="${escapeXml(nodeColor)}">
    ${glowMarkup}
  </g>
  <g id="node-graph-nodes" data-edit="All visible node circle elements" fill="${escapeXml(nodeColor)}">
    ${nodeMarkup}
  </g>
</svg>`
}

export function renderPatternSvgMarkup(
  selectedMode: PatternModeId,
  globalSettings: GlobalSettings,
  modeSettings: ModeSettings,
  uploadedAsset?: UploadedAsset | null,
  phase = globalSettings.animationPhase,
  frame = globalSettings.currentFrame,
  idPrefix = "export",
) {
  if (selectedMode === "node-graph") return renderNodeGraphSvgMarkup(globalSettings, modeSettings, phase, frame)
  if (selectedMode === "starburst") return renderStarburstSvgMarkup(globalSettings, modeSettings.starburst, modeSettings.effectColors["starburst"], phase)
  if (selectedMode === "flannel") return renderFlannelSvgMarkup(globalSettings, modeSettings.flannel, modeSettings.effectColors["flannel"])

  const area = getModeArea(selectedMode, globalSettings, modeSettings)
  const shapes = getVisibleShapes(selectedMode, globalSettings, modeSettings, uploadedAsset, phase, frame)
  const clipId = `${idPrefix}-pattern-clip`
  const background = globalSettings.transparentBackground
    ? ""
    : `<rect width="100%" height="100%" fill="${escapeXml(getCanvasBackground(selectedMode, globalSettings, modeSettings))}"/>`
  const poster = globalSettings.posterLayoutEnabled
    ? `<g><text x="45" y="70" fill="${escapeXml(globalSettings.foregroundColor)}" font-family="Inter, system-ui, sans-serif" font-size="42" font-weight="650" letter-spacing="-0.01em">${escapeXml(globalSettings.titleText)}</text><text x="360" y="72" fill="${escapeXml(globalSettings.foregroundColor)}" font-family="Inter, system-ui, sans-serif" font-size="14" opacity="0.72">${globalSettings.descriptionText
        .split("\n")
        .slice(0, 4)
        .map((line, index) => `<tspan x="360" dy="${index === 0 ? 0 : 19}">${escapeXml(line)}</tspan>`)
        .join("")}</text></g>`
    : ""
  const clip = ` clip-path="url(#${clipId})"`
  const defs = `<defs><clipPath id="${clipId}"><rect x="${area.x}" y="${area.y}" width="${area.width}" height="${area.height}"/></clipPath></defs>`
  const uploaded = ""
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${globalSettings.canvasWidth}" height="${globalSettings.canvasHeight}" viewBox="0 0 ${globalSettings.canvasWidth} ${globalSettings.canvasHeight}" role="img" aria-label="Procedural pattern preview">${background}${defs}${poster}${uploaded}<g${clip}>${shapes.map(shapeToMarkup).join("")}</g></svg>`
}

export function getModeArea(mode: PatternModeId, global: GlobalSettings, modeSettings: ModeSettings): PatternArea {
  if (global.posterLayoutEnabled) {
    return {
      x: global.patternAreaX,
      y: global.patternAreaY,
      width: global.patternAreaWidth,
      height: global.patternAreaHeight,
    }
  }

  return { x: 0, y: 0, width: global.canvasWidth, height: global.canvasHeight }
}

function getCanvasBackground(mode: PatternModeId, global: GlobalSettings, modeSettings: ModeSettings) {
  const colors = modeSettings.effectColors[mode]
  return colors?.customColors ? colors.backgroundColor : global.backgroundColor
}

export function generateShapesForMode(
  mode: PatternModeId,
  global: GlobalSettings,
  modeSettings: ModeSettings,
  phase = global.animationPhase,
  frame = global.currentFrame,
  uploadedAsset?: UploadedAsset | null,
): PatternShape[] {
  const area = getModeArea(mode, global, modeSettings)
  return generateMediaReconstruction({
    mode,
    global,
    lego: modeSettings.legoMosaic,
    masked: modeSettings.maskedGrid,
    reconstruction: modeSettings.reconstruction,
    nodeGraph: modeSettings.nodeGraph,
    colors: modeSettings.effectColors[mode],
    tone: modeSettings.effectTone[mode],
    uploadedAsset,
    phase,
  })
}

function getVisibleShapes(
  selectedMode: PatternModeId,
  globalSettings: GlobalSettings,
  modeSettings: ModeSettings,
  uploadedAsset: UploadedAsset | null | undefined,
  phase: number,
  frame: number,
) {
  return generateShapesForMode(selectedMode, globalSettings, modeSettings, phase, frame, uploadedAsset)
}

type PatternPreviewProps = {
  selectedMode: PatternModeId
  globalSettings: GlobalSettings
  modeSettings: ModeSettings
  phase?: number
  frame?: number
  idPrefix?: string
  uploadedAsset?: UploadedAsset | null
}

const PatternPreview = forwardRef<SVGSVGElement, PatternPreviewProps>(function PatternPreview(
  { selectedMode, globalSettings, modeSettings, phase, frame, idPrefix = "live", uploadedAsset },
  ref,
) {
  const resolvedPhase = phase ?? globalSettings.animationPhase
  const resolvedFrame = frame ?? globalSettings.currentFrame
  const area = getModeArea(selectedMode, globalSettings, modeSettings)
  const shapes = useMemo(
    () => getVisibleShapes(selectedMode, globalSettings, modeSettings, uploadedAsset, resolvedPhase, resolvedFrame),
    [selectedMode, globalSettings, modeSettings, resolvedPhase, resolvedFrame, uploadedAsset],
  )
  const clipId = `${idPrefix}-pattern-clip`

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={globalSettings.canvasWidth}
      height={globalSettings.canvasHeight}
      viewBox={`0 0 ${globalSettings.canvasWidth} ${globalSettings.canvasHeight}`}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Procedural pattern preview"
    >
      {!globalSettings.transparentBackground && (
        <rect width="100%" height="100%" fill={getCanvasBackground(selectedMode, globalSettings, modeSettings)} />
      )}

      <defs>
        <clipPath id={clipId}>
          <rect x={area.x} y={area.y} width={area.width} height={area.height} />
        </clipPath>
      </defs>

      {globalSettings.posterLayoutEnabled && (
        <g>
          <text
            x="45"
            y="70"
            fill={globalSettings.foregroundColor}
            fontFamily="Inter, system-ui, sans-serif"
            fontSize="42"
            fontWeight="650"
            letterSpacing="-0.01em"
          >
            {globalSettings.titleText}
          </text>
          <text
            x="360"
            y="72"
            fill={globalSettings.foregroundColor}
            fontFamily="Inter, system-ui, sans-serif"
            fontSize="14"
            opacity="0.72"
          >
            {globalSettings.descriptionText.split("\n").slice(0, 4).map((line, index) => (
              <tspan key={line + index} x="360" dy={index === 0 ? 0 : 19}>
                {line}
              </tspan>
            ))}
          </text>
        </g>
      )}

      <g clipPath={`url(#${clipId})`}>
        {shapes.map((shape) => (
          <MorphShape key={shape.id} {...shape} />
        ))}
      </g>
    </svg>
  )
})

export default PatternPreview
