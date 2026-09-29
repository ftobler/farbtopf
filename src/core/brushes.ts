import type { Bitmap } from './bitmap'
import type { Rgba } from './color'
import type { Point } from './geometry'

export type BrushId =
  | 'round'
  | 'soft'
  | 'natural'
  | 'calligraphy'
  | 'highlighter'
  | 'blur'
  | 'smudge'
  | 'liquify'

export interface BrushDef {
  id: BrushId
  label: string
}

export const BRUSHES: readonly BrushDef[] = [
  { id: 'round', label: 'Circle sharp' },
  { id: 'soft', label: 'Circle blurred' },
  { id: 'natural', label: 'Natural brush' },
  { id: 'calligraphy', label: 'Calligraphy pen' },
  { id: 'highlighter', label: 'Highlighter pen' },
  { id: 'blur', label: 'Selective blurring' },
  { id: 'smudge', label: 'Smudge' },
  { id: 'liquify', label: 'Liquify' },
]

export function brushById(id: BrushId): BrushDef {
  const found = BRUSHES.find((brush) => brush.id === id)
  if (!found) throw new Error(`Unknown brush: ${id}`)
  return found
}

/** Brushes that lay down the primary/secondary colour; the rest only distort pixels. */
export function isColorBrush(id: BrushId): boolean {
  return id !== 'blur' && id !== 'smudge' && id !== 'liquify'
}

export interface StrokeOptions {
  size: number
  color: Rgba
  brush: BrushId
}

/** Alpha-composites `color` over the pixel at (`x`,`y`) with the given coverage. */
function blendPixel(bitmap: Bitmap, x: number, y: number, color: Rgba, coverage: number): void {
  if (coverage <= 0 || !bitmap.contains(x, y)) return
  const sa = Math.min(1, coverage) * (color.a / 255)
  if (sa <= 0) return
  if (sa >= 1) {
    bitmap.set(x, y, color)
    return
  }
  const under = bitmap.get(x, y)
  const ua = under.a / 255
  const outA = sa + ua * (1 - sa)
  if (outA <= 0) return
  bitmap.set(x, y, {
    r: (color.r * sa + under.r * ua * (1 - sa)) / outA,
    g: (color.g * sa + under.g * ua * (1 - sa)) / outA,
    b: (color.b * sa + under.b * ua * (1 - sa)) / outA,
    a: outA * 255,
  })
}

/** Points spaced `spacing` pixels apart along the segment, both ends included. */
function segmentPoints(from: Point, to: Point, spacing: number): Point[] {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  const steps = Math.max(1, Math.ceil(length / Math.max(0.5, spacing)))
  const points: Point[] = []
  for (let i = 0; i <= steps; i += 1) {
    points.push({ x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps })
  }
  return points
}

function paintDisc(
  bitmap: Bitmap,
  center: Point,
  radius: number,
  color: Rgba,
  falloff: 'hard' | 'soft',
): void {
  const size = Math.max(1, Math.round(radius * 2))
  if (size === 1) {
    blendPixel(bitmap, Math.round(center.x), Math.round(center.y), color, 1)
    return
  }
  const offset = Math.floor((size - 1) / 2)
  const half = (size - 1) / 2
  const threshold = size / 2 - 0.5
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      const dx = i - half
      const dy = j - half
      const distance = Math.hypot(dx, dy)
      const x = center.x - offset + i
      const y = center.y - offset + j
      if (falloff === 'hard') {
        if (size > 2 && distance > threshold) continue
        blendPixel(bitmap, x, y, color, 1)
      } else {
        const coverage = Math.max(0, 1 - distance / (threshold + 1e-6))
        if (coverage <= 0) continue
        blendPixel(bitmap, x, y, color, coverage * coverage)
      }
    }
  }
}

