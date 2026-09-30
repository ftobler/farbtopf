import type { Bitmap } from '../bitmap'
import type { Point } from '../geometry'
import { normalizeRect } from '../geometry'
import type { ShapeKind, ShapeStyle } from '../shapes'
import { boxHandles, fillAndStrokePolygon, resizeBox } from './shared'
import type { ShapeFamily } from './types'

const ROTATE_ID = 'rotate'
/** Direction of the first polygon vertex, used as the rotate handle's default. */
const ROTATION_OFFSET = -Math.PI / 2

function sideCount(kind: ShapeKind): number {
  return kind === 'heptagon' ? 7 : 5
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

function regularPolygon(sides: number): Point[] {
  const points: Point[] = []
  for (let i = 0; i < sides; i += 1) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / sides
    points.push({ x: Math.cos(angle), y: Math.sin(angle) })
  }
  return stretchToUnit(points)
}

function rotateUnit(points: readonly Point[], angle: number): Point[] {
  const cx = 0.5
  const cy = 0.5
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return points.map((p) => ({
    x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
    y: cy + (p.x - cx) * sin + (p.y - cy) * cos,
  }))
}

function rotationFromPoints(points: readonly Point[]): number {
  return points.length >= 3 ? points[2].x : 0
}

function boxCentre(points: readonly Point[]): { cx: number; cy: number; radius: number } {
  const box = normalizeRect(points[0], points[1])
  return {
    cx: box.x + box.width / 2,
    cy: box.y + box.height / 2,
    radius: Math.min(box.width, box.height) / 2,
  }
}

export const regularFamily: ShapeFamily = {
  kinds: ['pentagon', 'heptagon'],
  insert(_kind, start, end) {
    return [start, end, { x: 0, y: 0 }]
  },
  handles(_kind, points) {
    if (points.length < 2) return []
    const { cx, cy, radius } = boxCentre(points)
    const angle = rotationFromPoints(points) + ROTATION_OFFSET
    return [
      ...boxHandles(points),
      { id: ROTATE_ID, point: { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) } },
    ]
  },
  move(_kind, points, id, point) {
    if (points.length < 2) return null
    if (id === ROTATE_ID) {
      const { cx, cy } = boxCentre(points)
      const angle = Math.atan2(point.y - cy, point.x - cx) - ROTATION_OFFSET
      return [points[0], points[1], { x: angle, y: 0 }]
    }
    const resized = resizeBox([points[0], points[1]], id, point)
    if (!resized) return null
    return [resized[0], resized[1], { x: rotationFromPoints(points), y: 0 }]
  },
  render(bitmap: Bitmap, kind: ShapeKind, points: readonly Point[], style: ShapeStyle) {
    if (points.length < 2) return
    const angle = rotationFromPoints(points)
    const shape = regularPolygon(sideCount(kind))
    const rotated = stretchToUnit(angle === 0 ? shape : rotateUnit(shape, angle))
    const box = normalizeRect(points[0], points[1])
    const mapped = rotated.map((p) => ({ x: box.x + p.x * box.width, y: box.y + p.y * box.height }))
    fillAndStrokePolygon(bitmap, mapped, style)
  },
}
