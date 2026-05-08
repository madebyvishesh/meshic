import { ShapeType } from "../types"

type MorphShapeProps = {
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

export default function MorphShape({
  x,
  y,
  size,
  width,
  height,
  x2,
  y2,
  rotation,
  cornerRadius,
  shapeType,
  text,
  fontSize,
  fontFamily,
  fontWeight,
  fill,
  stroke,
  strokeWidth,
  opacity,
  scale = 1,
}: MorphShapeProps) {
  const transform = `translate(${x} ${y}) rotate(${rotation}) scale(${scale})`
  const shapeWidth = width ?? size
  const shapeHeight = height ?? size
  const half = size / 2
  const halfWidth = shapeWidth / 2
  const halfHeight = shapeHeight / 2
  const rx = shapeType === "squircle" ? size * 0.32 : Math.min(cornerRadius, halfWidth, halfHeight)

  if (shapeType === "text") {
    return (
      <text
        x={x}
        y={y}
        fill={fill}
        opacity={opacity}
        fontFamily={fontFamily ?? "IBM Plex Mono, monospace"}
        fontSize={fontSize ?? size}
        fontWeight={fontWeight ?? 600}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {text}
      </text>
    )
  }

  if (shapeType === "circle") {
    return <circle cx={x} cy={y} r={half} fill={fill} opacity={opacity} />
  }

  if (shapeType === "ring") {
    return (
      <circle
        cx={x}
        cy={y}
        r={half}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
      />
    )
  }

  if (shapeType === "line") {
    return (
      <line
        x1={x}
        y1={y}
        x2={x2 ?? x}
        y2={y2 ?? y}
        stroke={stroke ?? fill}
        strokeWidth={strokeWidth ?? height ?? 1}
        opacity={opacity}
        strokeLinecap="round"
      />
    )
  }

  return (
    <rect
      x={-halfWidth}
      y={-halfHeight}
      width={shapeWidth}
      height={shapeHeight}
      rx={rx}
      ry={rx}
      transform={transform}
      fill={shapeType === "hollowRoundedSquare" ? "none" : fill}
      stroke={shapeType === "hollowRoundedSquare" ? stroke : undefined}
      strokeWidth={shapeType === "hollowRoundedSquare" ? strokeWidth : undefined}
      opacity={opacity}
      vectorEffect="non-scaling-stroke"
    />
  )
}
