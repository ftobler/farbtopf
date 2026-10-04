import { Bitmap } from './bitmap'
import type { Rgba } from './color'
import { clampByte, colorsEqual } from './color'
import type { Point, Rect } from './geometry'

export type BrushShape = 'square' | 'round'

/** Bresenham line, inclusive of both endpoints. */
export function linePoints(x0: number, y0: number, x1: number, y1: number): Point[] {
  if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) {
    return []
  }
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
  // Radius in pixel-centre space. Odd sizes centre on a pixel and use (s-1)/2,
  // which keeps the size-3 brush a plus rather than a full square. Even sizes
  // centre between pixels, so nudge the radius by a quarter pixel; otherwise
  // every even size above two collapses back to a 2x2 block and the brush
  // shrinks when the size is increased.
  const threshold = s % 2 === 0 ? s / 2 - 0.25 : (s - 1) / 2
  for (let j = 0; j < s; j += 1) {
    for (let i = 0; i < s; i += 1) {
      // A 2px round brush is its full 2×2 square.
      if (shape === 'round' && s > 2) {
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

/**
 * For each row of a stamp, the first and last column it covers (relative to the stamp's
 * top-left corner). Mirrors `stamp` exactly; every row of a stamp is non-empty.
 */
function stampRows(size: number, shape: BrushShape): { left: Int32Array; right: Int32Array } {
  const s = Math.max(1, Math.floor(size))
  const left = new Int32Array(s)
  const right = new Int32Array(s)
  const threshold = s % 2 === 0 ? s / 2 - 0.25 : (s - 1) / 2
  for (let j = 0; j < s; j += 1) {
    if (shape !== 'round' || s <= 2) {
      left[j] = 0
      right[j] = s - 1
      continue
    }
    let first = s
    let last = -1
    for (let i = 0; i < s; i += 1) {
      const dx = i - (s - 1) / 2
      const dy = j - (s - 1) / 2
      if (dx * dx + dy * dy > threshold * threshold) continue
      if (first === s) first = i
      last = i
    }
    left[j] = first
    right[j] = last
  }
  return { left, right }
}

/**
 * Paints the same pixels as stamping at every point of every segment, but row span by
 * row span, so a 500 px stroke costs about its area rather than area × length.
 *
 * Along one Bresenham segment consecutive stamps move at most one pixel and every stamp
 * row is non-empty, so on each image row the stamps of a segment cover one unbroken run.
 */
function strokeSegments(
  bitmap: Bitmap,
  vertices: readonly Point[],
  size: number,
  color: Rgba,
  shape: BrushShape,
): void {
  const s = Math.max(1, Math.floor(size))
  const offset = Math.floor((s - 1) / 2)
  const { left, right } = stampRows(s, shape)
  const runs: number[][] = []
  for (let v = 0; v < vertices.length - 1; v += 1) {
    const points = linePointsBetween(vertices[v], vertices[v + 1])
    let minY = Infinity
    let maxY = -Infinity
    for (const p of points) {
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }
    const top = Math.max(0, minY - offset)
    const bottom = Math.min(bitmap.height - 1, maxY - offset + s - 1)
    if (top > bottom) continue
    const lo = new Float64Array(bottom - top + 1).fill(Infinity)
    const hi = new Float64Array(bottom - top + 1).fill(-Infinity)
    for (const p of points) {
      const from = Math.max(0, top - (p.y - offset))
      const to = Math.min(s - 1, bottom - (p.y - offset))
      const x0 = p.x - offset
      for (let j = from; j <= to; j += 1) {
        const row = p.y - offset + j - top
        const a = x0 + left[j]
        const b = x0 + right[j]
        if (a < lo[row]) lo[row] = a
        if (b > hi[row]) hi[row] = b
      }
    }
    for (let row = 0; row < lo.length; row += 1) {
      if (lo[row] > hi[row]) continue
      const y = top + row
      ;(runs[y] ??= []).push(lo[row], hi[row])
    }
  }
  for (let y = 0; y < runs.length; y += 1) {
    const row = runs[y]
    if (!row) continue
    // Merge the runs of all segments so each pixel is written once.
    const pairs: [number, number][] = []
    for (let i = 0; i < row.length; i += 2) pairs.push([row[i], row[i + 1]])
    pairs.sort((a, b) => a[0] - b[0])
    let [start, end] = pairs[0]
    const flush = () => {
      for (let x = Math.max(0, start); x <= Math.min(bitmap.width - 1, end); x += 1) bitmap.set(x, y, color)
    }
    for (let i = 1; i < pairs.length; i += 1) {
      if (pairs[i][0] <= end + 1) {
        end = Math.max(end, pairs[i][1])
        continue
      }
      flush()
      ;[start, end] = pairs[i]
    }
    flush()
  }
}

export function drawLine(
  bitmap: Bitmap,
  from: Point,
  to: Point,
  size: number,
  color: Rgba,
  shape: BrushShape = 'round',
): void {
  strokeSegments(bitmap, [from, to], size, color, shape)
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
  strokeSegments(bitmap, points, size, color, shape)
}

function cubicBezierAt(t: number, control: readonly [Point, Point, Point, Point]): Point {
  const [p0, c1, c2, p3] = control
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p3.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p3.y,
  }
}

/** Total length of the control polygon p0→c1→c2→p3. */
function controlLength(control: readonly [Point, Point, Point, Point]): number {
  let total = 0
  for (let i = 0; i < control.length - 1; i += 1) {
    total += Math.hypot(control[i + 1].x - control[i].x, control[i + 1].y - control[i].y)
  }
  return total
}

/**
 * Flattens a cubic bezier into `steps + 1` points sampled from t = 0 to t = 1 inclusive.
 * Without an explicit step count one is derived from the control-polygon length, clamped
 * to 8..256 so short curves stay cheap and long ones stay smooth.
 */
export function bezierPoints(control: readonly [Point, Point, Point, Point], steps?: number): Point[] {
  const defaultSteps = Math.min(256, Math.max(8, Math.round(controlLength(control))))
  const count = Math.max(1, Math.floor(steps ?? defaultSteps))
  const points: Point[] = []
  for (let i = 0; i <= count; i += 1) points.push(cubicBezierAt(i / count, control))
  return points
}

/** Strokes the cubic bezier through the four control points with round caps and joins. */
export function drawBezier(
  bitmap: Bitmap,
  control: readonly [Point, Point, Point, Point],
  width: number,
  color: Rgba,
): void {
  drawPolyline(bitmap, bezierPoints(control), width, color, 'round')
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
  // Pixel (px, py) covers the continuous square [px, px+1) × [py, py+1) and is
  // filled when its centre falls inside the ellipse. Using a continuous centre
  // keeps the shape symmetric for even and odd sizes alike.
  const cx = x + width / 2
  const cy = y + height / 2
  const rx = width / 2
  const ry = height / 2
  const spans: EllipseSpan[] = []
  for (let i = 0; i < height; i += 1) {
    const py = y + i
    const ny = (py + 0.5 - cy) / ry
    const inside = 1 - ny * ny
    if (inside < 0) continue
    const dx = rx * Math.sqrt(inside)
    const x0 = Math.max(x, Math.ceil(cx - dx - 0.5))
    const x1 = Math.min(x + width - 1, Math.floor(cx + dx - 0.5))
    if (x0 > x1) continue
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
  const { x, y, width, height } = rect
  const spans = ellipseSpans(rect)
  if (spans.length === 0) return
  const t = Math.max(1, Math.round(size))
  if (filled) {
    for (const span of spans) fillSpan(bitmap, span.y, span.x0, span.x1, color)
    return
  }
  // Draw the ring as the filled ellipse minus a version inset by the stroke
  // width. This follows the curve at every row (including the caps) and, unlike
  // thickening each row's edges, can never spill outside the dragged box.
  const innerRect: Rect = {
    x: x + t,
    y: y + t,
    width: width - 2 * t,
    height: height - 2 * t,
  }
  const inner = innerRect.width > 0 && innerRect.height > 0 ? ellipseSpans(innerRect) : []
  const innerByY = new Map<number, EllipseSpan>()
  for (const span of inner) innerByY.set(span.y, span)
  for (const span of spans) {
    const hole = innerByY.get(span.y)
    for (let px = span.x0; px <= span.x1; px += 1) {
      if (hole && px >= hole.x0 && px <= hole.x1) continue
      bitmap.set(px, span.y, color)
    }
  }
}

/**
 * Scanline fill of a polygon using the even-odd rule. Coordinates are continuous:
 * pixel (x, y) covers [x, x + 1) and is filled when its centre lies inside.
 */
export function fillPolygon(bitmap: Bitmap, points: readonly Point[], color: Rgba): void {
  if (points.length < 3) return
  let minY = Infinity
  let maxY = -Infinity
  for (const p of points) {
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  const top = Math.max(0, Math.floor(minY))
  const bottom = Math.min(bitmap.height - 1, Math.ceil(maxY))
  const crossings: number[] = []
  for (let py = top; py <= bottom; py += 1) {
    const sy = py + 0.5
    crossings.length = 0
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i]
      const b = points[(i + 1) % points.length]
      if (a.y <= sy === b.y <= sy) continue
      crossings.push(a.x + ((sy - a.y) * (b.x - a.x)) / (b.y - a.y))
    }
    crossings.sort((a, b) => a - b)
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const left = Math.max(0, Math.ceil(crossings[i] - 0.5))
      const right = Math.min(bitmap.width - 1, Math.ceil(crossings[i + 1] - 0.5) - 1)
      for (let px = left; px <= right; px += 1) bitmap.set(px, py, color)
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
  const { width, height, data } = bitmap
  const target = bitmap.get(sx, sy)
  if (colorsEqual(target, color, 0)) return 0

  const startIndex = (sy * width + sx) * 4
  const targetR = data[startIndex]
  const targetG = data[startIndex + 1]
  const targetB = data[startIndex + 2]
  const targetA = data[startIndex + 3]
  const fillR = clampByte(color.r)
  const fillG = clampByte(color.g)
  const fillB = clampByte(color.b)
  const fillA = clampByte(color.a)

  // Filling can leave a pixel still within `tolerance` of the target (when the
  // fill colour is close to the start colour), so track visited pixels to fill
  // each one at most once and keep the span scan from revisiting them forever.
  const visited = new Uint8Array(width * height)

  const matches = (index: number): boolean => {
    if (visited[index]) return false
    const i = index * 4
    return (
      Math.abs(data[i] - targetR) <= tolerance &&
      Math.abs(data[i + 1] - targetG) <= tolerance &&
      Math.abs(data[i + 2] - targetB) <= tolerance &&
      Math.abs(data[i + 3] - targetA) <= tolerance
    )
  }

  let stack = new Int32Array(1024)
  let top = 0
  const push = (index: number): void => {
    if (top === stack.length) {
      const grown = new Int32Array(stack.length * 2)
      grown.set(stack)
      stack = grown
    }
    stack[top] = index
    top += 1
  }

  const scanRow = (rowY: number, fromX: number, toX: number): void => {
    if (rowY < 0 || rowY >= height) return
    const row = rowY * width
    let x = fromX
    while (x <= toX) {
      while (x <= toX && !matches(row + x)) x += 1
      if (x > toX) return
      push(row + x)
      while (x <= toX && matches(row + x)) x += 1
    }
  }

  push(sy * width + sx)
  let changed = 0
  while (top > 0) {
    top -= 1
    const seed = stack[top]
    const y = Math.floor(seed / width)
    const seedX = seed - y * width
    if (!matches(seed)) continue
    let left = seedX
    while (left > 0 && matches(y * width + left - 1)) left -= 1
    let right = seedX
    while (right < width - 1 && matches(y * width + right + 1)) right += 1
    for (let x = left; x <= right; x += 1) {
      const index = y * width + x
      visited[index] = 1
      const i = index * 4
      data[i] = fillR
      data[i + 1] = fillG
      data[i + 2] = fillB
      data[i + 3] = fillA
      changed += 1
    }
    scanRow(y - 1, left, right)
    scanRow(y + 1, left, right)
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
      compositeOver(dst, dx + x, dy + y, src)
    }
  }
}

/** Composites `src` over the pixel of `dst` at (`x`,`y`), if there is one. */
function compositeOver(dst: Bitmap, x: number, y: number, src: Rgba): void {
  if (!dst.contains(x, y)) return
  const sa = src.a / 255
  if (sa === 0) return
  if (sa === 1) {
    dst.set(x, y, src)
    return
  }
  const under = dst.get(x, y)
  const ua = under.a / 255
  const outA = sa + ua * (1 - sa)
  dst.set(x, y, {
    r: (src.r * sa + under.r * ua * (1 - sa)) / outA,
    g: (src.g * sa + under.g * ua * (1 - sa)) / outA,
    b: (src.b * sa + under.b * ua * (1 - sa)) / outA,
    a: outA * 255,
  })
}

/** Snaps values a rounding error away from a whole number onto it, so quarter turns sample exactly. */
const settle = (value: number) => Math.round(value * 1e9) / 1e9

/** The colour of `source` at continuous pixel coordinates (`u`,`v`), bilinearly blended; transparent outside. */
function sampleBilinear(source: Bitmap, u: number, v: number): Rgba {
  const x0 = Math.floor(u)
  const y0 = Math.floor(v)
  const fx = u - x0
  const fy = v - y0
  let r = 0
  let g = 0
  let b = 0
  let a = 0
  const add = (x: number, y: number, weight: number) => {
    if (weight === 0) return
    const pixel = source.get(x, y)
    const alpha = pixel.a * weight
    r += pixel.r * alpha
    g += pixel.g * alpha
    b += pixel.b * alpha
    a += alpha
  }
  add(x0, y0, (1 - fx) * (1 - fy))
  add(x0 + 1, y0, fx * (1 - fy))
  add(x0, y0 + 1, (1 - fx) * fy)
  add(x0 + 1, y0 + 1, fx * fy)
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 }
  return { r: r / a, g: g / a, b: b / a, a }
}

/**
 * How a turned bitmap is read: `bilinear` keeps the turned edges smooth, `nearest`
 * keeps a hard-edged source hard-edged (no blended pixels).
 */
export type Sampling = 'bilinear' | 'nearest'

/**
 * Alpha-composites `source`, placed with its top-left at (`dx`,`dy`), over `dst`
 * after turning it by `angle` radians (clockwise on screen) about `centre`. At 0
 * this is exactly {@link blitAlpha}; otherwise each covered pixel samples the
 * source bilinearly (or, with `nearest`, takes the closest source pixel as is).
 */
export function blitAlphaRotated(
  dst: Bitmap,
  source: Bitmap,
  dx: number,
  dy: number,
  centre: Point,
  angle: number,
  sampling: Sampling = 'bilinear',
): void {
  if (angle === 0) {
    blitAlpha(dst, source, dx, dy)
    return
  }
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const corners = [
    { x: dx, y: dy },
    { x: dx + source.width, y: dy },
    { x: dx, y: dy + source.height },
    { x: dx + source.width, y: dy + source.height },
  ].map((p) => ({
    x: centre.x + (p.x - centre.x) * cos - (p.y - centre.y) * sin,
    y: centre.y + (p.x - centre.x) * sin + (p.y - centre.y) * cos,
  }))
  const left = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x))) - 1)
  const top = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y))) - 1)
  const right = Math.min(dst.width, Math.ceil(Math.max(...corners.map((p) => p.x))) + 1)
  const bottom = Math.min(dst.height, Math.ceil(Math.max(...corners.map((p) => p.y))) + 1)
  for (let y = top; y < bottom; y += 1) {
    const ry = y + 0.5 - centre.y
    for (let x = left; x < right; x += 1) {
      const rx = x + 0.5 - centre.x
      // Back into the upright source: turn the pixel centre by -angle.
      const u = settle(centre.x + rx * cos + ry * sin - dx - 0.5)
      const v = settle(centre.y - rx * sin + ry * cos - dy - 0.5)
      if (u <= -1 || v <= -1 || u >= source.width || v >= source.height) continue
      if (sampling === 'nearest') {
        const sx = Math.floor(u + 0.5)
        const sy = Math.floor(v + 0.5)
        if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) continue
        compositeOver(dst, x, y, source.get(sx, sy))
      } else {
        compositeOver(dst, x, y, sampleBilinear(source, u, v))
      }
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

/**
 * Scales a bitmap down proportionally so its longer side fits within `maxEdge`,
 * or returns it unchanged when it already fits. Never upscales.
 */
export function fitWithin(source: Bitmap, maxEdge: number): Bitmap {
  const longest = Math.max(source.width, source.height)
  if (longest <= maxEdge) return source
  const factor = Math.min(1, maxEdge / longest)
  return scale(source, source.width * factor, source.height * factor)
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

/** Inverts the red, green and blue channels of every pixel, keeping alpha. */
export function invertColors(source: Bitmap): Bitmap {
  const result = new Bitmap(source.width, source.height)
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const pixel = source.get(x, y)
      result.set(x, y, { r: 255 - pixel.r, g: 255 - pixel.g, b: 255 - pixel.b, a: pixel.a })
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

function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

/** Size of the box that holds a `width`×`height` image rotated by `degrees`. */
export function rotatedSize(width: number, height: number, degrees: number): { width: number; height: number } {
  const radians = (normalizeDegrees(degrees) * Math.PI) / 180
  const cos = Math.abs(Math.cos(radians))
  const sin = Math.abs(Math.sin(radians))
  return {
    width: Math.max(1, Math.ceil(width * cos + height * sin - 1e-9)),
    height: Math.max(1, Math.ceil(width * sin + height * cos - 1e-9)),
  }
}

/**
 * Rotates a bitmap clockwise by any angle around its centre, growing to fit.
 * Uncovered corners take `fill`, or stay transparent without one. Quarter turns
 * are exact; other angles use nearest-neighbour sampling.
 */
export function rotateBy(source: Bitmap, degrees: number, fill: Rgba | null = null): Bitmap {
  const angle = normalizeDegrees(degrees)
  if (angle === 0) return source.clone()
  if (angle === 90) return rotate90(source)
  if (angle === 180) return rotate180(source)
  if (angle === 270) return rotate270(source)
  const { width, height } = rotatedSize(source.width, source.height, angle)
  const result = new Bitmap(width, height, fill ?? undefined)
  const radians = (angle * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  for (let y = 0; y < height; y += 1) {
    const dy = y + 0.5 - height / 2
    for (let x = 0; x < width; x += 1) {
      const dx = x + 0.5 - width / 2
      const sx = Math.floor(dx * cos + dy * sin + source.width / 2)
      const sy = Math.floor(-dx * sin + dy * cos + source.height / 2)
      if (source.contains(sx, sy)) result.set(x, y, source.get(sx, sy))
    }
  }
  return result
}
