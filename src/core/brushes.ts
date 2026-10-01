import type { Bitmap } from './bitmap'
import type { Rgba } from './color'
import type { Point, Rect } from './geometry'
import type { Random } from './random'

export type BrushId =
  | 'round'
  | 'soft'
  | 'natural'
  | 'calligraphy'
  | 'highlighter'
  | 'spray'
  | 'pixelate'
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
  { id: 'spray', label: 'Spray can' },
  { id: 'pixelate', label: 'Pixelate' },
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
  return id !== 'blur' && id !== 'smudge' && id !== 'liquify' && id !== 'pixelate'
}

export interface StrokeOptions {
  size: number
  color: Rgba
  brush: BrushId
  /** Random source for the random brushes; Math.random by default. */
  random?: Random
  /**
   * The pixels as they were when the stroke started. Pixelate reads from it so that
   * dabs overlapping within a stroke never re-average already pixelated blocks.
   */
  source?: Bitmap
}

/**
 * One puff of the airbrush: random opaque dots inside a circle `size` pixels across.
 * By default the number of dots grows with the area, so the density looks the same at
 * any size; `dots` overrides it (the spray can sprays fewer per tick).
 */
export function sprayDab(
  bitmap: Bitmap,
  center: Point,
  size: number,
  color: Rgba,
  random: Random = Math.random,
  dots?: number,
): void {
  const r = Math.max(1, size / 2)
  const attempts = dots ?? Math.max(8, Math.round(r * r * 0.6))
  for (let i = 0; i < attempts; i += 1) {
    const angle = random() * Math.PI * 2
    const distance = Math.sqrt(random()) * r
    bitmap.set(
      Math.round(center.x + Math.cos(angle) * distance),
      Math.round(center.y + Math.sin(angle) * distance),
      color,
    )
  }
}

/** How often the spray can sprays while the pointer is held down, moving or not. */
export const SPRAY_TICK_MS = 30

/**
 * Dots the spray can sprays per tick: about 5 % of its circle, so like classic Paint the
 * paint builds up the longer it is held over one spot (≈ fully covered after a second).
 */
export function sprayCanDots(size: number): number {
  const r = Math.max(0.5, size / 2)
  return Math.max(1, Math.round(Math.PI * r * r * 0.05))
}

/**
 * Mosaic block size for the pixelate brush: a quarter of the brush size, at least 2 px,
 * so a brush always spans about four blocks across whatever its size.
 */
export function pixelateBlockSize(size: number): number {
  return Math.max(2, Math.round(size / 4))
}

/** Average of one mosaic block of `source`, weighting colour by alpha. */
function blockAverage(source: Bitmap, bx: number, by: number, block: number): Rgba {
  let r = 0
  let g = 0
  let b = 0
  let a = 0
  let count = 0
  const x1 = Math.min(source.width, bx + block)
  const y1 = Math.min(source.height, by + block)
  for (let y = by; y < y1; y += 1) {
    for (let x = bx; x < x1; x += 1) {
      const i = (y * source.width + x) * 4
      const alpha = source.data[i + 3]
      r += source.data[i] * alpha
      g += source.data[i + 1] * alpha
      b += source.data[i + 2] * alpha
      a += alpha
      count += 1
    }
  }
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 }
  return { r: r / a, g: g / a, b: b / a, a: a / count }
}

/**
 * One pixelate dab: every pixel within the round dab takes the average colour of its
 * mosaic block in `source`. Blocks sit on one image-wide grid starting at (0, 0), and
 * averages always come from `source` (the stroke-start pixels), so overlapping dabs,
 * and later strokes over untouched blocks, give the same flat blocks with no smearing.
 */
export function pixelateDab(
  bitmap: Bitmap,
  source: Bitmap,
  center: Point,
  size: number,
  cache: Map<number, Rgba> = new Map(),
): void {
  const block = pixelateBlockSize(size)
  const radius = Math.max(0.5, size / 2)
  const cx = Math.round(center.x)
  const cy = Math.round(center.y)
  const reach = Math.ceil(radius)
  const columns = Math.ceil(source.width / block)
  for (let y = Math.max(0, cy - reach); y <= Math.min(bitmap.height - 1, cy + reach); y += 1) {
    for (let x = Math.max(0, cx - reach); x <= Math.min(bitmap.width - 1, cx + reach); x += 1) {
      if (Math.hypot(x - cx, y - cy) > radius) continue
      const bx = Math.floor(x / block)
      const by = Math.floor(y / block)
      const key = by * columns + bx
      let average = cache.get(key)
      if (!average) {
        average = blockAverage(source, bx * block, by * block, block)
        cache.set(key, average)
      }
      bitmap.set(x, y, average)
    }
  }
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
  // Round the dab centre to whole pixels once: Bitmap addresses its buffer with
  // integer indices, so fractional coordinates would silently drop pixels.
  const cx = Math.round(center.x)
  const cy = Math.round(center.y)
  const size = Math.max(1, Math.round(radius * 2))
  if (size === 1) {
    blendPixel(bitmap, cx, cy, color, 1)
    return
  }
  const offset = Math.floor((size - 1) / 2)
  const half = (size - 1) / 2
  // Mirror `stamp` in raster.ts: odd sizes centre on a pixel, even sizes centre
  // between pixels and get a quarter-pixel radius nudge so they stay round and
  // grow with the size instead of collapsing to a 2x2 block.
  const threshold = size % 2 === 0 ? size / 2 - 0.25 : (size - 1) / 2
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      const dx = i - half
      const dy = j - half
      const distance = Math.hypot(dx, dy)
      const x = cx - offset + i
      const y = cy - offset + j
      if (falloff === 'hard') {
        if (size > 2 && distance > threshold) continue
        blendPixel(bitmap, x, y, color, 1)
      } else {
        // A 2px round dab is its full 2x2 square.
        const coverage = size <= 2 ? 1 : Math.max(0, 1 - distance / (threshold + 1e-6))
        if (coverage <= 0) continue
        blendPixel(bitmap, x, y, color, coverage * coverage)
      }
    }
  }
}

