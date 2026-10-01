import type { Bitmap } from '../bitmap'
import { normalizeRect } from '../geometry'
import type { Point, Rect } from '../geometry'
import { drawPolyline, fillPolygon } from '../raster'
import type { ShapeKind, ShapeStyle } from '../shapes'
import { callout, calloutBodyBox, fillBox, outlineBox } from '../shapes'
import { DEFAULT_RADIUS_RATIO, RADIUS_ID, boxHandles, maxRadius, resizeBox, scaleRadius } from './shared'
import type { ShapeFamily, TweakHandle } from './types'

const TAIL_ID = 'tail'
const DEFAULT_TAIL_TIP = 0.15

function defaultTip(box: Rect): Point {
  return { x: box.x + box.width * DEFAULT_TAIL_TIP, y: box.y + box.height }
}

function currentTip(points: readonly Point[]): Point {
  return points[2] ?? defaultTip(normalizeRect(points[0], points[1]))
}

/**
 * The tip's position as a fraction of the anchor box. The resize rule keeps this unit
 * position fixed, so resizing the body carries the tail tip along with it (a tip dragged
 * off an edge stays off that edge by the same fraction).
 */
function unitPosition(box: Rect, point: Point): Point {
  return {
    x: box.width === 0 ? DEFAULT_TAIL_TIP : (point.x - box.x) / box.width,
    y: box.height === 0 ? 1 : (point.y - box.y) / box.height,
  }
}

function tipIn(target: Rect, unit: Point): Point {
  return { x: target.x + unit.x * target.width, y: target.y + unit.y * target.height }
}

function isRounded(kind: ShapeKind): boolean {
  return kind === 'callout-rounded-rectangle'
}

/** The rounded callout's corner radius, kept as a fourth anchor `{ x: radius, y: 0 }`. */
function radiusFromPoints(points: readonly Point[], body: Rect): number {
  if (points.length < 4) return Math.max(0, Math.min(body.width, body.height) * DEFAULT_RADIUS_RATIO)
  return Math.max(0, points[3].x)
}

function radiusHandle(points: readonly Point[]): TweakHandle {
  const body = calloutBodyBox(normalizeRect(points[0], points[1]))
  const radius = radiusFromPoints(points, body)
  return { id: RADIUS_ID, point: { x: body.x + radius, y: body.y + radius } }
}

export const calloutFamily: ShapeFamily = {
  kinds: ['callout-rectangle', 'callout-rounded-rectangle', 'callout-oval'],
  insert(kind, start, end) {
    const box = normalizeRect(start, end)
    const points = [start, end, defaultTip(box)]
    if (!isRounded(kind)) return points
    return [...points, { x: radiusFromPoints(points, calloutBodyBox(box)), y: 0 }]
  },
  handles(kind, points) {
    if (points.length < 2) return []
    const handles = [...boxHandles(points), { id: TAIL_ID, point: currentTip(points) }]
    return isRounded(kind) ? [...handles, radiusHandle(points)] : handles
  },
  move(kind, points, id, point) {
    if (points.length < 2) return null
    const box = normalizeRect(points[0], points[1])
    const body = calloutBodyBox(box)
    const radius = radiusFromPoints(points, body)
    const withRadius = (anchors: Point[], next: number) => (isRounded(kind) ? [...anchors, { x: next, y: 0 }] : anchors)
    if (id === TAIL_ID) return withRadius([points[0], points[1], point], radius)
    if (id === RADIUS_ID) {
      if (!isRounded(kind)) return null
      return withRadius([points[0], points[1], currentTip(points)], Math.max(0, Math.min(point.x - body.x, maxRadius(body))))
    }
    const unit = unitPosition(box, currentTip(points))
    const resized = resizeBox([points[0], points[1]], id, point)
    if (!resized) return null
    const nextBox = normalizeRect(resized[0], resized[1])
    const nextRadius = Math.max(0, Math.min(radius, maxRadius(calloutBodyBox(nextBox))))
    return withRadius([resized[0], resized[1], tipIn(nextBox, unit)], nextRadius)
  },
  render(bitmap: Bitmap, kind: ShapeKind, points: readonly Point[], style: ShapeStyle) {
    if (points.length < 2) return
    const box = normalizeRect(points[0], points[1])
    // Fill and stroke aim at the same tip so the fill never strays outside the tail's stroke.
    const tip = currentTip(points)
    const body = calloutBodyBox(box)
    // The radius is held for the anchor box; each drawn box gets the same rounding scaled to its body.
    const radiusIn = (target: Rect) =>
      isRounded(kind) ? scaleRadius(radiusFromPoints(points, body), body, calloutBodyBox(target)) : undefined
    const outline = outlineBox(box, style.stroke ? style.width : 1)
    if (style.fill) {
      const target = fillBox(outline, style.stroke ? 0 : 0.25)
      fillPolygon(bitmap, callout(kind, target, tip, radiusIn(target)), style.fill)
    }
    if (style.stroke) {
      // The stroke runs through pixel centres, half a pixel before the fill's continuous coordinates.
      const polygon = callout(kind, outline, { x: tip.x - 0.5, y: tip.y - 0.5 }, radiusIn(outline))
      drawPolyline(bitmap, [...polygon, polygon[0]], style.width, style.stroke, 'round')
    }
  },
}
