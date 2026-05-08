import { forwardRef, useEffect, useMemo, useRef, useState } from "react"
import { EffectColorSettings, GlobalSettings, NodeGraphSettings } from "../types"
import { clamp, TWO_PI } from "../utils/geometry"
import { seededRandom } from "../utils/random"

type NodePoint = {
  x: number
  y: number
  ox: number
  oy: number
  rx: number
  ry: number
  vx: number
  vy: number
  angle: number
  radius: number
  phase: number
}

type MouseState = {
  x: number
  y: number
  active: boolean
}

type NodeGraphCanvasProps = {
  globalSettings: GlobalSettings
  settings: NodeGraphSettings
  colors: EffectColorSettings
  transparentBackground: boolean
  viewScale?: number
}

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "")
  const value = parseInt(clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean, 16)
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

function cssRgba(hex: string, alpha: number) {
  const color = hexToRgb(hex)
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${clamp(alpha, 0, 1)})`
}

function gaussianRandom(rand: () => number, mean: number, std: number) {
  let u = 0
  let v = 0
  while (u === 0) u = rand()
  while (v === 0) v = rand()
  return mean + Math.sqrt(-2 * Math.log(u)) * Math.cos(TWO_PI * v) * std
}

function makeNode(rand: () => number, x: number, y: number, cx: number, cy: number, width: number, height: number): NodePoint {
  const nx = clamp(x, 2, width - 2)
  const ny = clamp(y, 2, height - 2)
  const velocityAngle = rand() * TWO_PI
  const speed = 0.3 + rand() * 0.9
  return {
    x: nx,
    y: ny,
    ox: nx,
    oy: ny,
    rx: nx,
    ry: ny,
    vx: Math.cos(velocityAngle) * speed,
    vy: Math.sin(velocityAngle) * speed,
    angle: Math.atan2(ny - cy, nx - cx),
    radius: Math.hypot(nx - cx, ny - cy),
    phase: rand() * TWO_PI,
  }
}

function distributeNodes(settings: NodeGraphSettings, width: number, height: number) {
  const rand = seededRandom(settings.randomSeed)
  const points: Array<[number, number]> = []
  const n = Math.max(12, Math.min(360, Math.round(settings.nodeCount)))
  const cx = width / 2
  const cy = height / 2
  const r = Math.min(settings.clusterRadius, Math.min(width, height) * 0.54)
  const gauss = (mean: number, std: number) => gaussianRandom(rand, mean, std)

  switch (settings.distribution) {
    case "uniform":
      for (let i = 0; i < n; i += 1) points.push([cx + (rand() * 2 - 1) * r, cy + (rand() * 2 - 1) * r])
      break
    case "ring":
      for (let i = 0; i < n; i += 1) {
        const a = rand() * TWO_PI
        const rr = r * (0.75 + rand() * 0.25)
        points.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr])
      }
      break
    case "double": {
      const offset = r * 0.45
      for (let i = 0; i < n; i += 1) {
        const side = i % 2 === 0
        points.push([gauss(cx + (side ? -offset : offset), r / 4.5), gauss(cy, r / 4)])
      }
      break
    }
    case "grid": {
      const cols = Math.max(2, Math.round(Math.sqrt(n * 1.1)))
      const rows = Math.ceil(n / cols)
      const sx = (r * 1.85) / Math.max(cols - 1, 1)
      const sy = (r * 1.85) / Math.max(rows - 1, 1)
      const ox = cx - ((cols - 1) * sx) / 2
      const oy = cy - ((rows - 1) * sy) / 2
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols && points.length < n; col += 1) {
          points.push([ox + col * sx + (rand() - 0.5) * sx * 0.12, oy + row * sy + (rand() - 0.5) * sy * 0.12])
        }
      }
      break
    }
    case "hex":
    case "tri": {
      const spacing = (r * 2) / Math.sqrt(n) * 1.45
      const hy = spacing * Math.sqrt(3) / 2
      const cols = Math.ceil((r * 2.2) / spacing) + 2
      const rows = Math.ceil((r * 2.2) / hy) + 2
      const ox = cx - ((cols - 1) * spacing) / 2
      const oy = cy - ((rows - 1) * hy) / 2
      const candidates: Array<[number, number, number]> = []
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const x = ox + col * spacing + (row % 2 === 0 ? 0 : spacing / 2)
          const y = oy + row * hy
          const d = Math.hypot(x - cx, y - cy)
          if (d <= r * 1.05) candidates.push([x, y, d])
        }
      }
      candidates.sort((a, b) => a[2] - b[2])
      candidates.slice(0, n).forEach(([x, y]) => points.push([x + (rand() - 0.5) * spacing * 0.08, y + (rand() - 0.5) * spacing * 0.08]))
      break
    }
    case "radial": {
      points.push([cx, cy])
      let placed = 1
      const rings = Math.max(3, Math.round(Math.sqrt(n / Math.PI) * 1.5))
      const step = r / rings
      for (let ri = 1; ri <= rings && placed < n; ri += 1) {
        const rr = ri * step
        const count = Math.max(4, Math.round(TWO_PI * rr / step))
        for (let k = 0; k < count && placed < n; k += 1, placed += 1) {
          const a = (k / count) * TWO_PI
          points.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr])
        }
      }
      break
    }
    case "star": {
      const arms = 6
      const perArm = Math.ceil(n / arms)
      for (let arm = 0, i = 0; arm < arms && i < n; arm += 1) {
        const base = (arm / arms) * TWO_PI
        for (let k = 0; k < perArm && i < n; k += 1, i += 1) {
          const t = (k + 1) / perArm
          const rr = t * r
          const spread = (1 - t) * 0.12 + 0.015
          const a = base + (rand() - 0.5) * spread * 2
          points.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr])
        }
      }
      break
    }
    case "spiral": {
      const turns = 4.5
      const maxT = turns * TWO_PI
      const jitter = (r / maxT) * 0.3
      for (let i = 0; i < n; i += 1) {
        const t = i / Math.max(1, n - 1)
        const theta = t * maxT
        const rr = (r / maxT) * theta
        points.push([cx + Math.cos(theta) * rr + (rand() - 0.5) * jitter, cy + Math.sin(theta) * rr + (rand() - 0.5) * jitter])
      }
      break
    }
    case "fibonacci": {
      const goldenAngle = Math.PI * (3 - Math.sqrt(5))
      for (let i = 0; i < n; i += 1) {
        const rr = Math.sqrt(i / n) * r
        const theta = i * goldenAngle
        points.push([cx + Math.cos(theta) * rr, cy + Math.sin(theta) * rr])
      }
      break
    }
    case "randomWalk": {
      let wx = cx
      let wy = cy
      const step = (r / Math.sqrt(n)) * 1.8
      for (let i = 0; i < n; i += 1) {
        points.push([wx, wy])
        const dx = cx - wx
        const dy = cy - wy
        const d = Math.hypot(dx, dy) + 0.001
        const bias = Math.min(d / r, 1) * 0.3
        wx += (dx / d) * bias * step + gauss(0, step * 0.5)
        wy += (dy / d) * bias * step + gauss(0, step * 0.5)
        const nd = Math.hypot(wx - cx, wy - cy)
        if (nd > r * 1.1) {
          wx = cx + ((wx - cx) / nd) * r
          wy = cy + ((wy - cy) / nd) * r
        }
      }
      break
    }
    case "fractal": {
      const clusters = Math.max(3, Math.round(Math.sqrt(n / 8)))
      const perCluster = Math.ceil(n / clusters)
      const clusterStd = r / clusters
      for (let c = 0; c < clusters && points.length < n; c += 1) {
        const ccx = gauss(cx, r * 0.38)
        const ccy = gauss(cy, r * 0.38)
        for (let j = 0; j < perCluster && points.length < n; j += 1) points.push([gauss(ccx, clusterStd * 0.7), gauss(ccy, clusterStd * 0.7)])
      }
      break
    }
    case "wave": {
      const bands = Math.max(3, Math.round(Math.sqrt(n / 5)))
      const spacing = (r * 1.8) / (bands + 1)
      const amp = spacing * 0.45
      const freq = TWO_PI / (r * 1.4)
      const perBand = Math.ceil(n / bands)
      for (let band = 0; band < bands && points.length < n; band += 1) {
        const yBase = cy - r * 0.9 + (band + 1) * spacing
        const phase = (band / bands) * TWO_PI
        for (let k = 0; k < perBand && points.length < n; k += 1) {
          const t = k / Math.max(1, perBand - 1)
          const x = cx - r * 0.9 + t * r * 1.8
          points.push([x, yBase + Math.sin(x * freq + phase) * amp + (rand() - 0.5) * spacing * 0.12])
        }
      }
      break
    }
    case "explosion": {
      const streams = Math.max(8, Math.round(n / 8))
      const perStream = Math.ceil(n / streams)
      for (let stream = 0; stream < streams && points.length < n; stream += 1) {
        const base = (stream / streams) * TWO_PI
        const spread = 0.08 + rand() * 0.15
        for (let k = 0; k < perStream && points.length < n; k += 1) {
          const t = Math.pow(rand(), 0.65)
          const rr = t * r
          const a = base + (rand() - 0.5) * spread * (1 + t * 2)
          points.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr])
        }
      }
      break
    }
    case "cross": {
      const mainPerArm = Math.ceil((n * 0.65) / 4)
      const diagPerArm = Math.ceil((n * 0.35) / 4)
      const armWidth = r * 0.18
      for (let arm = 0; arm < 4 && points.length < n; arm += 1) {
        const base = (arm / 4) * TWO_PI
        for (let k = 0; k < mainPerArm && points.length < n; k += 1) {
          const t = k / mainPerArm
          const rr = t * r
          const perp = (rand() - 0.5) * armWidth * (1 - t * 0.5)
          points.push([cx + Math.cos(base) * rr + Math.cos(base + Math.PI / 2) * perp, cy + Math.sin(base) * rr + Math.sin(base + Math.PI / 2) * perp])
        }
      }
      for (let arm = 0; arm < 4 && points.length < n; arm += 1) {
        const base = Math.PI / 4 + (arm / 4) * TWO_PI
        for (let k = 0; k < diagPerArm && points.length < n; k += 1) {
          const t = k / diagPerArm
          const rr = t * r * 0.7
          const perp = (rand() - 0.5) * armWidth * 0.65 * (1 - t * 0.5)
          points.push([cx + Math.cos(base) * rr + Math.cos(base + Math.PI / 2) * perp, cy + Math.sin(base) * rr + Math.sin(base + Math.PI / 2) * perp])
        }
      }
      break
    }
    case "gaussian":
    default:
      for (let i = 0; i < n; i += 1) points.push([gauss(cx, r / 2.5), gauss(cy, r / 2.5)])
      break
  }

  while (points.length < n) points.push([gauss(cx, r / 2.5), gauss(cy, r / 2.5)])
  return points.slice(0, n).map(([x, y]) => makeNode(rand, x, y, cx, cy, width, height))
}

function updateNodes(nodes: NodePoint[], settings: NodeGraphSettings, width: number, height: number, dt: number, pulseT: number) {
  if (settings.motionType === "freeze" || settings.motionSpeed <= 0) return pulseT
  const cx = width / 2
  const cy = height / 2
  const nextPulseT = pulseT + dt

  nodes.forEach((node) => {
    if (settings.motionType === "drift") {
      if (settings.turbulence > 0) {
        node.vx += (Math.random() - 0.5) * settings.turbulence * 0.6
        node.vy += (Math.random() - 0.5) * settings.turbulence * 0.6
      }
      const mag = Math.hypot(node.vx, node.vy)
      if (mag > 1.5) {
        node.vx = (node.vx / mag) * 1.5
        node.vy = (node.vy / mag) * 1.5
      }
      node.x += node.vx * settings.motionSpeed * dt * 60
      node.y += node.vy * settings.motionSpeed * dt * 60
      if (node.x < 2) {
        node.x = 2
        node.vx = Math.abs(node.vx)
      }
      if (node.x > width - 2) {
        node.x = width - 2
        node.vx = -Math.abs(node.vx)
      }
      if (node.y < 2) {
        node.y = 2
        node.vy = Math.abs(node.vy)
      }
      if (node.y > height - 2) {
        node.y = height - 2
        node.vy = -Math.abs(node.vy)
      }
      return
    }

    if (settings.motionType === "pulse") {
      const pulseFactor = 1 + Math.sin(nextPulseT * settings.motionSpeed * 1.8 + node.phase) * 0.28
      const jitterX = settings.turbulence > 0 ? (Math.random() - 0.5) * settings.turbulence * 4 : 0
      const jitterY = settings.turbulence > 0 ? (Math.random() - 0.5) * settings.turbulence * 4 : 0
      node.x = cx + (node.ox - cx) * pulseFactor + jitterX
      node.y = cy + (node.oy - cy) * pulseFactor + jitterY
      return
    }

    if (settings.motionType === "orbit") {
      node.angle += settings.motionSpeed * 0.004 * (1 + (Math.random() - 0.5) * settings.turbulence * 0.5)
      const jitterX = settings.turbulence > 0 ? (Math.random() - 0.5) * settings.turbulence * 3 : 0
      const jitterY = settings.turbulence > 0 ? (Math.random() - 0.5) * settings.turbulence * 3 : 0
      node.x = cx + Math.cos(node.angle) * node.radius + jitterX
      node.y = cy + Math.sin(node.angle) * node.radius + jitterY
    }
  })

  return nextPulseT
}

function applyMouse(nodes: NodePoint[], mouse: MouseState) {
  const radius = 140
  const strength = 80
  const ease = 0.18
  nodes.forEach((node) => {
    let targetX = node.x
    let targetY = node.y
    if (mouse.active) {
      const dx = targetX - mouse.x
      const dy = targetY - mouse.y
      const dist = Math.hypot(dx, dy)
      if (dist > 0.001 && dist < radius) {
        const force = Math.pow(1 - dist / radius, 1.6) * strength
        targetX += (dx / dist) * force
        targetY += (dy / dist) * force
      }
    }
    node.rx += (targetX - node.rx) * ease
    node.ry += (targetY - node.ry) * ease
  })
}

function drawFrame(
  context: CanvasRenderingContext2D,
  nodes: NodePoint[],
  settings: NodeGraphSettings,
  colors: EffectColorSettings,
  width: number,
  height: number,
  transparentBackground: boolean,
  viewScale = 1,
) {
  const bgColor = colors.backgroundColor
  const nodeColor = colors.foregroundColor
  context.clearRect(0, 0, width, height)
  if (!transparentBackground) {
    context.fillStyle = bgColor
    context.fillRect(0, 0, width, height)
  }

  context.save()
  context.translate(width / 2, height / 2)
  context.scale(viewScale, viewScale)
  context.translate(-width / 2, -height / 2)

  if (settings.showConnections) {
    const maxDistance = Math.max(1, settings.maxDistance)
    const maxDistanceSq = maxDistance * maxDistance
    context.lineWidth = settings.lineThickness
    context.shadowBlur = 0
    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i]
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j]
        const dx = a.rx - b.rx
        const dy = a.ry - b.ry
        const d2 = dx * dx + dy * dy
        if (d2 >= maxDistanceSq) continue
        const alpha = (1 - Math.sqrt(d2) / maxDistance) * settings.lineOpacity
        context.strokeStyle = cssRgba(nodeColor, alpha)
        context.beginPath()
        context.moveTo(a.rx, a.ry)
        context.lineTo(b.rx, b.ry)
        context.stroke()
      }
    }
  }

  context.fillStyle = nodeColor
  context.shadowColor = nodeColor
  context.shadowBlur = settings.glowIntensity
  nodes.forEach((node) => {
    context.beginPath()
    context.arc(node.rx, node.ry, settings.nodeSize, 0, TWO_PI)
    context.fill()
  })
  context.shadowBlur = 0
  context.restore()
}

const NodeGraphCanvas = forwardRef<HTMLCanvasElement, NodeGraphCanvasProps>(function NodeGraphCanvas(
  { globalSettings, settings, colors, transparentBackground, viewScale = 1 },
  ref,
) {
  const localRef = useRef<HTMLCanvasElement | null>(null)
  const nodesRef = useRef<NodePoint[]>([])
  const mouseRef = useRef<MouseState>({ x: 0, y: 0, active: false })
  const pulseRef = useRef(0)
  const lastTimeRef = useRef(0)
  const [viewport, setViewport] = useState({ width: globalSettings.canvasWidth, height: globalSettings.canvasHeight })
  const renderWidth = Math.max(1, viewport.width)
  const renderHeight = Math.max(1, viewport.height)
  const signature = useMemo(
    () => [
      renderWidth,
      renderHeight,
      settings.nodeCount,
      settings.distribution,
      settings.clusterRadius,
      settings.randomSeed,
    ].join(":"),
    [renderHeight, renderWidth, settings.clusterRadius, settings.distribution, settings.nodeCount, settings.randomSeed],
  )

  useEffect(() => {
    const canvas = localRef.current
    const target = canvas?.parentElement
    if (!target) return undefined

    const updateSize = () => {
      const rect = target.getBoundingClientRect()
      const nextWidth = Math.max(1, Math.round(rect.width))
      const nextHeight = Math.max(1, Math.round(rect.height))
      setViewport((current) => (
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight }
      ))
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    nodesRef.current = distributeNodes(settings, renderWidth, renderHeight)
    pulseRef.current = 0
    lastTimeRef.current = performance.now()
  }, [renderHeight, renderWidth, settings, signature])

  useEffect(() => {
    let raf = 0
    const canvas = localRef.current
    if (!canvas) return undefined

    const render = (now: number) => {
      const context = canvas.getContext("2d")
      if (!context) return

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const displayWidth = renderWidth
      const displayHeight = renderHeight
      const targetWidth = Math.round(displayWidth * dpr)
      const targetHeight = Math.round(displayHeight * dpr)
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth
        canvas.height = targetHeight
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0)

      const dt = Math.min(Math.max((now - lastTimeRef.current) / 1000, 0), 0.05)
      lastTimeRef.current = now
      if (globalSettings.animationEnabled) {
        pulseRef.current = updateNodes(nodesRef.current, settings, displayWidth, displayHeight, dt, pulseRef.current)
        applyMouse(nodesRef.current, mouseRef.current)
      }
      drawFrame(context, nodesRef.current, settings, colors, displayWidth, displayHeight, transparentBackground, viewScale)
      raf = requestAnimationFrame(render)
    }

    raf = requestAnimationFrame(render)
    return () => cancelAnimationFrame(raf)
  }, [colors, globalSettings.animationEnabled, renderHeight, renderWidth, settings, transparentBackground, viewScale])

  return (
    <canvas
      ref={(node) => {
        localRef.current = node
        if (typeof ref === "function") ref(node)
        else if (ref) ref.current = node
      }}
      className="node-graph-canvas"
      aria-label="Node graph preview"
      onPointerMove={(event) => {
        const canvas = event.currentTarget
        const rect = canvas.getBoundingClientRect()
        mouseRef.current = {
          x: ((event.clientX - rect.left) / rect.width) * renderWidth,
          y: ((event.clientY - rect.top) / rect.height) * renderHeight,
          active: true,
        }
      }}
      onPointerLeave={() => {
        mouseRef.current.active = false
      }}
    />
  )
})

export default NodeGraphCanvas
