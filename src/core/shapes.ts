import type { Bitmap } from './bitmap'
import type { Rgba } from './color'
import type { Point, Rect } from './geometry'
import { normalizeRect } from './geometry'
import { drawEllipse, drawLine, drawPolyline, drawRect, fillPolygon } from './raster'

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

type Transform = (u: number, v: number) => Point

function boxTransform(box: Rect): Transform {
  return (u, v) => ({ x: box.x + u * box.width, y: box.y + v * box.height })
}

/** Unit-space points stretched so their bounding box fills the unit square. */
function stretchToUnit(points: Point[]): Point[] {
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

function star(tips: number, innerRatio: number): Point[] {
  const points: Point[] = []
  for (let i = 0; i < tips * 2; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / tips
    const r = i % 2 === 0 ? 1 : innerRatio
    points.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) })
  }
  return stretchToUnit(points)
}

/** Block arrow pointing towards +u; v runs across the arrow. */
const ARROW: readonly Point[] = [
  { x: 0, y: 0.25 },
  { x: 0.5, y: 0.25 },
  { x: 0.5, y: 0 },
  { x: 1, y: 0.5 },
  { x: 0.5, y: 1 },
  { x: 0.5, y: 0.75 },
  { x: 0, y: 0.75 },
]

function arcSegments(radius: number): number {
  return Math.min(32, Math.max(3, Math.ceil(radius / 2)))
}

/** Clockwise corner arc around (cx, cy) from `from` radians over a quarter turn. */
function arc(cx: number, cy: number, r: number, from: number): Point[] {
  const n = arcSegments(r)
  const points: Point[] = []
  for (let i = 0; i <= n; i += 1) {
    const angle = from + (i / n) * (Math.PI / 2)
    points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
  }
  return points
}

/** Rounded rectangle, clockwise from the top-left arc; `bottom` is spliced into the bottom edge (right to left). */
function roundedRect(box: Rect, bottom: Point[] = []): Point[] {
  const { x, y, width: w, height: h } = box
  const r = Math.min(w, h) * 0.2
  return [
    ...arc(x + r, y + r, r, Math.PI),
    ...arc(x + w - r, y + r, r, -Math.PI / 2),
    ...arc(x + w - r, y + h - r, r, 0),
    ...bottom,
    ...arc(x + r, y + h - r, r, Math.PI / 2),
  ]
}

function ellipseSegments(box: Rect): number {
  return Math.min(128, Math.max(24, Math.ceil((box.width + box.height) / 2)))
}

const CALLOUT_BODY = 0.78
const TAIL_START = 0.42
const TAIL_END = 0.25
const TAIL_TIP = 0.15

function callout(kind: ShapeKind, box: Rect): Point[] {
  const { x, y, width: w, height: h } = box
  const body: Rect = { x, y, width: w, height: h * CALLOUT_BODY }
  const bodyBottom = y + body.height
  const tip = { x: x + w * TAIL_TIP, y: y + h }
  if (kind === 'callout-oval') {
    const cx = x + w / 2
    const cy = y + body.height / 2
    const rx = w / 2
    const ry = body.height / 2
    const t0 = Math.acos((TAIL_START - 0.5) * 2)
    const t1 = Math.acos((TAIL_END - 0.5) * 2)
    const at = (t: number) => ({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) })
    const n = ellipseSegments(body)
    const points: Point[] = []
    let tail = false
    for (let i = 0; i < n; i += 1) {
      const t = (i / n) * 2 * Math.PI
      if (t >= t0 && !tail) {
        points.push(at(t0), tip, at(t1))
        tail = true
      }
      if (t < t0 || t > t1) points.push(at(t))
    }
    return points
  }
  const tail = [{ x: x + w * TAIL_START, y: bodyBottom }, tip, { x: x + w * TAIL_END, y: bodyBottom }]
  if (kind === 'callout-rounded-rectangle') return roundedRect(body, tail)
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: bodyBottom },
    ...tail,
    { x, y: bodyBottom },
  ]
}

/**
 * The closed outline of a 'drag' shape filling `box` (continuous coordinates).
 * Returns an empty list for line, polyline and freeform, which have no box outline.
 */
