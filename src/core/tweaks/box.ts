import type { Bitmap } from '../bitmap'
import type { Point, Rect } from '../geometry'
import { normalizeRect } from '../geometry'
import { drawEllipse, drawPolyline, fillPolygon } from '../raster'
import type { ShapeKind, ShapeStyle } from '../shapes'
import { fillBox, outlineBox, renderShape, shapePolygon } from '../shapes'
import { boxHandles, resizeBox } from './shared'
import type { ShapeFamily, TweakHandle } from './types'

const RADIUS_ID = 'radius'
const ROTATE_ID = 'rotate'
const DEFAULT_RADIUS_RATIO = 0.2
const ROTATE_HANDLE_OFFSET = 18

function radiusFromPoints(points: readonly Point[]): number {
  if (points.length < 3) return 0
  return Math.max(0, points[2].x)
}

function rotationFromPoints(points: readonly Point[]): number {
  return points.length >= 3 ? points[2].y : 0
}

function maxRadius(box: Rect): number {
  return Math.min(box.width, box.height) / 2 - 1
}

function scaleRadius(radius: number, from: Rect, to: Rect): number {
  const base = Math.min(from.width, from.height)
  if (base <= 0) return 0
  return Math.max(0, (radius * Math.min(to.width, to.height)) / base)
}

function boxCentre(points: readonly Point[]): Point {
  const box = normalizeRect(points[0], points[1])
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

function rotateAround(point: Point, centre: Point, angle: number): Point {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = point.x - centre.x
  const dy = point.y - centre.y
  return { x: centre.x + dx * cos - dy * sin, y: centre.y + dx * sin + dy * cos }
}

function unrotateAround(point: Point, centre: Point, angle: number): Point {
  return rotateAround(point, centre, -angle)
}

function rotatePoints(points: readonly Point[], centre: Point, angle: number): Point[] {
  return points.map((p) => rotateAround(p, centre, angle))
}

function insertBox(start: Point, end: Point): Point[] {
  return [start, end, { x: 0, y: 0 }]
}

function insertRounded(start: Point, end: Point): Point[] {
  const box = normalizeRect(start, end)
  const radius = Math.max(0, Math.min(box.width, box.height) * DEFAULT_RADIUS_RATIO)
  return [start, end, { x: radius, y: 0 }]
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

function boxHandleSet(points: readonly Point[]): TweakHandle[] {
  const angle = rotationFromPoints(points)
  const centre = boxCentre(points)
  return boxHandles(points).map((handle) => ({
    id: handle.id,
    point: rotateAround(handle.point, centre, angle),
  }))
}

function rotateHandle(points: readonly Point[]): TweakHandle {
  const box = normalizeRect(points[0], points[1])
  const centre = boxCentre(points)
  const angle = rotationFromPoints(points)
  const local: Point = { x: box.x + box.width / 2, y: box.y - ROTATE_HANDLE_OFFSET }
  return { id: ROTATE_ID, point: rotateAround(local, centre, angle) }
}

function boxHandlesWithRotate(points: readonly Point[]): TweakHandle[] {
  if (points.length < 2) return []
  return [...boxHandleSet(points), rotateHandle(points)]
}

function roundedHandles(points: readonly Point[]): TweakHandle[] {
  if (points.length < 2) return []
  const box = normalizeRect(points[0], points[1])
  const centre = boxCentre(points)
  const angle = rotationFromPoints(points)
  const radius = radiusFromPoints(points)
  const local: Point = { x: box.x + radius, y: box.y + radius }
  return [...boxHandleSet(points), rotateHandle(points), { id: RADIUS_ID, point: rotateAround(local, centre, angle) }]
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

function moveBox(points: readonly Point[], id: string, point: Point): Point[] | null {
  if (points.length < 2) return null
  const angle = rotationFromPoints(points)
  const centre = boxCentre(points)
  if (id === ROTATE_ID) {
    const next = Math.atan2(point.y - centre.y, point.x - centre.x) + Math.PI / 2
    return [points[0], points[1], { x: 0, y: next }]
  }
  const local = unrotateAround(point, centre, angle)
  const resized = resizeBox([points[0], points[1]], id, local)
  if (!resized) return null
  return [resized[0], resized[1], { x: 0, y: angle }]
}

function moveRounded(points: readonly Point[], id: string, point: Point): Point[] | null {
  if (points.length < 2) return null
  const box = normalizeRect(points[0], points[1])
  const angle = rotationFromPoints(points)
  const centre = boxCentre(points)
  const radius = radiusFromPoints(points)
  if (id === ROTATE_ID) {
    const next = Math.atan2(point.y - centre.y, point.x - centre.x) + Math.PI / 2
    return [points[0], points[1], { x: radius, y: next }]
  }
  const local = unrotateAround(point, centre, angle)
  if (id === RADIUS_ID) {
    const nextRadius = Math.max(0, Math.min(local.x - box.x, maxRadius(box)))
    return [points[0], points[1], { x: nextRadius, y: angle }]
  }
  const resized = resizeBox([points[0], points[1]], id, local)
  if (!resized) return null
  const nextBox = normalizeRect(resized[0], resized[1])
  const nextRadius = Math.max(0, Math.min(radius, maxRadius(nextBox)))
  return [resized[0], resized[1], { x: nextRadius, y: angle }]
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
  const angle = rotationFromPoints(points)
  const centre = boxCentre(points)
  const outline = outlineBox(box, style.stroke ? style.width : 1)
  if (style.fill) {
    const target = fillBox(outline, style.stroke ? 0 : 0.25)
    const polygon = shapePolygon('rounded-rectangle', target, scaleRadius(radius, box, target))
    fillPolygon(bitmap, angle === 0 ? polygon : rotatePoints(polygon, centre, angle), style.fill)
  }
  if (style.stroke) {
    const polygon = shapePolygon('rounded-rectangle', outline, scaleRadius(radius, box, outline))
    const rotated = angle === 0 ? polygon : rotatePoints(polygon, centre, angle)
    drawPolyline(bitmap, [...rotated, rotated[0]], style.width, style.stroke, 'round')
  }
}

function renderPolygon(bitmap: Bitmap, kind: ShapeKind, points: readonly Point[], style: ShapeStyle): void {
  const angle = rotationFromPoints(points)
  if (angle === 0) {
    renderShape(bitmap, kind, [points[0], points[1]], style)
    return
  }
  const box = normalizeRect(points[0], points[1])
  const centre = boxCentre(points)
  const outline = outlineBox(box, style.stroke ? style.width : 1)
  if (style.fill) {
    const target = fillBox(outline, style.stroke ? 0 : 0.25)
    fillPolygon(bitmap, rotatePoints(shapePolygon(kind, target), centre, angle), style.fill)
  }
  if (style.stroke) {
    const polygon = rotatePoints(shapePolygon(kind, outline), centre, angle)
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
  kinds: ['rectangle', 'rounded-rectangle', 'ellipse', 'diamond'],
  insert(kind, start, end) {
    if (kind === 'rounded-rectangle') return insertRounded(start, end)
    if (kind === 'ellipse') return insertEllipse(start, end)
    return insertBox(start, end)
  },
  handles(kind, points) {
    if (kind === 'ellipse') return ellipseHandles(points)
    if (kind === 'rounded-rectangle') return roundedHandles(points)
    return boxHandlesWithRotate(points)
  },
  move(kind, points, id, point) {
    if (kind === 'ellipse') return moveEllipse(points, id, point)
    if (kind === 'rounded-rectangle') return moveRounded(points, id, point)
    return moveBox(points, id, point)
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
    renderPolygon(bitmap, kind, points, style)
  },
}
