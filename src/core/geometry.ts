export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

/** Builds a positive-sized rect from two arbitrary corners. */
export function normalizeRect(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.abs(b.x - a.x) + 1,
    height: Math.abs(b.y - a.y) + 1,
  }
}

/** Builds a rect from a start corner and a width/height, normalized to be positive. */
export function rectFromSize(start: Point, width: number, height: number): Rect {
  return normalizeRect(start, { x: start.x + width - 1, y: start.y + height - 1 })
}

export function pointInRect(point: Point, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  )
}

export function rectsEqual(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** How far `point` lies from the segment between `a` and `b`. */
export function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = dx * dx + dy * dy
  if (length === 0) return distance(point, a)
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / length, 0, 1)
  return distance(point, { x: a.x + t * dx, y: a.y + t * dy })
}

export function pointsEqual(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

/** Restricts a point to the pixel bounds of a `width` x `height` surface. */
export function clampPoint(point: Point, width: number, height: number): Point {
  return {
    x: clamp(Math.floor(point.x), 0, Math.max(0, width - 1)),
    y: clamp(Math.floor(point.y), 0, Math.max(0, height - 1)),
  }
}

/** Snaps a point to the pixel it lies in, even one outside any surface. */
export function floorPoint(point: Point): Point {
  return { x: Math.floor(point.x), y: Math.floor(point.y) }
}
