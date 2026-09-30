import { Bitmap } from './bitmap'
import type { Rgba } from './color'
import type { Point, Rect } from './geometry'

/**
 * Which pixels inside a selection's bounding rect are selected. A selection
 * without a mask is the full rectangle.
 */
export interface SelectionMask {
  width: number
  height: number
  data: Uint8Array
}

export type SelectionShape = 'rectangle' | 'freeform'

export interface Selection {
  rect: Rect
  mask: SelectionMask | null
}

function pointInPolygon(x: number, y: number, points: readonly Point[]): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i]
    const b = points[j]
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/**
 * Shrinks a canvas-sized selection flag array to its tight bounds. Returns null
 * when nothing is selected and drops the mask when the bounds are fully selected.
 */
function tighten(flags: Uint8Array, width: number, height: number): Selection | null {
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!flags[y * width + x]) continue
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }
  if (right < 0) return null
  const rect = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
  const data = new Uint8Array(rect.width * rect.height)
  let full = true
  for (let y = 0; y < rect.height; y += 1) {
    for (let x = 0; x < rect.width; x += 1) {
      const value = flags[(rect.y + y) * width + rect.x + x]
      data[y * rect.width + x] = value
      if (!value) full = false
    }
  }
  return { rect, mask: full ? null : { width: rect.width, height: rect.height, data } }
}

/** Rasterises a free-form outline (pixel centres inside the polygon) on a canvas. */
export function polygonSelection(points: readonly Point[], width: number, height: number): Selection | null {
  if (points.length < 3) return null
  const flags = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pointInPolygon(x + 0.5, y + 0.5, points)) flags[y * width + x] = 1
    }
  }
  return tighten(flags, width, height)
}

/** Whether canvas pixel (`x`,`y`) is part of the selection. */
export function isSelected(rect: Rect, mask: SelectionMask | null, x: number, y: number): boolean {
  const lx = x - rect.x
  const ly = y - rect.y
  if (lx < 0 || ly < 0 || lx >= rect.width || ly >= rect.height) return false
  if (!mask) return true
  const mx = Math.min(mask.width - 1, Math.floor((lx * mask.width) / rect.width))
  const my = Math.min(mask.height - 1, Math.floor((ly * mask.height) / rect.height))
  return mask.data[my * mask.width + mx] === 1
}

/** Selects every canvas pixel that is not currently selected. */
export function invertSelection(
  rect: Rect | null,
  mask: SelectionMask | null,
  width: number,
  height: number,
): Selection | null {
  const flags = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      flags[y * width + x] = rect && isSelected(rect, mask, x, y) ? 0 : 1
    }
  }
  return tighten(flags, width, height)
}

/** Returns a copy of `bitmap` with the unselected pixels made transparent. */
export function applyMask(bitmap: Bitmap, mask: SelectionMask): Bitmap {
  const result = bitmap.clone()
  const rect = { x: 0, y: 0, width: bitmap.width, height: bitmap.height }
  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) {
      if (!isSelected(rect, mask, x, y)) result.set(x, y, { r: 0, g: 0, b: 0, a: 0 })
    }
  }
  return result
}

/** Paints every selected pixel of `bitmap` with `color`. */
export function fillSelection(bitmap: Bitmap, rect: Rect, mask: SelectionMask | null, color: Rgba): void {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      if (isSelected(rect, mask, x, y)) bitmap.set(x, y, color)
    }
  }
}

/** Inverts the red, green and blue channels of every selected pixel of `bitmap`, keeping alpha. */
export function invertSelectedColors(bitmap: Bitmap, rect: Rect, mask: SelectionMask | null): void {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      if (!bitmap.contains(x, y) || !isSelected(rect, mask, x, y)) continue
      const pixel = bitmap.get(x, y)
      bitmap.set(x, y, { r: 255 - pixel.r, g: 255 - pixel.g, b: 255 - pixel.b, a: pixel.a })
    }
  }
}