function paintNaturalDab(bitmap: Bitmap, center: Point, radius: number, color: Rgba): void {
  const bristles = Math.max(4, Math.round(radius * 3))
  for (let i = 0; i < bristles; i += 1) {
    const angle = Math.random() * Math.PI * 2
    const distance = Math.sqrt(Math.random()) * radius
    const x = Math.round(center.x + Math.cos(angle) * distance)
    const y = Math.round(center.y + Math.sin(angle) * distance)
    blendPixel(bitmap, x, y, color, 0.25 + Math.random() * 0.5)
  }
  blendPixel(bitmap, Math.round(center.x), Math.round(center.y), color, 0.5)
}

function paintCalligraphyDab(bitmap: Bitmap, center: Point, radius: number, color: Rgba): void {
  const angle = -Math.PI / 4
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const halfWidth = Math.max(0.75, radius)
  const halfHeight = Math.max(0.5, radius * 0.22)
  const extent = Math.ceil(halfWidth) + 1
  for (let y = Math.floor(center.y - extent); y <= Math.ceil(center.y + extent); y += 1) {
    for (let x = Math.floor(center.x - extent); x <= Math.ceil(center.x + extent); x += 1) {
      const dx = x + 0.5 - center.x
      const dy = y + 0.5 - center.y
      const localX = dx * cos + dy * sin
      const localY = -dx * sin + dy * cos
      if ((localX / halfWidth) ** 2 + (localY / halfHeight) ** 2 <= 1) {
        blendPixel(bitmap, x, y, color, 1)
      }
    }
  }
}

function paintHighlighterDab(bitmap: Bitmap, center: Point, radius: number, color: Rgba): void {
  const halfWidth = Math.max(1, radius * 1.6)
  const halfHeight = Math.max(0.6, radius * 0.45)
  const extent = Math.ceil(halfWidth) + 1
  for (let y = Math.floor(center.y - extent); y <= Math.ceil(center.y + extent); y += 1) {
    for (let x = Math.floor(center.x - extent); x <= Math.ceil(center.x + extent); x += 1) {
      const dx = (x + 0.5 - center.x) / halfWidth
      const dy = (y + 0.5 - center.y) / halfHeight
      const distance = dx * dx + dy * dy
      if (distance > 1) continue
      blendPixel(bitmap, x, y, color, (1 - distance) ** 0.6 * 0.4)
    }
  }
}

function averageColor(source: Bitmap, x: number, y: number, reach: number): Rgba {
  let r = 0
  let g = 0
  let b = 0
  let a = 0
  let count = 0
  for (let oy = -reach; oy <= reach; oy += 1) {
    for (let ox = -reach; ox <= reach; ox += 1) {
      const pixel = source.get(x + ox, y + oy)
      r += pixel.r
      g += pixel.g
      b += pixel.b
      a += pixel.a
      count += 1
    }
  }
  return { r: r / count, g: g / count, b: b / count, a: a / count }
}

function lerpColor(current: Rgba, target: Rgba, t: number): Rgba {
  return {
    r: current.r + (target.r - current.r) * t,
    g: current.g + (target.g - current.g) * t,
    b: current.b + (target.b - current.b) * t,
    a: current.a + (target.a - current.a) * t,
  }
}

function paintBlurDab(bitmap: Bitmap, source: Bitmap, center: Point, radius: number): void {
  const reach = Math.max(1, radius)
  const extent = Math.ceil(reach) + 1
  for (let y = Math.floor(center.y - extent); y <= Math.ceil(center.y + extent); y += 1) {
    for (let x = Math.floor(center.x - extent); x <= Math.ceil(center.x + extent); x += 1) {
      if (!bitmap.contains(x, y)) continue
      const distance = Math.hypot(x + 0.5 - center.x, y + 0.5 - center.y)
      if (distance > reach) continue
      const falloff = 1 - distance / reach
      const average = averageColor(source, x, y, 1)
      bitmap.set(x, y, lerpColor(bitmap.get(x, y), average, Math.min(1, falloff * 0.9)))
    }
  }
}

