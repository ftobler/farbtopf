import type { Bitmap } from '../bitmap'
import { normalizeRect } from '../geometry'
import type { Point, Rect } from '../geometry'
import { drawPolyline, fillPolygon } from '../raster'
import type { ShapeKind, ShapeStyle } from '../shapes'
import { callout, fillBox, outlineBox } from '../shapes'
import { boxHandles, resizeBox } from './shared'
import type { ShapeFamily } from './types'

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

export const calloutFamily: ShapeFamily = {
  kinds: ['callout-rectangle', 'callout-rounded-rectangle', 'callout-oval'],
  insert(_kind, start, end) {
    return [start, end, defaultTip(normalizeRect(start, end))]
  },
  handles(_kind, points) {
    if (points.length < 2) return []
    return [...boxHandles(points), { id: TAIL_ID, point: currentTip(points) }]
  },
  move(_kind, points, id, point) {
    if (points.length < 2) return null
    if (id === TAIL_ID) return [points[0], points[1], point]
    const box = normalizeRect(points[0], points[1])
    const unit = unitPosition(box, currentTip(points))
    const resized = resizeBox([points[0], points[1]], id, point)
    if (!resized) return null
    const nextBox = normalizeRect(resized[0], resized[1])
    return [resized[0], resized[1], tipIn(nextBox, unit)]
  },
  render(bitmap: Bitmap, kind: ShapeKind, points: readonly Point[], style: ShapeStyle) {
    if (points.length < 2) return
    const box = normalizeRect(points[0], points[1])
    const unit = unitPosition(box, currentTip(points))
    const outline = outlineBox(box, style.stroke ? style.width : 1)
    if (style.fill) {
      const target = fillBox(outline, style.stroke ? 0 : 0.25)
      fillPolygon(bitmap, callout(kind, target, tipIn(target, unit)), style.fill)
    }
    if (style.stroke) {
      const polygon = callout(kind, outline, tipIn(outline, unit))
      drawPolyline(bitmap, [...polygon, polygon[0]], style.width, style.stroke, 'round')
    }
  },
}
