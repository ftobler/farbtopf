import { Bitmap } from './bitmap'
import type { Rgba } from './color'
import { colorsEqual } from './color'
import type { Point, Rect } from './geometry'

export type BrushShape = 'square' | 'round'

/** Bresenham line, inclusive of both endpoints. */
export function linePoints(x0: number, y0: number, x1: number, y1: number): Point[] {
  let x = Math.round(x0)
  let y = Math.round(y0)
  const ex = Math.round(x1)
  const ey = Math.round(y1)
  const dx = Math.abs(ex - x)
  const sx = x < ex ? 1 : -1
  const dy = -Math.abs(ey - y)
  const sy = y < ey ? 1 : -1
  let err = dx + dy
  const points: Point[] = []
  for (;;) {
    points.push({ x, y })
    if (x === ex && y === ey) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
  return points
}

export function linePointsBetween(a: Point, b: Point): Point[] {
  return linePoints(a.x, a.y, b.x, b.y)
}

/** Paints a single brush stamp of the given size and shape. */
export function stamp(
  bitmap: Bitmap,
  cx: number,
  cy: number,
  size: number,
  color: Rgba,
  shape: BrushShape = 'round',
): void {
  const s = Math.max(1, Math.floor(size))
  if (s === 1) {
    bitmap.set(cx, cy, color)
    return
  }
  const offset = Math.floor((s - 1) / 2)
  const threshold = s / 2 - 0.5
  for (let j = 0; j < s; j += 1) {
    for (let i = 0; i < s; i += 1) {
      if (shape === 'round') {
        const dx = i - (s - 1) / 2
        const dy = j - (s - 1) / 2
        if (dx * dx + dy * dy > threshold * threshold) continue
      }
      bitmap.set(cx - offset + i, cy - offset + j, color)
    }
  }
}

export function strokePoint(
  bitmap: Bitmap,
  point: Point,
  size: number,
  color: Rgba,
  shape: BrushShape = 'round',
): void {
  stamp(bitmap, Math.round(point.x), Math.round(point.y), size, color, shape)
}

export function drawLine(
  bitmap: Bitmap,
  from: Point,
  to: Point,
  size: number,
  color: Rgba,
  shape: BrushShape = 'round',
): void {
  for (const point of linePointsBetween(from, to)) stamp(bitmap, point.x, point.y, size, color, shape)
}

export function drawPolyline(
  bitmap: Bitmap,
  points: Point[],
  size: number,
  color: Rgba,
  shape: BrushShape = 'round',
): void {
  if (points.length === 0) return
  if (points.length === 1) {
    strokePoint(bitmap, points[0], size, color, shape)
    return
  }
  for (let i = 1; i < points.length; i += 1) {
    drawLine(bitmap, points[i - 1], points[i], size, color, shape)
  }
}

function fillSpan(bitmap: Bitmap, y: number, x0: number, x1: number, color: Rgba, thickness = 1): void {
  const left = Math.min(x0, x1)
  const right = Math.max(x0, x1)
  for (let x = left; x <= right; x += 1) bitmap.set(x, y, color)
  for (let t = 1; t < thickness; t += 1) {
    for (let x = left; x <= right; x += 1) bitmap.set(x, y + t, color)
  }
}

export function drawRect(
  bitmap: Bitmap,
  rect: Rect,
  size: number,
  color: Rgba,
  filled: boolean,
): void {
  const { x, y, width, height } = rect
  if (width <= 0 || height <= 0) return
  if (filled) {
    for (let py = y; py < y + height; py += 1) {
      for (let px = x; px < x + width; px += 1) bitmap.set(px, py, color)
    }
    return
  }
  const t = Math.max(1, Math.round(size))
  const x1 = x + width - 1
  const y1 = y + height - 1
  for (let k = 0; k < t; k += 1) {
    for (let px = x; px <= x1; px += 1) {
      bitmap.set(px, y + k, color)
      bitmap.set(px, y1 - k, color)
    }
    for (let py = y; py <= y1; py += 1) {
      bitmap.set(x + k, py, color)
      bitmap.set(x1 - k, py, color)
    }
  }
}

export interface EllipseSpan {
  y: number
  x0: number
  x1: number
}

/** Horizontal runs of an ellipse inscribed in `rect`, one entry per covered row. */
export function ellipseSpans(rect: Rect): EllipseSpan[] {
  const { x, y, width, height } = rect
  if (width <= 0 || height <= 0) return []
  if (width === 1 || height === 1) {
    const spans: EllipseSpan[] = []
    for (let i = 0; i < height; i += 1) spans.push({ y: y + i, x0: x, x1: x + width - 1 })
    return spans
  }
  const cx = x + (width - 1) / 2
  const cy = y + (height - 1) / 2
  const rx = (width - 1) / 2
  const ry = (height - 1) / 2
  const spans: EllipseSpan[] = []
  for (let i = 0; i < height; i += 1) {
    const py = y + i
    const ny = (py - cy) / ry
    const inside = 1 - ny * ny
    if (inside < 0) continue
    const dx = rx * Math.sqrt(inside)
    const x0 = Math.max(x, Math.round(cx - dx))
    const x1 = Math.min(x + width - 1, Math.round(cx + dx))
    spans.push({ y: py, x0, x1 })
  }
  return spans
}

export function drawEllipse(
  bitmap: Bitmap,
  rect: Rect,
  size: number,
  color: Rgba,
  filled: boolean,
): void {
  const spans = ellipseSpans(rect)
  if (spans.length === 0) return
  const t = Math.max(1, Math.round(size))
  if (filled) {
    for (const span of spans) fillSpan(bitmap, span.y, span.x0, span.x1, color)
    return
  }
  for (let i = 0; i < spans.length; i += 1) {
    const span = spans[i]
    for (let k = 0; k < t; k += 1) {
      bitmap.set(span.x0 + k, span.y, color)
      bitmap.set(span.x1 - k, span.y, color)
    }
    if (i > 0) {
      const prev = spans[i - 1]
      // Bridge steep edges so the outline stays connected on tall ellipses.
      for (let px = Math.min(prev.x0, span.x0); px <= Math.max(prev.x0, span.x0); px += 1) {
        bitmap.set(px, span.y, color)
      }
      for (let px = Math.min(prev.x1, span.x1); px <= Math.max(prev.x1, span.x1); px += 1) {
        bitmap.set(px, span.y, color)
      }
    }
  }
}

/** 4-way flood fill starting at `start`. Returns the number of pixels changed. */
export function floodFill(
  bitmap: Bitmap,
  start: Point,
  color: Rgba,
  tolerance = 0,
): number {
  const sx = Math.floor(start.x)
  const sy = Math.floor(start.y)
  if (!bitmap.contains(sx, sy)) return 0
  const target = bitmap.get(sx, sy)
  if (colorsEqual(target, color, tolerance)) return 0

  const { width, height } = bitmap
  const stack: number[] = [sy * width + sx]
  let changed = 0
  while (stack.length > 0) {
    const index = stack.pop() as number
    const px = index % width
    const py = (index - px) / width
    if (!colorsEqual(bitmap.get(px, py), target, tolerance)) continue
    bitmap.set(px, py, color)
    changed += 1
    if (px > 0) stack.push(index - 1)
    if (px < width - 1) stack.push(index + 1)
    if (py > 0) stack.push(index - width)
    if (py < height - 1) stack.push(index + width)
  }
  return changed
}

/** Draws `source` at (`dx`,`dy`), replacing destination pixels. */
export function blit(dst: Bitmap, source: Bitmap, dx: number, dy: number): void {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      dst.set(dx + x, dy + y, source.get(x, y))
    }
  }
}

