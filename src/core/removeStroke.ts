import type { Bitmap } from './bitmap'
import type { Point, Rect } from './geometry'

/**
 * Marks in `mask` (one byte per pixel of a `width`×`height` canvas) every pixel
 * whose centre lies within half of `size` of the segment from `from` to `to`
 * (pixel coordinates): one piece of a Remove Tool stroke. At least the pixel
 * under the point is marked. Returns the rectangle it marked, or null when the
 * segment misses the canvas.
 */
export function stampStroke(mask: Uint8Array, width: number, height: number, from: Point, to: Point, size: number): Rect | null {
  const radius = Math.max(0.5, size / 2)
  const ax = from.x + 0.5
  const ay = from.y + 0.5
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length2 = dx * dx + dy * dy
  const x0 = Math.max(0, Math.floor(Math.min(ax, ax + dx) - radius))
  const y0 = Math.max(0, Math.floor(Math.min(ay, ay + dy) - radius))
  const x1 = Math.min(width - 1, Math.ceil(Math.max(ax, ax + dx) + radius))
  const y1 = Math.min(height - 1, Math.ceil(Math.max(ay, ay + dy) + radius))
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  // A small epsilon, so a size-3 line covers whole pixels either side of its centre line.
  const limit = radius * radius + 1e-9
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const px = x + 0.5 - ax
      const py = y + 0.5 - ay
      const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / length2))
      const ex = px - t * dx
      const ey = py - t * dy
      if (ex * ex + ey * ey > limit) continue
      mask[y * width + x] = 1
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }
  if (right < 0) return null
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

/** Copies `pixels` (RGBA bytes, row-major over `rect`) into `bitmap` at `rect`. */
export function writeRegion(bitmap: Bitmap, rect: Rect, pixels: Uint8ClampedArray): void {
  for (let y = 0; y < rect.height; y += 1) {
    const from = y * rect.width * 4
    bitmap.data.set(pixels.subarray(from, from + rect.width * 4), ((rect.y + y) * bitmap.width + rect.x) * 4)
  }
}

/** Whether `a` and `b` are the same size and hold the same bytes inside `rect`. */
export function regionUnchanged(a: Bitmap, b: Bitmap, rect: Rect): boolean {
  if (a.width !== b.width || a.height !== b.height) return false
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    const start = (y * a.width + rect.x) * 4
    const end = start + rect.width * 4
    for (let i = start; i < end; i += 1) if (a.data[i] !== b.data[i]) return false
  }
  return true
}
