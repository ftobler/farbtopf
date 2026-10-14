import { Bitmap } from './bitmap'
import { blitAlpha, scale } from './raster'

/** One paint surface of the document. Every layer has the size of the document. */
export interface Layer {
  id: number
  name: string
  bitmap: Bitmap
}

/** What the layers panel shows about a layer. */
export interface LayerInfo {
  id: number
  /** Not shown; used as the accessible label of the layer's thumbnail. */
  name: string
  thumbnail: Bitmap
}

/** Largest edge of a layer thumbnail, in pixels. */
export const THUMBNAIL_SIZE = 64

/** A downscaled copy of `bitmap` whose longer edge is at most `size` pixels. */
export function thumbnail(bitmap: Bitmap, size = THUMBNAIL_SIZE): Bitmap {
  const factor = Math.min(1, size / Math.max(bitmap.width, bitmap.height))
  return scale(bitmap, Math.max(1, Math.round(bitmap.width * factor)), Math.max(1, Math.round(bitmap.height * factor)))
}

/**
 * Draws `source` over `target` in place. Same-sized bitmaps take a fast path over the raw
 * pixel data, since this runs for every pointer move while more than one layer exists.
 */
export function drawOver(target: Bitmap, source: Bitmap): void {
  if (target.width !== source.width || target.height !== source.height) {
    blitAlpha(target, source, 0, 0)
    return
  }
  const dst = target.data
  const src = source.data
  for (let i = 0; i < src.length; i += 4) {
    const sa = src[i + 3]
    if (sa === 0) continue
    if (sa === 255) {
      dst[i] = src[i]
      dst[i + 1] = src[i + 1]
      dst[i + 2] = src[i + 2]
      dst[i + 3] = 255
      continue
    }
    const s = sa / 255
    const u = (dst[i + 3] / 255) * (1 - s)
    const out = s + u
    dst[i] = (src[i] * s + dst[i] * u) / out
    dst[i + 1] = (src[i + 1] * s + dst[i + 1] * u) / out
    dst[i + 2] = (src[i + 2] * s + dst[i + 2] * u) / out
    dst[i + 3] = out * 255
  }
}

/** Flattens a stack of equally sized bitmaps, drawing index 0 (the bottom) first. */
export function compositeLayers(bitmaps: readonly Bitmap[]): Bitmap | null {
  if (bitmaps.length === 0) return null
  const result = bitmaps[0].clone()
  for (let i = 1; i < bitmaps.length; i += 1) drawOver(result, bitmaps[i])
  return result
}

/** Returns a copy of `list` with the item at `from` moved to `to` (clamped). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item)
  return next
}
