import { forwardRef, useEffect, useRef, useState } from "react"
import { EffectColorSettings, FlannelSettings, GlobalSettings } from "../types"
import { drawFlannelFrame } from "../utils/flannel"

type FlannelCanvasProps = {
  globalSettings: GlobalSettings
  settings: FlannelSettings
  colors: EffectColorSettings
  transparentBackground: boolean
}

const FlannelCanvas = forwardRef<HTMLCanvasElement, FlannelCanvasProps>(function FlannelCanvas(
  { globalSettings, settings, colors, transparentBackground },
  ref,
) {
  const localRef = useRef<HTMLCanvasElement | null>(null)
  const globalRef = useRef(globalSettings)
  const [viewport, setViewport] = useState({ width: globalSettings.canvasWidth, height: globalSettings.canvasHeight })
  const renderWidth = Math.max(1, viewport.width)
  const renderHeight = Math.max(1, viewport.height)

  useEffect(() => {
    globalRef.current = globalSettings
  }, [globalSettings])

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
    const canvas = localRef.current
    if (!canvas) return undefined

    const frame = requestAnimationFrame(() => {
      const context = canvas.getContext("2d")
      if (!context) return

      if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
        canvas.width = renderWidth
        canvas.height = renderHeight
      }
      drawFlannelFrame(
        context,
        settings,
        { ...globalRef.current, canvasWidth: renderWidth, canvasHeight: renderHeight },
        colors,
        renderWidth,
        renderHeight,
        transparentBackground,
        1,
      )
    })

    return () => cancelAnimationFrame(frame)
  }, [colors, globalSettings.backgroundColor, renderHeight, renderWidth, settings, transparentBackground])

  return (
    <canvas
      ref={(node) => {
        localRef.current = node
        if (typeof ref === "function") ref(node)
        else if (ref) ref.current = node
      }}
      className="tartan-canvas flannel-canvas"
      aria-label="Flannel preview"
    />
  )
})

export default FlannelCanvas
