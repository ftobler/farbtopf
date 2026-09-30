import type { Bitmap } from '../bitmap'
import type { Point, Rect } from '../geometry'
import { clamp, distance, normalizeRect } from '../geometry'
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

function centre(box: Rect): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** The outer tip radius in image space, matching the box's inner circle. */
function outerReach(box: Rect): number {
  return Math.min(box.width, box.height) / 2
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
      const next = clamp(distance(point, centre(box)) / outerReach(box), 0.05, 0.95)
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
