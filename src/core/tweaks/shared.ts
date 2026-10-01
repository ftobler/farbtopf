import type { Bitmap } from '../bitmap'
import type { Point, Rect } from '../geometry'
import { drawPolyline, fillPolygon } from '../raster'
import type { ShapeStyle } from '../shapes'
import { fillBox, outlineBox } from '../shapes'
import type { TweakHandle } from './types'

/** Handle id for a rounded shape's corner radius. */
export const RADIUS_ID = 'radius'
/** A fresh rounded shape's corner radius, as a fraction of its smaller side. */
export const DEFAULT_RADIUS_RATIO = 0.2

/** The largest corner radius that still leaves a straight edge on the box's smaller side. */
export function maxRadius(box: Rect): number {
  return Math.min(box.width, box.height) / 2 - 1
}

/** Scales a corner radius drawn for box `from` to the same rounding on box `to`. */
export function scaleRadius(radius: number, from: Rect, to: Rect): number {
  const base = Math.min(from.width, from.height)
  if (base <= 0) return 0
  return Math.max(0, (radius * Math.min(to.width, to.height)) / base)
}

const BOX_HANDLE_IDS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const

/** The eight resize handles around the box spanned by the two anchor corners. */
export function boxHandles(points: readonly Point[]): TweakHandle[] {
  if (points.length < 2) return []
  const a = points[0]
  const b = points[1]
  const x0 = Math.min(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const midX = (x0 + x1) / 2
  const midY = (y0 + y1) / 2
  return [
    { id: 'nw', point: { x: x0, y: y0 } },
    { id: 'n', point: { x: midX, y: y0 } },
    { id: 'ne', point: { x: x1, y: y0 } },
    { id: 'e', point: { x: x1, y: midY } },
    { id: 'se', point: { x: x1, y: y1 } },
    { id: 's', point: { x: midX, y: y1 } },
    { id: 'sw', point: { x: x0, y: y1 } },
    { id: 'w', point: { x: x0, y: midY } },
  ]
}

/**
 * Resizes the box spanned by `[start, end]` by dragging one of the eight
 * `nw,n,ne,e,se,s,sw,w` handles to `point`. The opposite edge or corner stays
 * fixed. Returns two corner anchors that normalize to the dragged box, or null
 * for an unknown handle.
 */
export function resizeBox(points: readonly Point[], id: string, point: Point): Point[] | null {
  if (points.length < 2 || !BOX_HANDLE_IDS.includes(id as (typeof BOX_HANDLE_IDS)[number])) return null
  const a = points[0]
  const b = points[1]
  let x0 = Math.min(a.x, b.x)
  let y0 = Math.min(a.y, b.y)
  let x1 = Math.max(a.x, b.x)
  let y1 = Math.max(a.y, b.y)
  switch (id) {
    case 'nw':
      x0 = point.x
      y0 = point.y
      break
    case 'n':
      y0 = point.y
      break
    case 'ne':
      x1 = point.x
      y0 = point.y
      break
    case 'e':
      x1 = point.x
      break
    case 'se':
      x1 = point.x
      y1 = point.y
      break
    case 's':
      y1 = point.y
      break
    case 'sw':
      x0 = point.x
      y1 = point.y
      break
    default:
      x0 = point.x
      break
  }
  return [
    { x: Math.min(x0, x1), y: Math.min(y0, y1) },
    { x: Math.max(x0, x1), y: Math.max(y0, y1) },
  ]
}

function bounds(points: readonly Point[]): Rect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function mapPoints(points: readonly Point[], from: Rect, to: Rect): Point[] {
  const sx = from.width === 0 ? 0 : to.width / from.width
  const sy = from.height === 0 ? 0 : to.height / from.height
  return points.map((p) => ({ x: to.x + (p.x - from.x) * sx, y: to.y + (p.y - from.y) * sy }))
}

/**
 * Fills and strokes a closed polygon the way `renderShape` draws its polygon
 * shapes: the fill is grown by 0.25 when there is no stroke, and the outline is
 * stroked through pixel-centre coordinates inset so a thick stroke stays inside
 * the polygon's bounding box.
 */
export function fillAndStrokePolygon(
  bitmap: Bitmap,
  points: readonly Point[],
  style: ShapeStyle,
): void {
  if (points.length < 3) return
  const source = bounds(points)
  const outline = outlineBox(source, style.stroke ? style.width : 1)
  if (style.fill) {
    fillPolygon(bitmap, mapPoints(points, source, fillBox(outline, style.stroke ? 0 : 0.25)), style.fill)
  }
  if (style.stroke) {
    const stroke = mapPoints(points, source, outline)
    drawPolyline(bitmap, [...stroke, stroke[0]], style.width, style.stroke, 'round')
  }
}
