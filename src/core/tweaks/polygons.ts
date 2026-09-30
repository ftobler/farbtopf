import type { Bitmap } from '../bitmap'
import type { Point, Rect } from '../geometry'
import { normalizeRect } from '../geometry'
import type { ShapeKind, ShapeStyle } from '../shapes'
import { fillAndStrokePolygon } from './shared'
import type { ShapeFamily, TweakHandle } from './types'

const HANDLE_IDS = ['v0', 'v1', 'v2', 'v3'] as const

const TRIANGLE: readonly Point[] = [
  { x: 0.5, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
]

function mapBox(box: Rect): (u: number, v: number) => Point {
  return (u, v) => ({ x: box.x + u * box.width, y: box.y + v * box.height })
}

function rightTriangleVertices(start: Point, box: Rect): Point[] {
  const map = mapBox(box)
  const atRight = start.x > box.x + box.width / 2
  const atBottom = start.y > box.y + box.height / 2
  return [
    map(atRight ? 1 : 0, atBottom ? 1 : 0),
    map(atRight ? 1 : 0, atBottom ? 0 : 1),
    map(atRight ? 0 : 1, atBottom ? 0 : 1),
  ]
}

function insertVertices(kind: ShapeKind, start: Point, end: Point): Point[] {
  const box = normalizeRect(start, end)
  if (kind === 'right-triangle') return rightTriangleVertices(start, box)
  const map = mapBox(box)
  return TRIANGLE.map((p) => map(p.x, p.y))
}

export const polygonFamily: ShapeFamily = {
  kinds: ['triangle', 'right-triangle'],
  insert(kind, start, end) {
    return insertVertices(kind, start, end)
  },
  handles(_kind, points): TweakHandle[] {
    return points.map((point, index) => ({ id: HANDLE_IDS[index], point }))
  },
  move(_kind, points, id, point) {
    const index = (HANDLE_IDS as readonly string[]).indexOf(id)
    if (index < 0 || index >= points.length) return null
    return points.map((p, i) => (i === index ? point : p))
  },
  render(bitmap: Bitmap, _kind, points, style: ShapeStyle) {
    fillAndStrokePolygon(bitmap, points, style)
  },
}