/** Alpha-composites `source` over `dst` at (`dx`,`dy`). */
export function blitAlpha(dst: Bitmap, source: Bitmap, dx: number, dy: number): void {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const src = source.get(x, y)
      const sx = dx + x
      const sy = dy + y
      if (!dst.contains(sx, sy)) continue
      const sa = src.a / 255
      if (sa === 0) continue
      if (sa === 1) {
        dst.set(sx, sy, src)
        continue
      }
      const under = dst.get(sx, sy)
      const ua = under.a / 255
      const outA = sa + ua * (1 - sa)
      dst.set(sx, sy, {
        r: (src.r * sa + under.r * ua * (1 - sa)) / outA,
        g: (src.g * sa + under.g * ua * (1 - sa)) / outA,
        b: (src.b * sa + under.b * ua * (1 - sa)) / outA,
        a: outA * 255,
      })
    }
  }
}

/** Extracts a sub-region of a bitmap. Out-of-bounds reads become transparent. */
export function crop(source: Bitmap, rect: Rect): Bitmap {
  const result = new Bitmap(Math.max(1, rect.width), Math.max(1, rect.height))
  for (let y = 0; y < result.height; y += 1) {
    for (let x = 0; x < result.width; x += 1) {
      result.set(x, y, source.get(rect.x + x, rect.y + y))
    }
  }
  return result
}

