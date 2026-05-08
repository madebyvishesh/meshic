import { forwardRef, useEffect, useMemo, useRef, useState } from "react"
import { EffectColorSettings, GlobalSettings, StarburstSettings } from "../types"
import { createStarburstRays, drawStarburstFrame, StarburstMouse, StarburstRay } from "../utils/starburst"

type StarburstCanvasProps = {
  globalSettings: GlobalSettings
  settings: StarburstSettings
  colors: EffectColorSettings
  transparentBackground: boolean
  viewScale?: number
}

const StarburstCanvas = forwardRef<HTMLCanvasElement, StarburstCanvasProps>(function StarburstCanvas(
  { globalSettings, settings, colors, transparentBackground, viewScale = 1 },
  ref,
) {
  const localRef = useRef<HTMLCanvasElement | null>(null)
  const raysRef = useRef<StarburstRay[]>([])
  const mouseRef = useRef<StarburstMouse>({ x: -9999, y: -9999, active: false })
  const timeRef = useRef(0)
  const lastTimeRef = useRef(0)
  const [viewport, setViewport] = useState({ width: globalSettings.canvasWidth, height: globalSettings.canvasHeight })
  const renderWidth = Math.max(1, viewport.width)
  const renderHeight = Math.max(1, viewport.height)
  const signature = useMemo(
    () => [
      settings.rayCount,
      settings.rayLenMin,
      settings.rayLenMax,
      settings.clusterBias,
      settings.clusterDirection,
      settings.secondaryNodes,
      settings.secondaryChance,
      settings.nodeSizeMin,
      settings.nodeSizeMax,
      settings.randomSeed,
    ].join(":"),
    [
      settings.clusterBias,
      settings.clusterDirection,
      settings.nodeSizeMax,
      settings.nodeSizeMin,
      settings.rayCount,
      settings.rayLenMax,
      settings.rayLenMin,
      settings.randomSeed,
      settings.secondaryChance,
      settings.secondaryNodes,
    ],
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
    raysRef.current = createStarburstRays(settings)
    timeRef.current = 0
    lastTimeRef.current = performance.now()
  }, [settings, signature])

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

      const dt = Math.min(Math.max((now - lastTimeRef.current) / 1000, 0), 0.1)
      lastTimeRef.current = now
      if (globalSettings.animationEnabled) timeRef.current += dt * settings.animSpeed
      drawStarburstFrame(
        context,
        raysRef.current,
        { ...globalSettings, canvasWidth: displayWidth, canvasHeight: displayHeight },
        settings,
        colors,
        timeRef.current,
        transparentBackground,
        mouseRef.current,
        viewScale,
      )
      raf = requestAnimationFrame(render)
    }

    raf = requestAnimationFrame(render)
    return () => cancelAnimationFrame(raf)
  }, [colors, globalSettings, renderHeight, renderWidth, settings, transparentBackground, viewScale])

  return (
    <canvas
      ref={(node) => {
        localRef.current = node
        if (typeof ref === "function") ref(node)
        else if (ref) ref.current = node
      }}
      className="node-graph-canvas starburst-canvas"
      aria-label="Starburst preview"
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

export default StarburstCanvas