function paintNaturalDab(bitmap: Bitmap, center: Point, radius: number, color: Rgba): void {
  // Grows with the dab's area once that outweighs its edge, so big brushes are not threadbare.
  const bristles = Math.max(4, Math.round(radius * 3), Math.round(radius * radius * 0.5))
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

/**
 * A single-channel coverage mask covering a whole highlighter stroke. Dabs are
 * accumulated with `max` so overlapping stamps never darken each other, then the
 * colour is composited over the untouched base exactly once.
 */
export interface CoverageMask {
  width: number
  height: number
  data: Uint8Array
}

/** The flat transparency a highlighter stroke is drawn with. */
export const HIGHLIGHTER_ALPHA = 0.4

export function createCoverageMask(width: number, height: number): CoverageMask {
  const w = Math.max(1, Math.floor(width))
  const h = Math.max(1, Math.floor(height))
  return { width: w, height: h, data: new Uint8Array(w * h) }
}

function setCoverage(mask: CoverageMask, x: number, y: number, value: number): void {
  if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) return
  const index = y * mask.width + x
  if (value > mask.data[index]) mask.data[index] = value
}

/**
 * Stamps an upright capital-"I" nib into a coverage mask: a full-height vertical
 * bar with short horizontal caps at the top and bottom. The caps are the full
 * brush width; the bar is roughly a third as wide.
 */
function paintHighlighterDab(mask: CoverageMask, center: Point, radius: number): void {
  const cx = Math.round(center.x)
  const cy = Math.round(center.y)
  const size = Math.max(1, Math.round(radius * 2))
  if (size < 3) {
    const offset = Math.floor((size - 1) / 2)
    for (let j = 0; j < size; j += 1) {
      for (let i = 0; i < size; i += 1) setCoverage(mask, cx - offset + i, cy - offset + j, 255)
    }
    return
  }
  const offset = Math.floor((size - 1) / 2)
  const stemWidth = Math.max(1, Math.round(size / 3))
  const capHeight = Math.max(1, Math.round(size / 4))
  const stemStart = Math.floor((size - stemWidth) / 2)
  for (let j = 0; j < size; j += 1) {
    const cap = j < capHeight || j >= size - capHeight
    for (let i = 0; i < size; i += 1) {
      const inStem = i >= stemStart && i < stemStart + stemWidth
      if (!cap && !inStem) continue
      setCoverage(mask, cx - offset + i, cy - offset + j, 255)
    }
  }
}

/** Adds one highlighter segment to the stroke mask, overlapping dabs kept at max coverage. */
export function stampHighlighter(mask: CoverageMask, from: Point, to: Point, size: number): void {
  const radius = Math.max(0.5, size / 2)
  for (const point of segmentPoints(from, to, Math.max(1, radius / 2))) {
    paintHighlighterDab(mask, point, radius)
  }
}

/**
 * Composites the highlighter colour over `base` into `dst`, only touching `rect`
 * (clipped to the bitmaps; the whole image when omitted). `dst` is first given the
 * `base` pixels of the rect, so a region can be recomposited from scratch while
 * pixels outside it keep whatever earlier calls left there.
 */
