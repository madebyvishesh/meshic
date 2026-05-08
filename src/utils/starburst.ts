import { EffectColorSettings, GlobalSettings, StarburstSettings } from "../types"
import { clamp, TWO_PI } from "./geometry"
import { seededRandom } from "./random"

export type StarburstRay = {
  angle: number
  baseLen: number
  tipSize: number
  swayOffset: number
  swayFreq: number
  lengthOffset: number
  lengthFreq: number
  pulseOffset: number
  mouseAngleDelta: number
  mouseLengthDelta: number
  secondaries: Array<{ t: number; size: number; pulseOffset: number }>
}

export type StarburstMouse = {
  x: number
  y: number
  active: boolean
}

function randBetween(rand: () => number, min: number, max: number) {
  return min + rand() * (max - min)
}

export function createStarburstRays(settings: StarburstSettings) {
  const rand = seededRandom(settings.randomSeed)
  const rays: StarburstRay[] = []
  const halfSpread = (1 - settings.clusterBias) * Math.PI
  const baseDirection = (settings.clusterDirection * Math.PI) / 180

  for (let index = 0; index < settings.rayCount; index += 1) {
    const secondaries: StarburstRay["secondaries"] = []
    if (settings.secondaryNodes && rand() < settings.secondaryChance) {
      const count = rand() < 0.4 ? 2 : 1
      for (let secondary = 0; secondary < count; secondary += 1) {
        secondaries.push({
          t: randBetween(rand, 0.25, 0.8),
          size: randBetween(rand, 2, 5),
          pulseOffset: randBetween(rand, 0, TWO_PI),
        })
      }
    }

    rays.push({
      angle: baseDirection + randBetween(rand, -halfSpread, halfSpread),
      baseLen: randBetween(rand, settings.rayLenMin, settings.rayLenMax),
      tipSize: randBetween(rand, settings.nodeSizeMin, settings.nodeSizeMax),
      swayOffset: randBetween(rand, 0, TWO_PI),
      swayFreq: randBetween(rand, 0.3, 0.9),
      lengthOffset: randBetween(rand, 0, TWO_PI),
      lengthFreq: randBetween(rand, 0.2, 0.6),
      pulseOffset: randBetween(rand, 0, TWO_PI),
      mouseAngleDelta: 0,
      mouseLengthDelta: 0,
      secondaries,
    })
  }

  return rays
}

