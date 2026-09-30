import type { Bitmap } from '../bitmap'
import type { Point } from '../geometry'
import { normalizeRect } from '../geometry'
import { drawPolyline, fillPolygon } from '../raster'
import type { ShapeKind, ShapeStyle } from '../shapes'
import {
  fillBox,
  outlineBox,
  POTATOID_BASE_CONTROLS,
  POTATOID_CONTROLS,
  potatoidOutline,
} from '../shapes'
import type { ShapeFamily, TweakHandle } from './types'

const CONTROL_PREFIX = 'c'

function controlId(index: number): string {
  return `${CONTROL_PREFIX}${index}`
}

function controlIndex(id: string): number {
  if (!id.startsWith(CONTROL_PREFIX)) return -1
  const index = Number(id.slice(CONTROL_PREFIX.length))
  return Number.isInteger(index) && index >= 0 && index < POTATOID_CONTROLS ? index : -1
}

/** The per-control unit-space offsets stored from anchor 2 onwards. */
function offsetsOf(points: readonly Point[]): Point[] {
  return Array.from({ length: POTATOID_CONTROLS }, (_, index) => points[2 + index] ?? { x: 0, y: 0 })
}

export const potatoidFamily: ShapeFamily = {
  kinds: ['potatoid'],
  insert(_kind, start, end) {
    const offsets: Point[] = Array.from({ length: POTATOID_CONTROLS }, () => ({ x: 0, y: 0 }))
    return [start, end, ...offsets]
  },
  handles(_kind, points): TweakHandle[] {
    if (points.length < 2) return []
    const box = normalizeRect(points[0], points[1])
    const offsets = offsetsOf(points)
    return POTATOID_BASE_CONTROLS.map((base, index) => ({
      id: controlId(index),
      point: {
        x: box.x + (base.x + offsets[index].x) * box.width,
        y: box.y + (base.y + offsets[index].y) * box.height,
      },
    }))
  },
  move(_kind, points, id, point) {
    if (points.length < 2) return null
    const index = controlIndex(id)
    if (index < 0) return null
    const box = normalizeRect(points[0], points[1])
    if (box.width === 0 || box.height === 0) return null
    const base = POTATOID_BASE_CONTROLS[index]
    const offset = {
      x: (point.x - box.x) / box.width - base.x,
      y: (point.y - box.y) / box.height - base.y,
    }
    const offsets = offsetsOf(points).map((current, i) => (i === index ? offset : current))
    return [points[0], points[1], ...offsets]
  },
  render(bitmap: Bitmap, _kind: ShapeKind, points: readonly Point[], style: ShapeStyle) {
    if (points.length < 2) return
    const box = normalizeRect(points[0], points[1])
    const offsets = offsetsOf(points)
    const outline = outlineBox(box, style.stroke ? style.width : 1)
    if (style.fill) {
      fillPolygon(bitmap, potatoidOutline(fillBox(outline, style.stroke ? 0 : 0.25), offsets), style.fill)
    }
    if (style.stroke) {
      const polygon = potatoidOutline(outline, offsets)
      if (polygon.length >= 3) {
        drawPolyline(bitmap, [...polygon, polygon[0]], style.width, style.stroke, 'round')
      }
    }
  },
}