export function compositeHighlighterInto(
  dst: Bitmap,
  base: Bitmap,
  mask: CoverageMask,
  color: Rgba,
  alpha: number,
  rect?: Rect,
): void {
  const width = Math.min(dst.width, base.width, mask.width)
  const height = Math.min(dst.height, base.height, mask.height)
  const x0 = Math.max(0, Math.floor(rect ? rect.x : 0))
  const y0 = Math.max(0, Math.floor(rect ? rect.y : 0))
  const x1 = Math.min(width, Math.ceil(rect ? rect.x + rect.width : width))
  const y1 = Math.min(height, Math.ceil(rect ? rect.y + rect.height : height))
  const strength = Math.max(0, Math.min(1, alpha))
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const index = (y * dst.width + x) * 4
      const source = (y * base.width + x) * 4
      dst.data[index] = base.data[source]
      dst.data[index + 1] = base.data[source + 1]
      dst.data[index + 2] = base.data[source + 2]
      dst.data[index + 3] = base.data[source + 3]
      if (strength <= 0) continue
      const coverage = mask.data[y * mask.width + x] / 255
      if (coverage <= 0) continue
      blendPixel(dst, x, y, color, strength * coverage)
    }
  }
}

/**
 * Composites the highlighter colour over `base` using the stroke mask. Because it
 * always starts from `base`, overlapping parts of the stroke keep one flat alpha.
 */
export function compositeHighlighter(
  base: Bitmap,
  mask: CoverageMask,
  color: Rgba,
  alpha: number,
): Bitmap {
  const result = base.clone()
  compositeHighlighterInto(result, base, mask, color, alpha)
  return result
}

function averageColor(source: Bitmap, x: number, y: number, reach: number): Rgba {
  let r = 0
  let g = 0
  let b = 0
  let a = 0
  let count = 0
  for (let oy = -reach; oy <= reach; oy += 1) {
    for (let ox = -reach; ox <= reach; ox += 1) {
      // Outside the canvas there are no real pixels; averaging transparent black
      // in would darken the edges of a blur.
      if (!source.contains(x + ox, y + oy)) continue
      const pixel = source.get(x + ox, y + oy)
      r += pixel.r
      g += pixel.g
      b += pixel.b
      a += pixel.a
      count += 1
    }
  }
  if (count === 0) return source.get(x, y)
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
      // Sampling past the canvas edge would smudge toward transparent black.
      if (!source.contains(sx, sy)) continue
      const pulled = source.get(sx, sy)
      bitmap.set(x, y, lerpColor(bitmap.get(x, y), pulled, Math.min(1, falloff * 0.8)))
    }
  }
}

/** How far a liquify drag pushes pixels relative to the distance it travelled. */
const LIQUIFY_STRENGTH = 0.6

/** Distance from a point to a line segment. */
function distanceToSegment(px: number, py: number, a: Point, b: Point): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const apx = px - a.x
  const apy = py - a.y
  const denom = abx * abx + aby * aby
  const t = denom === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / denom))
  return Math.hypot(apx - abx * t, apy - aby * t)
}

/**
 * Pushes one segment of a liquify drag. The displacement is proportional to how
 * far the pointer actually moved this segment (capped at the brush radius), so
 * the distortion tracks the cursor instead of accelerating with every event.
 * The whole capsule around the segment is affected, not just its end point, and
 * because falloff only depends on the distance to the segment, splitting one
 * drag into several segments accumulates to the same shift.
 */
function paintLiquifySegment(
  bitmap: Bitmap,
  source: Bitmap,
  from: Point,
  to: Point,
  radius: number,
): void {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return
  const ux = dx / length
  const uy = dy / length
  const reach = Math.max(1, radius)
  // Proportional to the distance moved, capped by the brush radius so a very
  // fast flick cannot fling pixels across the canvas. A slow drag accumulates
  // to the same total shift instead of accelerating with every event.
  const shift = Math.min(length * LIQUIFY_STRENGTH, reach)
  const minX = Math.floor(Math.min(from.x, to.x) - reach)
  const maxX = Math.ceil(Math.max(from.x, to.x) + reach)
  const minY = Math.floor(Math.min(from.y, to.y) - reach)
  const maxY = Math.ceil(Math.max(from.y, to.y) + reach)
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!bitmap.contains(x, y)) continue
      const distance = distanceToSegment(x + 0.5, y + 0.5, from, to)
      if (distance > reach) continue
      const falloff = (1 - distance / reach) ** 1.5
      const sx = Math.round(x - ux * shift * falloff)
      const sy = Math.round(y - uy * shift * falloff)
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
    case 'spray':
      // Classic spray can: dots only where the pointer is; the timer keeps adding more.
      sprayDab(bitmap, to, options.size, color, options.random ?? Math.random, sprayCanDots(options.size))
      return
    case 'highlighter': {
      const mask = createCoverageMask(bitmap.width, bitmap.height)
      stampHighlighter(mask, from, to, options.size)
      bitmap.data.set(compositeHighlighter(bitmap, mask, color, HIGHLIGHTER_ALPHA).data)
      return
    }
    case 'pixelate': {
      const source = options.source ?? bitmap.clone()
      const cache = new Map<number, Rgba>()
      for (const point of segmentPoints(from, to, Math.max(1, radius / 2))) {
        pixelateDab(bitmap, source, point, options.size, cache)
      }
      return
    }
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
      paintLiquifySegment(bitmap, source, from, to, radius)
      return
    }
  }
}