export function hexToRgb(hex: string) {
  const clean = hex.replace("#", "")
  const value = parseInt(clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean, 16)
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

export function rgba(hex: string, alpha: number) {
  const color = hexToRgb(hex)
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${clamp(alpha, 0, 1)})`
}

export function rgbString(hex: string) {
  const color = hexToRgb(hex)
  return `rgb(${color.r}, ${color.g}, ${color.b})`
}

function drawNode(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  glow: number,
  color: string,
) {
  context.save()
  context.shadowBlur = glow
  context.shadowColor = color
  context.fillStyle = color
  context.beginPath()
  context.arc(x, y, size, 0, TWO_PI)
  context.fill()
  if (glow > 0) {
    context.shadowBlur = glow * 2
    context.globalAlpha = 0.4
    context.fill()
  }
  context.restore()
}

export function getStarburstHub(global: GlobalSettings, settings: StarburstSettings) {
  return {
    x: global.canvasWidth / 2 + settings.hubX,
    y: global.canvasHeight / 2 + settings.hubY,
  }
}

export function getStarburstRayState(
  ray: StarburstRay,
  settings: StarburstSettings,
  cx: number,
  cy: number,
  time: number,
  mouse?: StarburstMouse,
) {
  const baseX = cx + Math.cos(ray.angle) * ray.baseLen
  const baseY = cy + Math.sin(ray.angle) * ray.baseLen

  if (mouse?.active) {
    const distance = Math.hypot(mouse.x - baseX, mouse.y - baseY)
    const influence = Math.max(0, 1 - distance / 220)
    let angleDelta = Math.atan2(mouse.y - cy, mouse.x - cx) - ray.angle
    while (angleDelta > Math.PI) angleDelta -= TWO_PI
    while (angleDelta < -Math.PI) angleDelta += TWO_PI
    ray.mouseAngleDelta += (angleDelta * influence * 0.38 - ray.mouseAngleDelta) * 0.13
    ray.mouseLengthDelta += (influence * 55 - ray.mouseLengthDelta) * 0.13
  } else {
    ray.mouseAngleDelta *= 0.87
    ray.mouseLengthDelta *= 0.87
  }

  const sway = ((settings.swayIntensity * Math.PI) / 180) * 3
  const angle = ray.angle + Math.sin(time * ray.swayFreq * settings.animSpeed + ray.swayOffset) * sway + ray.mouseAngleDelta
  let length = ray.baseLen
  if (settings.lengthBreathe) length *= 1 + Math.sin(time * ray.lengthFreq * settings.animSpeed + ray.lengthOffset) * 0.1
  length += ray.mouseLengthDelta
  return {
    angle,
    length,
    x: cx + Math.cos(angle) * length,
    y: cy + Math.sin(angle) * length,
  }
}

export function drawStarburstFrame(
  context: CanvasRenderingContext2D,
  rays: StarburstRay[],
  global: GlobalSettings,
  settings: StarburstSettings,
  colors: EffectColorSettings,
  time: number,
  transparentBackground: boolean,
  mouse?: StarburstMouse,
  viewScale = 1,
) {
  const width = global.canvasWidth
  const height = global.canvasHeight
  const nodeColor = colors.foregroundColor
  const lineColor = settings.lineColor
  context.clearRect(0, 0, width, height)
  if (!transparentBackground) {
    context.fillStyle = colors.backgroundColor
    context.fillRect(0, 0, width, height)
  }

  context.save()
  context.translate(width / 2, height / 2)
  context.scale(viewScale, viewScale)
  context.translate(-width / 2, -height / 2)

  const { x: cx, y: cy } = getStarburstHub(global, settings)
  const hubPulse = Math.sin(time * settings.pulseSpeed * 0.8) * 0.5 + 0.5
  const hubMouseDistance = Math.hypot((mouse?.x ?? -9999) - cx, (mouse?.y ?? -9999) - cy)
  const hubMouseBoost = mouse?.active ? Math.max(0, 1 - hubMouseDistance / 180) : 0
  const hubGlow = settings.hubGlow * (0.7 + 0.3 * hubPulse) + hubMouseBoost * 20
  const hubSize = settings.hubSize * (1 + 0.08 * hubPulse + hubMouseBoost * 0.25)
  let nodeCount = 1

  rays.forEach((ray) => {
    const state = getStarburstRayState(ray, settings, cx, cy, time, mouse)
    context.save()
    context.globalAlpha = settings.lineOpacity
    context.strokeStyle = lineColor
    context.lineWidth = settings.lineWidth
    context.shadowBlur = 0
    context.beginPath()
    context.moveTo(cx, cy)
    context.lineTo(state.x, state.y)
    context.stroke()
    context.restore()

    const tipPulse = Math.sin(time * settings.pulseSpeed * 0.9 * settings.animSpeed + ray.pulseOffset) * 0.5 + 0.5
    drawNode(context, state.x, state.y, ray.tipSize * (1 + 0.12 * tipPulse), settings.nodeGlow * (0.6 + 0.4 * tipPulse), nodeColor)
    nodeCount += 1

    if (settings.secondaryNodes) {
      ray.secondaries.forEach((secondary) => {
        const pulse = Math.sin(time * settings.pulseSpeed * settings.animSpeed + secondary.pulseOffset) * 0.5 + 0.5
        drawNode(
          context,
          cx + Math.cos(state.angle) * state.length * secondary.t,
          cy + Math.sin(state.angle) * state.length * secondary.t,
          secondary.size,
          settings.nodeGlow * 0.6 * (0.5 + 0.5 * pulse),
          nodeColor,
        )
        nodeCount += 1
      })
    }
  })

  drawNode(context, cx, cy, hubSize, hubGlow, nodeColor)
  context.restore()
  return nodeCount
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function n(value: number) {
  return Number(value.toFixed(3))
}

export function renderStarburstSvgMarkup(
  global: GlobalSettings,
  settings: StarburstSettings,
  colors: EffectColorSettings,
  phase = global.animationPhase,
) {
  const rays = createStarburstRays(settings)
  const time = phase * global.animationDuration * settings.animSpeed
  const { x: cx, y: cy } = getStarburstHub(global, settings)
  const nodeColor = colors.foregroundColor
  const backgroundColor = colors.backgroundColor
  const lineColor = settings.lineColor
  let lines = ""
  let secondaryGlows = ""
  let secondaryCores = ""
  let tipGlows = ""
  let tipCores = ""

  rays.forEach((ray, index) => {
    const state = getStarburstRayState(ray, settings, cx, cy, time)
    const tipPulse = Math.sin(time * settings.pulseSpeed * 0.9 * settings.animSpeed + ray.pulseOffset) * 0.5 + 0.5
    const tipSize = ray.tipSize * (1 + 0.12 * tipPulse)
    lines += `\n    <line class="ray-line" data-index="${index}" x1="${n(cx)}" y1="${n(cy)}" x2="${n(state.x)}" y2="${n(state.y)}" opacity="${n(settings.lineOpacity)}"/>`
    tipGlows += `\n    <circle class="tip-glow" data-index="${index}" cx="${n(state.x)}" cy="${n(state.y)}" r="${n(tipSize * 2.2)}" opacity="0.35"/>`
    tipCores += `\n    <circle class="tip-core" data-index="${index}" cx="${n(state.x)}" cy="${n(state.y)}" r="${n(tipSize)}"/>`

    if (settings.secondaryNodes) {
      ray.secondaries.forEach((secondary, secondaryIndex) => {
        const x = cx + Math.cos(state.angle) * state.length * secondary.t
        const y = cy + Math.sin(state.angle) * state.length * secondary.t
        secondaryGlows += `\n    <circle class="secondary-glow" data-index="${index}-${secondaryIndex}" cx="${n(x)}" cy="${n(y)}" r="${n(secondary.size * 2)}" opacity="0.28"/>`
        secondaryCores += `\n    <circle class="secondary-core" data-index="${index}-${secondaryIndex}" cx="${n(x)}" cy="${n(y)}" r="${n(secondary.size)}" opacity="0.85"/>`
      })
    }
  })

  const hubPulse = Math.sin(time * settings.pulseSpeed * 0.8) * 0.5 + 0.5
  const hubSize = settings.hubSize * (1 + 0.08 * hubPulse)
  const background = global.transparentBackground
    ? ""
    : `<g id="starburst-background" data-edit="Background layer"><rect width="${global.canvasWidth}" height="${global.canvasHeight}" fill="${escapeXml(backgroundColor)}"/></g>`

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg id="starburst-export" xmlns="http://www.w3.org/2000/svg" width="${global.canvasWidth}" height="${global.canvasHeight}" viewBox="0 0 ${global.canvasWidth} ${global.canvasHeight}" role="img" aria-label="Starburst pattern">
  <title>Starburst Pattern</title>
  <desc>Editable grouped Starburst export. Lines, secondary nodes, tip nodes, hub glow, and hub core are separated into direct SVG groups.</desc>
  ${background}
  <g id="starburst-lines" data-edit="All ray line elements" fill="none" stroke="${escapeXml(lineColor)}" stroke-width="${settings.lineWidth}" stroke-linecap="round" vector-effect="non-scaling-stroke">${lines}
  </g>
  <g id="starburst-secondary-glows" data-edit="All secondary glow circles" fill="${escapeXml(nodeColor)}">${secondaryGlows || "\n    <!-- none -->"}
  </g>
  <g id="starburst-secondary-cores" data-edit="All secondary core circles" fill="${escapeXml(nodeColor)}">${secondaryCores || "\n    <!-- none -->"}
  </g>
  <g id="starburst-tip-glows" data-edit="All tip glow circles" fill="${escapeXml(nodeColor)}">${tipGlows}
  </g>
  <g id="starburst-tip-cores" data-edit="All tip core circles" fill="${escapeXml(nodeColor)}">${tipCores}
  </g>
  <g id="starburst-hub-glow" data-edit="Hub glow" fill="${escapeXml(nodeColor)}">
    <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(hubSize * 3.5)}" opacity="0.4"/>
  </g>
  <g id="starburst-hub-core" data-edit="Hub core" fill="${escapeXml(nodeColor)}">
    <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(hubSize)}"/>
  </g>
</svg>`
}
