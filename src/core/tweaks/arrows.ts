import type { Point, Rect } from '../geometry'
import { clamp, normalizeRect } from '../geometry'
import type { ShapeKind } from '../shapes'
import { boxHandles, fillAndStrokePolygon, resizeBox } from './shared'
import type { ShapeFamily } from './types'

const DEFAULT_T = 0.25
const MIN_T = 0.05
const MAX_T = 0.45

/** Shaft half-height from the extra shaft anchor (its `.x`); `.y` is ignored. */
function shaftThickness(points: readonly Point[]): number {
  return points.length < 3 ? DEFAULT_T : points[2].x
}

function boxOf(points: readonly Point[]): Rect {
  return normalizeRect(points[0], points[1])
}

/**
 * The kind transform mapping unit arrow space to image space: `arrow-right`
 * maps `(u,v)` directly, `arrow-left` `(1-u,v)`, `arrow-down` `(v,u)` and
 * `arrow-up` `(v,1-u)`, all stretched over `box`.
 */
function unitToImage(kind: ShapeKind, box: Rect, u: number, v: number): Point {
  switch (kind) {
    case 'arrow-left':
      return { x: box.x + (1 - u) * box.width, y: box.y + v * box.height }
    case 'arrow-down':
      return { x: box.x + v * box.width, y: box.y + u * box.height }
    case 'arrow-up':
      return { x: box.x + v * box.width, y: box.y + (1 - u) * box.height }
    default:
      return { x: box.x + u * box.width, y: box.y + v * box.height }
  }
}

/** Inverse of `unitToImage`: image position back to unit arrow space. */
function imageToUnit(kind: ShapeKind, box: Rect, point: Point): { u: number; v: number } {
  const u = (point.x - box.x) / box.width
  const v = (point.y - box.y) / box.height
  switch (kind) {
    case 'arrow-left':
      return { u: 1 - u, v }
    case 'arrow-down':
      return { u: v, v: u }
    case 'arrow-up':
      return { u: 1 - v, v: u }
    default:
      return { u, v }
  }
}

/** Block arrow pointing towards +u with shaft half-height `t`. */
function unitArrow(t: number): Point[] {
  return [
    { x: 0, y: 0.5 - t },
    { x: 0.5, y: 0.5 - t },
    { x: 0.5, y: 0 },
    { x: 1, y: 0.5 },
    { x: 0.5, y: 1 },
    { x: 0.5, y: 0.5 + t },
    { x: 0, y: 0.5 + t },
  ]
}

function arrowPolygon(kind: ShapeKind, box: Rect, t: number): Point[] {
  return unitArrow(t).map((p) => unitToImage(kind, box, p.x, p.y))
}

export const arrowFamily: ShapeFamily = {
  kinds: ['arrow-left', 'arrow-right', 'arrow-up', 'arrow-down'],
  insert(_kind, start, end) {
    return [start, end, { x: DEFAULT_T, y: 0 }]
  },
  handles(kind, points) {
    if (points.length < 2) return []
    const box = boxOf(points)
    const t = shaftThickness(points)
    return [...boxHandles(points), { id: 'shaft', point: unitToImage(kind, box, 0.5, 0.5 - t) }]
  },
  move(kind, points, id, point) {
    if (points.length < 2) return null
    if (id === 'shaft') {
      const box = boxOf(points)
      const unit = imageToUnit(kind, box, point)
      const t = clamp(Math.abs(unit.v - 0.5), MIN_T, MAX_T)
      return [points[0], points[1], { x: t, y: 0 }]
    }
    const resized = resizeBox(points, id, point)
    if (!resized) return null
    return [resized[0], resized[1], points[2] ?? { x: DEFAULT_T, y: 0 }]
  },
  render(bitmap, kind, points, style) {
    if (points.length < 2) return
    const box = boxOf(points)
    fillAndStrokePolygon(bitmap, arrowPolygon(kind, box, shaftThickness(points)), style)
  },
}
