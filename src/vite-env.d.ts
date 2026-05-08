/// <reference types="vite/client" />

declare module "gifenc" {
  type GifPalette = number[][]
  type GifEncoderInstance = {
    writeFrame: (
      index: Uint8Array,
      width: number,
      height: number,
      options: { palette: GifPalette; delay: number; repeat?: number; transparent?: boolean; transparentIndex?: number },
    ) => void
    finish: () => void
    bytesView: () => Uint8Array
  }

  export function GIFEncoder(): GifEncoderInstance
  export function quantize(
    data: Uint8ClampedArray | Uint8Array,
    colors: number,
    options?: { format?: string; oneBitAlpha?: boolean | number },
  ): GifPalette
  export function applyPalette(data: Uint8ClampedArray | Uint8Array, palette: GifPalette, format?: string): Uint8Array

  const gifenc: {
    GIFEncoder: typeof GIFEncoder
    quantize: typeof quantize
    applyPalette: typeof applyPalette
  }
  export default gifenc
}