/** Extracts a sub-region, turning pixels equal to `key` (when given) transparent. */
export function extractRegion(source: Bitmap, rect: Rect, key: Rgba | null = null): Bitmap {
  const result = new Bitmap(Math.max(1, rect.width), Math.max(1, rect.height))
  for (let y = 0; y < result.height; y += 1) {
    for (let x = 0; x < result.width; x += 1) {
      const pixel = source.get(rect.x + x, rect.y + y)
      if (key && colorsEqual(pixel, key)) {
        result.set(x, y, { r: 0, g: 0, b: 0, a: 0 })
      } else {
        result.set(x, y, pixel)
      }
    }
  }
  return result
}

/** Scales a bitmap with nearest-neighbour sampling (keeps the pixel-art look). */
export function scale(source: Bitmap, width: number, height: number): Bitmap {
  const w = Math.max(1, Math.floor(width))
  const h = Math.max(1, Math.floor(height))
  const result = new Bitmap(w, h)
  for (let y = 0; y < h; y += 1) {
    const sy = Math.min(source.height - 1, Math.floor((y * source.height) / h))
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(source.width - 1, Math.floor((x * source.width) / w))
      result.set(x, y, source.get(sx, sy))
    }
  }
  return result
}

/** Mirrors a bitmap left-to-right, keeping the same dimensions. */
export function flipHorizontal(source: Bitmap): Bitmap {
  const result = new Bitmap(source.width, source.height)
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      result.set(x, y, source.get(source.width - 1 - x, y))
    }
  }
  return result
}

/** Mirrors a bitmap top-to-bottom, keeping the same dimensions. */
export function flipVertical(source: Bitmap): Bitmap {
  const result = new Bitmap(source.width, source.height)
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      result.set(x, y, source.get(x, source.height - 1 - y))
    }
  }
  return result
}

/** Rotates a bitmap 90 degrees clockwise, swapping its dimensions. */
export function rotate90(source: Bitmap): Bitmap {
  const result = new Bitmap(source.height, source.width)
  for (let y = 0; y < result.height; y += 1) {
    for (let x = 0; x < result.width; x += 1) {
      result.set(x, y, source.get(y, source.height - 1 - x))
    }
  }
  return result
}

/** Rotates a bitmap 180 degrees, keeping the same dimensions. */
export function rotate180(source: Bitmap): Bitmap {
  const result = new Bitmap(source.width, source.height)
  for (let y = 0; y < result.height; y += 1) {
    for (let x = 0; x < result.width; x += 1) {
      result.set(x, y, source.get(source.width - 1 - x, source.height - 1 - y))
    }
  }
  return result
}

/** Rotates a bitmap 90 degrees counter-clockwise, swapping its dimensions. */
export function rotate270(source: Bitmap): Bitmap {
  const result = new Bitmap(source.height, source.width)
  for (let y = 0; y < result.height; y += 1) {
    for (let x = 0; x < result.width; x += 1) {
      result.set(x, y, source.get(source.width - 1 - y, x))
    }
  }
  return result
}
