import type { Bitmap } from './bitmap'
import type { Rgba } from './color'
import type { Point } from './geometry'
import { normalizeRect } from './geometry'
import { drawEllipse, drawLine, drawPolyline, drawRect } from './raster'

export type ShapeKind =
  | 'line'
  | 'polyline'
  | 'ellipse'
  | 'rectangle'
  | 'rounded-rectangle'
  | 'freeform'
  | 'triangle'
  | 'right-triangle'
  | 'diamond'
  | 'pentagon'
  | 'heptagon'
  | 'arrow-left'
  | 'arrow-right'
  | 'arrow-up'
  | 'arrow-down'
  | 'star-4'
  | 'star-5'
  | 'star-6'
  | 'callout-rectangle'
  | 'callout-rounded-rectangle'
  | 'callout-oval'

/**
 * How a shape is drawn with the pointer:
 * - 'drag': press, drag a bounding box, release.
 * - 'polyline': click to add vertices; double-click or Enter finishes (open path).
 * - 'freehand': press and drag a free outline; releasing closes it.
 */
export type ShapeInteraction = 'drag' | 'polyline' | 'freehand'

export interface ShapeDef {
  id: ShapeKind
  label: string
  interaction: ShapeInteraction
  /** Open paths (line, polyline) have no interior to fill. */
  closed: boolean
}

export const SHAPES: readonly ShapeDef[] = [
  { id: 'line', label: 'Line', interaction: 'drag', closed: false },
  { id: 'polyline', label: 'Polyline', interaction: 'polyline', closed: false },
  { id: 'ellipse', label: 'Ellipse', interaction: 'drag', closed: true },
  { id: 'rectangle', label: 'Rectangle', interaction: 'drag', closed: true },
  { id: 'rounded-rectangle', label: 'Rounded rectangle', interaction: 'drag', closed: true },
  { id: 'freeform', label: 'Freeform shape', interaction: 'freehand', closed: true },
  { id: 'triangle', label: 'Triangle', interaction: 'drag', closed: true },
  { id: 'right-triangle', label: 'Right triangle', interaction: 'drag', closed: true },
  { id: 'diamond', label: 'Diamond', interaction: 'drag', closed: true },
  { id: 'pentagon', label: 'Pentagon', interaction: 'drag', closed: true },
  { id: 'heptagon', label: 'Heptagon', interaction: 'drag', closed: true },
  { id: 'arrow-left', label: 'Left arrow', interaction: 'drag', closed: true },
  { id: 'arrow-right', label: 'Right arrow', interaction: 'drag', closed: true },
  { id: 'arrow-up', label: 'Up arrow', interaction: 'drag', closed: true },
  { id: 'arrow-down', label: 'Down arrow', interaction: 'drag', closed: true },
  { id: 'star-4', label: 'Four-point star', interaction: 'drag', closed: true },
  { id: 'star-5', label: 'Five-point star', interaction: 'drag', closed: true },
  { id: 'star-6', label: 'Six-point star', interaction: 'drag', closed: true },
  { id: 'callout-rectangle', label: 'Rectangular callout', interaction: 'drag', closed: true },
  { id: 'callout-rounded-rectangle', label: 'Rounded rectangular callout', interaction: 'drag', closed: true },
  { id: 'callout-oval', label: 'Oval callout', interaction: 'drag', closed: true },
]

export function shapeById(id: ShapeKind): ShapeDef {
  const found = SHAPES.find((shape) => shape.id === id)
  if (!found) throw new Error(`Unknown shape: ${id}`)
  return found
}

export interface ShapeStyle {
  /** Outline / line thickness in pixels. */
  width: number
  /** Outline colour, or null to draw no outline. */
  stroke: Rgba | null
  /** Interior colour, or null to leave the interior empty. Ignored for open shapes. */
  fill: Rgba | null
}

/**
 * Draws a shape onto `bitmap`. For 'drag' shapes `points` is [start, end] of the
 * dragged box; for 'polyline' and 'freehand' shapes it is the list of vertices.
 */
export function renderShape(bitmap: Bitmap, kind: ShapeKind, points: readonly Point[], style: ShapeStyle): void {
  if (points.length === 0) return
  const start = points[0]
  const end = points[points.length - 1]
  if (kind === 'line') {
    if (style.stroke) drawLine(bitmap, start, end, style.width, style.stroke, 'round')
    return
  }
  if (kind === 'polyline' || kind === 'freeform') {
    if (style.stroke) drawPolyline(bitmap, [...points], style.width, style.stroke, 'round')
    return
  }
  const rect = normalizeRect(start, end)
  if (kind === 'ellipse') {
    if (style.fill) drawEllipse(bitmap, rect, 1, style.fill, true)
    if (style.stroke) drawEllipse(bitmap, rect, style.width, style.stroke, false)
    return
  }
  // TODO: every other shape; the rectangle stands in until then.
  if (style.fill) drawRect(bitmap, rect, 1, style.fill, true)
  if (style.stroke) drawRect(bitmap, rect, style.width, style.stroke, false)
}

/** SVG path data for the shape's gallery icon inside a `size`×`size` box. */
export function shapeIconPath(kind: ShapeKind, size = 24): string {
  const m = size * 0.15
  const n = size - m
  if (kind === 'line') return `M${m} ${n}L${n} ${m}`
  return `M${m} ${m}H${n}V${n}H${m}Z`
}
