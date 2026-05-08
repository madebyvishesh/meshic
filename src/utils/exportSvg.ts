function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function serializeSvg(svgElement: SVGSVGElement) {
  const clone = svgElement.cloneNode(true) as SVGSVGElement
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink")
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`
}

export function exportSvg(svgElement: SVGSVGElement, filename = "pattern.svg") {
  const markup = serializeSvg(svgElement)
  downloadBlob(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }), filename)
}

export function downloadFile(bytes: BlobPart, filename: string, type: string) {
  downloadBlob(new Blob([bytes], { type }), filename)
}