function paintSmudgeDab(
  bitmap: Bitmap,
  source: Bitmap,
  center: Point,
  radius: number,
  direction: Point,
): void {
  const length = Math.hypot(direction.x, direction.y)
  if (length === 0) return
  const ux = direction.x / length
  const uy = direction.y / length
  const reach = Math.max(1, radius)
  const pull = Math.max(1, reach * 0.9)
  const extent = Math.ceil(reach) + 1
  for (let y = Math.floor(center.y - extent); y <= Math.ceil(center.y + extent); y += 1) {
    for (let x = Math.floor(center.x - extent); x <= Math.ceil(center.x + extent); x += 1) {
      if (!bitmap.contains(x, y)) continue
      const distance = Math.hypot(x + 0.5 - center.x, y + 0.5 - center.y)
      if (distance > reach) continue
      const falloff = 1 - distance / reach
      const sx = Math.round(x - ux * pull * falloff)
      const sy = Math.round(y - uy * pull * falloff)
      const pulled = source.get(sx, sy)
      bitmap.set(x, y, lerpColor(bitmap.get(x, y), pulled, Math.min(1, falloff * 0.8)))
    }
  }
}

function paintLiquifyDab(
  bitmap: Bitmap,
  source: Bitmap,
  from: Point,
  to: Point,
  radius: number,
): void {
  const direction = { x: to.x - from.x, y: to.y - from.y }
  const length = Math.hypot(direction.x, direction.y)
  if (length === 0) return
  const ux = direction.x / length
  const uy = direction.y / length
  const reach = Math.max(1, radius)
  const extent = Math.ceil(reach) + 1
  for (let y = Math.floor(to.y - extent); y <= Math.ceil(to.y + extent); y += 1) {
    for (let x = Math.floor(to.x - extent); x <= Math.ceil(to.x + extent); x += 1) {
      if (!bitmap.contains(x, y)) continue
      const distance = Math.hypot(x + 0.5 - to.x, y + 0.5 - to.y)
      if (distance > reach) continue
      const falloff = (1 - distance / reach) ** 1.5
      const shift = reach * 0.6 * falloff
      const sx = Math.round(x - ux * shift)
      const sy = Math.round(y - uy * shift)
      if (source.contains(sx, sy)) bitmap.set(x, y, source.get(sx, sy))
    }
  }
}

/**
 * Paints one segment of a freehand stroke with the chosen brush. Colour brushes lay
 * down dabs along the segment; the distorting brushes sample a snapshot of the
 * bitmap so a single segment never feeds back into itself.
 */
export function paintBrushStroke(bitmap: Bitmap, from: Point, to: Point, options: StrokeOptions): void {
  const radius = Math.max(0.5, options.size / 2)
  const { color, brush } = options
  switch (brush) {
    case 'round':
      for (const point of segmentPoints(from, to, Math.max(1, radius))) {
        paintDisc(bitmap, point, radius, color, 'hard')
      }
      return
    case 'soft':
      for (const point of segmentPoints(from, to, Math.max(1, radius / 2))) {
        paintDisc(bitmap, point, radius, color, 'soft')
      }
      return
    case 'natural':
      for (const point of segmentPoints(from, to, Math.max(1, radius / 2))) {
        paintNaturalDab(bitmap, point, radius, color)
      }
      return
    case 'calligraphy':
      for (const point of segmentPoints(from, to, Math.max(1, radius / 3))) {
        paintCalligraphyDab(bitmap, point, radius, color)
      }
      return
    case 'highlighter':
      for (const point of segmentPoints(from, to, Math.max(1, radius / 2))) {
        paintHighlighterDab(bitmap, point, radius, color)
      }
      return
    case 'blur': {
      const source = bitmap.clone()
      for (const point of segmentPoints(from, to, Math.max(1, radius / 2))) {
        paintBlurDab(bitmap, source, point, radius)
      }
      return
    }
    case 'smudge': {
      const source = bitmap.clone()
      for (const point of segmentPoints(from, to, Math.max(1, radius / 2))) {
        paintSmudgeDab(bitmap, source, point, radius, { x: to.x - from.x, y: to.y - from.y })
      }
      return
    }
    case 'liquify': {
      const source = bitmap.clone()
      paintLiquifyDab(bitmap, source, from, to, radius)
      return
    }
  }
}