export function shapePolygon(kind: ShapeKind, box: Rect): Point[] {
  const { x, y, width: w, height: h } = box
  const map = boxTransform(box)
  const unit = (points: readonly Point[]) => points.map((p) => map(p.x, p.y))
  switch (kind) {
    case 'rectangle':
      return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]
    case 'rounded-rectangle':
      return roundedRect(box)
    case 'ellipse': {
      const n = ellipseSegments(box)
      const points: Point[] = []
      for (let i = 0; i < n; i += 1) {
        const t = (i / n) * 2 * Math.PI
        points.push(map(0.5 + 0.5 * Math.cos(t), 0.5 + 0.5 * Math.sin(t)))
      }
      return points
    }
    case 'triangle':
      return unit([{ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])
    case 'right-triangle':
      return unit([{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }])
    case 'diamond':
      return unit([{ x: 0.5, y: 0 }, { x: 1, y: 0.5 }, { x: 0.5, y: 1 }, { x: 0, y: 0.5 }])
    case 'pentagon':
      return unit(regularPolygon(5))
    case 'heptagon':
      return unit(regularPolygon(7))
    case 'arrow-right':
      return ARROW.map((p) => map(p.x, p.y))
    case 'arrow-left':
      return ARROW.map((p) => map(1 - p.x, p.y))
    case 'arrow-down':
      return ARROW.map((p) => map(p.y, p.x))
    case 'arrow-up':
      return ARROW.map((p) => map(p.y, 1 - p.x))
    case 'star-4':
      return unit(star(4, 0.4))
    case 'star-5':
      return unit(star(5, 0.4))
    case 'star-6':
      return unit(star(6, 0.5))
    case 'callout-rectangle':
    case 'callout-rounded-rectangle':
    case 'callout-oval':
      return callout(kind, box)
    default:
      return []
  }
}

/** The polygon through pixel centres used for the outline, inset so a thick stroke stays inside `rect`. */
function outlineBox(rect: Rect, width: number): Rect {
  const t = Math.max(1, Math.floor(width))
  const before = Math.floor((t - 1) / 2)
  const after = t - 1 - before
  let x0 = rect.x + before
  let x1 = rect.x + rect.width - 1 - after
  let y0 = rect.y + before
  let y1 = rect.y + rect.height - 1 - after
  if (x1 < x0) x0 = x1 = rect.x + (rect.width - 1) / 2
  if (y1 < y0) y0 = y1 = rect.y + (rect.height - 1) / 2
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

/**
 * Continuous fill area matching an outline through pixel centres. Without a stroke it is
 * grown slightly so the edge pixels are kept; with one the stroke covers the edge.
 */
function fillBox(outline: Rect, grow: number): Rect {
  return {
    x: outline.x + 0.5 - grow,
    y: outline.y + 0.5 - grow,
    width: outline.width + 2 * grow,
    height: outline.height + 2 * grow,
  }
}

function strokeClosed(bitmap: Bitmap, points: readonly Point[], style: ShapeStyle): void {
  if (!style.stroke || points.length === 0) return
  drawPolyline(bitmap, [...points, points[0]], style.width, style.stroke, 'round')
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
  if (kind === 'polyline') {
    if (style.stroke) drawPolyline(bitmap, [...points], style.width, style.stroke, 'round')
    return
  }
  if (kind === 'freeform') {
    if (style.fill) fillPolygon(bitmap, points.map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 })), style.fill)
    strokeClosed(bitmap, points, style)
    return
  }
  const rect = normalizeRect(start, end)
  if (kind === 'ellipse') {
    if (style.fill) drawEllipse(bitmap, rect, 1, style.fill, true)
    if (style.stroke) drawEllipse(bitmap, rect, style.width, style.stroke, false)
    return
  }
  if (kind === 'rectangle') {
    if (style.fill) drawRect(bitmap, rect, 1, style.fill, true)
    if (style.stroke) drawRect(bitmap, rect, style.width, style.stroke, false)
    return
  }
  const outline = outlineBox(rect, style.stroke ? style.width : 1)
  if (style.fill) fillPolygon(bitmap, shapePolygon(kind, fillBox(outline, style.stroke ? 0 : 0.25)), style.fill)
  if (style.stroke) strokeClosed(bitmap, shapePolygon(kind, outline), style)
}

const FREEFORM_ICON: readonly Point[] = [
  { x: 0.15, y: 0.3 },
  { x: 0.45, y: 0.05 },
  { x: 0.7, y: 0.25 },
  { x: 0.95, y: 0.15 },
  { x: 0.85, y: 0.6 },
  { x: 1, y: 0.9 },
  { x: 0.5, y: 0.95 },
  { x: 0.3, y: 0.7 },
  { x: 0, y: 0.8 },
]

const POLYLINE_ICON: readonly Point[] = [
  { x: 0, y: 1 },
  { x: 0.3, y: 0.2 },
  { x: 0.55, y: 0.75 },
  { x: 0.8, y: 0 },
  { x: 1, y: 0.55 },
]

function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100)
}

function pathData(points: readonly Point[], closed: boolean): string {
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${formatNumber(p.x)} ${formatNumber(p.y)}`).join('')
  return closed ? `${d}Z` : d
}

/** SVG path data for the shape's gallery icon inside a `size`×`size` box. */
export function shapeIconPath(kind: ShapeKind, size = 24): string {
  const m = size * 0.12
  const box: Rect = { x: m, y: m, width: size - 2 * m, height: size - 2 * m }
  const map = boxTransform(box)
  if (kind === 'line') return pathData([map(0, 1), map(1, 0)], false)
  if (kind === 'polyline') return pathData(POLYLINE_ICON.map((p) => map(p.x, p.y)), false)
  if (kind === 'freeform') return pathData(FREEFORM_ICON.map((p) => map(p.x, p.y)), true)
  return pathData(shapePolygon(kind, box), true)
}
