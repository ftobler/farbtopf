import type { Bitmap } from '../bitmap'
import type { Point, Rect } from '../geometry'
import { normalizeRect } from '../geometry'
import { drawEllipse, drawPolyline, fillPolygon } from '../raster'
import type { ShapeStyle } from '../shapes'
import { fillBox, outlineBox, renderShape, shapePolygon } from '../shapes'
import { boxHandles, resizeBox } from './shared'
import type { ShapeFamily } from './types'

const RADIUS_ID = 'radius'
const DEFAULT_RADIUS_RATIO = 0.2

function radiusFromPoints(points: readonly Point[]): number {
  if (points.length < 3) return 0
  const box = normalizeRect(points[0], points[1])
  return Math.max(0, points[2].x - box.x)
}

function maxRadius(box: Rect): number {
  return Math.min(box.width, box.height) / 2 - 1
}

function scaleRadius(radius: number, from: Rect, to: Rect): number {
  const base = Math.min(from.width, from.height)
  if (base <= 0) return 0
  return Math.max(0, (radius * Math.min(to.width, to.height)) / base)
}

function insertRounded(start: Point, end: Point): Point[] {
  const box = normalizeRect(start, end)
  const radius = Math.max(0, Math.min(box.width, box.height) * DEFAULT_RADIUS_RATIO)
  return [start, end, { x: box.x + radius, y: box.y + radius }]
}

function insertEllipse(start: Point, end: Point): Point[] {
  const box = normalizeRect(start, end)
  const cx = box.x + (box.width - 1) / 2
  const cy = box.y + (box.height - 1) / 2
  return [
    { x: cx, y: cy },
    { x: (box.width - 1) / 2, y: (box.height - 1) / 2 },
  ]
}

function roundedHandles(points: readonly Point[]): ReturnType<typeof boxHandles> {
  if (points.length < 2) return []
  const box = normalizeRect(points[0], points[1])
  const radius = radiusFromPoints(points)
  return [...boxHandles(points), { id: RADIUS_ID, point: { x: box.x + radius, y: box.y + radius } }]
}

function ellipseParts(points: readonly Point[]): { cx: number; cy: number; rx: number; ry: number } {
  return {
    cx: points[0].x,
    cy: points[0].y,
    rx: Math.abs(points[1]?.x ?? 0),
    ry: Math.abs(points[1]?.y ?? 0),
  }
}

function ellipseHandles(points: readonly Point[]) {
  if (points.length < 2) return []
  const { cx, cy, rx, ry } = ellipseParts(points)
  return [
    { id: 'e', point: { x: cx + rx, y: cy } },
    { id: 'w', point: { x: cx - rx, y: cy } },
    { id: 'n', point: { x: cx, y: cy - ry } },
    { id: 's', point: { x: cx, y: cy + ry } },
  ]
}

function moveRounded(points: readonly Point[], id: string, point: Point): Point[] | null {
  if (points.length < 2) return null
  const box = normalizeRect(points[0], points[1])
  if (id === RADIUS_ID) {
    const radius = Math.max(0, Math.min(point.x - box.x, maxRadius(box)))
    return [points[0], points[1], { x: box.x + radius, y: box.y + radius }]
  }
  const resized = resizeBox([points[0], points[1]], id, point)
  if (!resized) return null
  const nextBox = normalizeRect(resized[0], resized[1])
  const radius = Math.max(0, Math.min(radiusFromPoints(points), maxRadius(nextBox)))
  return [resized[0], resized[1], { x: nextBox.x + radius, y: nextBox.y + radius }]
}

function moveEllipse(points: readonly Point[], id: string, point: Point): Point[] | null {
  if (points.length < 2) return null
  const { cx, cy, rx, ry } = ellipseParts(points)
  switch (id) {
    case 'e':
      return [points[0], { x: Math.max(0.5, point.x - cx), y: ry }]
    case 'w':
      return [points[0], { x: Math.max(0.5, cx - point.x), y: ry }]
    case 'n':
      return [points[0], { x: rx, y: Math.max(0.5, cy - point.y) }]
    case 's':
      return [points[0], { x: rx, y: Math.max(0.5, point.y - cy) }]
    default:
      return null
  }
}

function renderRounded(bitmap: Bitmap, points: readonly Point[], style: ShapeStyle): void {
  if (points.length < 2) return
  const box = normalizeRect(points[0], points[1])
  const radius = radiusFromPoints(points)
  const outline = outlineBox(box, style.stroke ? style.width : 1)
  if (style.fill) {
    const target = fillBox(outline, style.stroke ? 0 : 0.25)
    fillPolygon(bitmap, shapePolygon('rounded-rectangle', target, scaleRadius(radius, box, target)), style.fill)
  }
  if (style.stroke) {
    const polygon = shapePolygon('rounded-rectangle', outline, scaleRadius(radius, box, outline))
    drawPolyline(bitmap, [...polygon, polygon[0]], style.width, style.stroke, 'round')
  }
}

function renderEllipse(bitmap: Bitmap, points: readonly Point[], style: ShapeStyle): void {
  if (points.length < 2) return
  const { cx, cy, rx, ry } = ellipseParts(points)
  const rect: Rect = { x: cx - rx, y: cy - ry, width: rx * 2 + 1, height: ry * 2 + 1 }
  if (style.fill) drawEllipse(bitmap, rect, 1, style.fill, true)
  if (style.stroke) drawEllipse(bitmap, rect, style.width, style.stroke, false)
}

export const boxFamily: ShapeFamily = {
  kinds: ['rectangle', 'rounded-rectangle', 'ellipse'],
  insert(kind, start, end) {
    if (kind === 'rounded-rectangle') return insertRounded(start, end)
    if (kind === 'ellipse') return insertEllipse(start, end)
    return [start, end]
  },
  handles(kind, points) {
    if (kind === 'ellipse') return ellipseHandles(points)
    if (kind === 'rounded-rectangle') return roundedHandles(points)
    return boxHandles(points)
  },
  move(kind, points, id, point) {
    if (kind === 'ellipse') return moveEllipse(points, id, point)
    if (kind === 'rounded-rectangle') return moveRounded(points, id, point)
    return resizeBox(points, id, point)
  },
  render(bitmap, kind, points, style) {
    if (points.length === 0) return
    if (kind === 'ellipse') {
      renderEllipse(bitmap, points, style)
      return
    }
    if (kind === 'rounded-rectangle') {
      renderRounded(bitmap, points, style)
      return
    }
    renderShape(bitmap, kind, [points[0], points[points.length - 1]], style)
  },
}
