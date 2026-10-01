import type { Bitmap } from '../bitmap'
import type { Point, Rect } from '../geometry'
import { clamp, normalizeRect } from '../geometry'
import type { ShapeKind, ShapeStyle } from '../shapes'
import { boxHandles, fillAndStrokePolygon, resizeBox } from './shared'
import type { ShapeFamily, TweakHandle } from './types'

const INNER_ID = 'inner'

function tipsOf(kind: ShapeKind): number {
  switch (kind) {
    case 'star-4':
      return 4
    case 'star-6':
      return 6
    default:
      return 5
  }
}

function defaultRatio(kind: ShapeKind): number {
  return kind === 'star-6' ? 0.5 : 0.4
}

/** Unit-space points stretched so their bounding box fills the unit square. */
function stretchToUnit(points: readonly Point[]): Point[] {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const spanX = Math.max(...xs) - minX || 1
  const spanY = Math.max(...ys) - minY || 1
  return points.map((p) => ({ x: (p.x - minX) / spanX, y: (p.y - minY) / spanY }))
}

/** Unit-square star with `tips` points and the given inner radius ratio. */
function star(tips: number, innerRatio: number): Point[] {
  const points: Point[] = []
  for (let i = 0; i < tips * 2; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / tips
    const r = i % 2 === 0 ? 1 : innerRatio
    points.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) })
  }
  return stretchToUnit(points)
}

function ratioFromPoints(kind: ShapeKind, points: readonly Point[]): number {
  return points.length >= 3 ? points[2].x : defaultRatio(kind)
}

function mapBox(box: Rect): (u: number, v: number) => Point {
  return (u, v) => ({ x: box.x + u * box.width, y: box.y + v * box.height })
}

/** The unit-space position of the first inner vertex, the same point `handles` maps. */
function innerUnit(kind: ShapeKind, ratio: number): Point {
  return star(tipsOf(kind), ratio)[1]
}

/**
 * The axis along which `innerUnit` is affine. The stretch box is pinned by the
 * outer tips on one axis, while the inner vertices reshape it on the other, so
 * only one of the two components inverts cleanly for this star.
 */
function ratioAxis(kind: ShapeKind): keyof Point {
  const p0 = innerUnit(kind, 0)
  const p1 = innerUnit(kind, 1)
  const mid = innerUnit(kind, 0.5)
  const xError = Math.abs(mid.x - (p0.x + p1.x) / 2)
  const yError = Math.abs(mid.y - (p0.y + p1.y) / 2)
  return xError <= yError ? 'x' : 'y'
}

/** Inverts the mapping `handles` uses to place the inner handle. */
function ratioFromUnit(kind: ShapeKind, u: Point): number {
  const p0 = innerUnit(kind, 0)
  const p1 = innerUnit(kind, 1)
  const axis = ratioAxis(kind)
  const span = p1[axis] - p0[axis]
  if (span === 0) return defaultRatio(kind)
  return (u[axis] - p0[axis]) / span
}

export const starFamily: ShapeFamily = {
  kinds: ['star-4', 'star-5', 'star-6'],
  insert(kind, start, end) {
    return [start, end, { x: defaultRatio(kind), y: 0 }]
  },
  handles(kind, points): TweakHandle[] {
    if (points.length < 2) return []
    const box = normalizeRect(points[0], points[1])
    const map = mapBox(box)
    const inner = star(tipsOf(kind), ratioFromPoints(kind, points))[1]
    return [...boxHandles(points), { id: INNER_ID, point: map(inner.x, inner.y) }]
  },
  move(kind, points, id, point) {
    if (points.length < 2) return null
    const ratio = ratioFromPoints(kind, points)
    if (id === INNER_ID) {
      const box = normalizeRect(points[0], points[1])
      if (box.width === 0 || box.height === 0) return null
      const u = { x: (point.x - box.x) / box.width, y: (point.y - box.y) / box.height }
      const next = clamp(ratioFromUnit(kind, u), 0.05, 0.95)
      return [points[0], points[1], { x: next, y: points[2]?.y ?? 0 }]
    }
    const resized = resizeBox([points[0], points[1]], id, point)
    if (!resized) return null
    return [resized[0], resized[1], { x: ratio, y: points[2]?.y ?? 0 }]
  },
  render(bitmap: Bitmap, kind: ShapeKind, points: readonly Point[], style: ShapeStyle) {
    if (points.length < 2) return
    const box = normalizeRect(points[0], points[1])
    const map = mapBox(box)
    const shape = star(tipsOf(kind), ratioFromPoints(kind, points))
    fillAndStrokePolygon(
      bitmap,
      shape.map((p) => map(p.x, p.y)),
      style,
    )
  },
}
