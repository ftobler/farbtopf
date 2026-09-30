import type { Bitmap } from '../bitmap'
import type { Point } from '../geometry'
import { clamp } from '../geometry'
import { drawPolyline, fillPolygon } from '../raster'
import type { ShapeKind, ShapeStyle } from '../shapes'
import type { ShapeFamily, TweakHandle } from './types'

/** Default overall shaft thickness in image pixels for a freshly inserted arrow. */
const DEFAULT_THICKNESS = 16
const MIN_THICKNESS = 1
const MAX_THICKNESS = 256

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

/** Snaps `point` so the `anchor`→`point` segment is horizontal or vertical. */
function snapToAxis(anchor: Point, point: Point): Point {
  return Math.abs(point.x - anchor.x) >= Math.abs(point.y - anchor.y)
    ? { x: point.x, y: anchor.y }
    : { x: anchor.x, y: point.y }
}

function doubleHeaded(kind: ShapeKind): boolean {
  return kind === 'arrow-double'
}

function snapsToAxis(kind: ShapeKind): boolean {
  return kind === 'arrow-axis'
}

/** Shaft-and-head outline in image space; `kind` decides one or two heads. */
function arrowPolygon(kind: ShapeKind, tail: Point, tip: Point, thickness: number): Point[] | null {
  const a = axis(tail, tip)
  if (!a) return null
  const { dir, length } = a
  const perp = { x: -dir.y, y: dir.x }
  const shaftHalf = thickness / 2
  const headHalf = HEAD_HALF_FACTOR * thickness
  const double = doubleHeaded(kind)
  const headLen = Math.min(HEAD_LENGTH_FACTOR * thickness, (double ? 0.45 : 0.9) * length)
  const base = { x: tip.x - dir.x * headLen, y: tip.y - dir.y * headLen }
  if (!double) {
    return [
      { x: tail.x + perp.x * shaftHalf, y: tail.y + perp.y * shaftHalf },
      { x: base.x + perp.x * shaftHalf, y: base.y + perp.y * shaftHalf },
      { x: base.x + perp.x * headHalf, y: base.y + perp.y * headHalf },
      tip,
      { x: base.x - perp.x * headHalf, y: base.y - perp.y * headHalf },
      { x: base.x - perp.x * shaftHalf, y: base.y - perp.y * shaftHalf },
      { x: tail.x - perp.x * shaftHalf, y: tail.y - perp.y * shaftHalf },
    ]
  }
  const tailBase = { x: tail.x + dir.x * headLen, y: tail.y + dir.y * headLen }
  return [
    tail,
    { x: tailBase.x + perp.x * headHalf, y: tailBase.y + perp.y * headHalf },
    { x: tailBase.x + perp.x * shaftHalf, y: tailBase.y + perp.y * shaftHalf },
    { x: base.x + perp.x * shaftHalf, y: base.y + perp.y * shaftHalf },
    { x: base.x + perp.x * headHalf, y: base.y + perp.y * headHalf },
    tip,
    { x: base.x - perp.x * headHalf, y: base.y - perp.y * headHalf },
    { x: base.x - perp.x * shaftHalf, y: base.y - perp.y * shaftHalf },
    { x: tailBase.x - perp.x * shaftHalf, y: tailBase.y - perp.y * shaftHalf },
    { x: tail.x - perp.x * headHalf, y: tail.y - perp.y * headHalf },
  ]
}

export const arrowFamily: ShapeFamily = {
  kinds: ['arrow', 'arrow-double', 'arrow-axis'],
  insert(kind, start, end) {
    const tip = snapsToAxis(kind) ? snapToAxis(start, end) : end
    return [start, tip, { x: DEFAULT_THICKNESS, y: 0 }]
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
  move(kind, points, id, point) {
    if (points.length < 2) return null
    const tail = points[0]
    const tip = points[1]
    const thickness = thicknessOf(points)
    switch (id) {
      case 'tail': {
        const next = snapsToAxis(kind) ? snapToAxis(tip, point) : point
        return [next, tip, { x: thickness, y: 0 }]
      }
      case 'tip': {
        const next = snapsToAxis(kind) ? snapToAxis(tail, point) : point
        return [tail, next, { x: thickness, y: 0 }]
      }
      case 'thickness': {
        const next = clamp(perpendicularDistance(point, tail, tip), MIN_THICKNESS, MAX_THICKNESS)
        return [tail, tip, { x: next, y: 0 }]
      }
      default:
        return null
    }
  },
  render(bitmap: Bitmap, kind, points, style: ShapeStyle) {
    if (points.length < 2) return
    const polygon = arrowPolygon(kind, points[0], points[1], thicknessOf(points))
    if (!polygon) return
    if (style.fill) fillPolygon(bitmap, polygon, style.fill)
    if (style.stroke) drawPolyline(bitmap, [...polygon, polygon[0]], style.width, style.stroke, 'round')
  },
}
