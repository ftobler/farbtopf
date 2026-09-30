import type { Bitmap } from '../bitmap'
import type { Point } from '../geometry'
import { clamp } from '../geometry'
import { drawPolyline, fillPolygon } from '../raster'
import type { ShapeStyle } from '../shapes'
import type { ShapeFamily, TweakHandle } from './types'

/** Default overall shaft thickness in image pixels for a freshly inserted arrow. */
const DEFAULT_THICKNESS = 4
const MIN_THICKNESS = 1
const MAX_THICKNESS = 64

/** Head is at most 3x the shaft thickness long and 1.5x thick on each side. */
const HEAD_LENGTH_FACTOR = 3
const HEAD_HALF_FACTOR = 1.5

/** Extra anchor `[2].x` stores the overall thickness; `.y` is ignored. */
function thicknessOf(points: readonly Point[]): number {
  return points.length >= 3 ? points[2].x : DEFAULT_THICKNESS
}

/** Unit direction from `tail` to `tip` plus the shaft length; null when degenerate. */
function axis(tail: Point, tip: Point): { dir: Point; length: number } | null {
  const dx = tip.x - tail.x
  const dy = tip.y - tail.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return null
  return { dir: { x: dx / length, y: dy / length }, length }
}

/** Perpendicular distance from `point` to the line through `a` and `b`. */
function perpendicularDistance(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return Math.hypot(point.x - a.x, point.y - a.y)
  return Math.abs(dx * (point.y - a.y) - dy * (point.x - a.x)) / length
}

export const arrowFamily: ShapeFamily = {
  kinds: ['arrow-left', 'arrow-right', 'arrow-up', 'arrow-down'],
  insert(kind, start, end) {
    const swap =
      kind === 'arrow-right'
        ? start.x > end.x
        : kind === 'arrow-left'
          ? start.x < end.x
          : kind === 'arrow-up'
            ? start.y < end.y
            : start.y > end.y
    const tail = swap ? end : start
    const tip = swap ? start : end
    return [tail, tip, { x: DEFAULT_THICKNESS, y: 0 }]
  },
  handles(_kind, points): TweakHandle[] {
    if (points.length < 2) return []
    const tail = points[0]
    const tip = points[1]
    const thickness = thicknessOf(points)
    const a = axis(tail, tip)
    const perp = a ? { x: -a.dir.y, y: a.dir.x } : { x: 0, y: 1 }
    const mid = { x: (tail.x + tip.x) / 2, y: (tail.y + tip.y) / 2 }
    return [
      { id: 'tail', point: tail },
      { id: 'tip', point: tip },
      { id: 'thickness', point: { x: mid.x + perp.x * thickness, y: mid.y + perp.y * thickness } },
    ]
  },
  move(_kind, points, id, point) {
    if (points.length < 2) return null
    const tail = points[0]
    const tip = points[1]
    const thickness = thicknessOf(points)
    switch (id) {
      case 'tail':
        return [point, tip, { x: thickness, y: 0 }]
      case 'tip':
        return [tail, point, { x: thickness, y: 0 }]
      case 'thickness': {
        const next = clamp(perpendicularDistance(point, tail, tip), MIN_THICKNESS, MAX_THICKNESS)
        return [tail, tip, { x: next, y: 0 }]
      }
      default:
        return null
    }
  },
  render(bitmap: Bitmap, _kind, points, style: ShapeStyle) {
    if (points.length < 2) return
    const tail = points[0]
    const tip = points[1]
    const a = axis(tail, tip)
    if (!a) return
    const { dir, length } = a
    const perp = { x: -dir.y, y: dir.x }
    const thickness = thicknessOf(points)
    const shaftHalf = thickness / 2
    const headLen = Math.min(HEAD_LENGTH_FACTOR * thickness, 0.9 * length)
    const headHalf = HEAD_HALF_FACTOR * thickness
    const base = { x: tip.x - dir.x * headLen, y: tip.y - dir.y * headLen }
    const polygon: Point[] = [
      { x: tail.x + perp.x * shaftHalf, y: tail.y + perp.y * shaftHalf },
      { x: base.x + perp.x * shaftHalf, y: base.y + perp.y * shaftHalf },
      { x: base.x + perp.x * headHalf, y: base.y + perp.y * headHalf },
      tip,
      { x: base.x - perp.x * headHalf, y: base.y - perp.y * headHalf },
      { x: base.x - perp.x * shaftHalf, y: base.y - perp.y * shaftHalf },
      { x: tail.x - perp.x * shaftHalf, y: tail.y - perp.y * shaftHalf },
    ]
    if (style.fill) fillPolygon(bitmap, polygon, style.fill)
    if (style.stroke) drawPolyline(bitmap, [...polygon, polygon[0]], style.width, style.stroke, 'round')
  },
}
