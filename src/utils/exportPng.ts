import { serializeSvg } from "./exportSvg"

function imageFromSvg(svgMarkup: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Could not render SVG for PNG export."))
    }
    image.src = url
  })
}

export async function svgMarkupToCanvas(svgMarkup: string, width: number, height: number, scale: number) {
  const image = await imageFromSvg(svgMarkup)
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Canvas is unavailable.")
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = "high"
  context.setTransform(scale, 0, 0, scale, 0, 0)
  context.drawImage(image, 0, 0, width, height)
  return canvas
}

export async function exportPng(
  svgElement: SVGSVGElement,
  filename = "pattern.png",
  scale = 4,
  _backgroundColor?: string,
  _transparentBackground?: boolean,
) {
  const width = Number(svgElement.getAttribute("width"))
  const height = Number(svgElement.getAttribute("height"))
  const canvas = await svgMarkupToCanvas(serializeSvg(svgElement), width, height, scale)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("Could not export PNG."))), "image/png")
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
