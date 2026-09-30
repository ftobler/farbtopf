import type { Bitmap } from './bitmap'
import type { Rgba } from './color'
import type { Point, Rect } from './geometry'
import { clamp, normalizeRect } from './geometry'
import { bezierPoints, drawBezier, drawEllipse, drawLine, drawPolyline, drawRect, fillPolygon } from './raster'

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
 * - 'curve': click four control points for a cubic bezier (open path).
 */
export type ShapeInteraction = 'drag' | 'polyline' | 'curve'

export interface ShapeDef {
  id: ShapeKind
  label: string
  interaction: ShapeInteraction
  /** Open paths (line, polyline, freeform) have no interior to fill. */
  closed: boolean
}

export const SHAPES: readonly ShapeDef[] = [
  { id: 'line', label: 'Line', interaction: 'drag', closed: false },
  { id: 'polyline', label: 'Polyline', interaction: 'curve', closed: false },
  { id: 'ellipse', label: 'Ellipse', interaction: 'drag', closed: true },
  { id: 'rectangle', label: 'Rectangle', interaction: 'drag', closed: true },
  { id: 'rounded-rectangle', label: 'Rounded rectangle', interaction: 'drag', closed: true },
  { id: 'freeform', label: 'Freeform shape', interaction: 'polyline', closed: false },
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
function roundedRect(box: Rect, bottom: Point[] = [], radius?: number): Point[] {
  const { x, y, width: w, height: h } = box
  const r = radius ?? Math.min(w, h) * 0.2
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
const TAIL_TIP = 0.15
/** Half the tail's base width, as a fraction of the edge it sits on. */
const TAIL_HALF = 0.09
/** Keep the attach point this far from an edge's ends so the tail base stays on the edge. */
const TAIL_BAND = 0.12
/** Half the angular width of an oval callout tail. */
const TAIL_ANGLE = 0.35

type CalloutSide = 'top' | 'right' | 'bottom' | 'left'

function bodyCentre(body: Rect): Point {
  return { x: body.x + body.width / 2, y: body.y + body.height / 2 }
}

/** The edge of `body` nearest the tip, chosen by the dominant axis from the body centre. */
function calloutSide(body: Rect, tip: Point): CalloutSide {
  const centre = bodyCentre(body)
  const dx = tip.x - centre.x
  const dy = tip.y - centre.y
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

/** The clockwise edge of `body` for a side, as [from, to]. */
function calloutEdge(body: Rect, side: CalloutSide): [Point, Point] {
  const right = body.x + body.width
  const bottom = body.y + body.height
  switch (side) {
    case 'top':
      return [{ x: body.x, y: body.y }, { x: right, y: body.y }]
    case 'right':
      return [{ x: right, y: body.y }, { x: right, y: bottom }]
    case 'bottom':
      return [{ x: right, y: bottom }, { x: body.x, y: bottom }]
    default:
      return [{ x: body.x, y: bottom }, { x: body.x, y: body.y }]
  }
}

/**
 * A triangular tail spliced into the clockwise edge from `from` to `to`, following its
 * direction. The two bases straddle the projection of `tip` onto the edge, held inside a
 * central band so the tail never runs off the edge's ends.
 */
function calloutTail(from: Point, to: Point, tip: Point): Point[] {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const t = clamp(((tip.x - from.x) * ux + (tip.y - from.y) * uy) / len, TAIL_BAND, 1 - TAIL_BAND)
  const attach = { x: from.x + dx * t, y: from.y + dy * t }
  const half = TAIL_HALF * len
  return [
    { x: attach.x - ux * half, y: attach.y - uy * half },
    tip,
    { x: attach.x + ux * half, y: attach.y + uy * half },
  ]
}

/** Rectangle body with the tail spliced into the chosen clockwise edge. */
function calloutRect(body: Rect, side: CalloutSide, tail: Point[]): Point[] {
  const { x, y, width: w, height: h } = body
  const corners: Point[] = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]
  const index = { top: 0, right: 1, bottom: 2, left: 3 }[side]
  return [...corners.slice(0, index + 1), ...tail, ...corners.slice(index + 1)]
}

/** Rounded rectangle body with the tail spliced into the flat segment of the chosen edge. */
function calloutRounded(body: Rect, side: CalloutSide, tail: Point[], radius?: number): Point[] {
  const { x, y, width: w, height: h } = body
  const r = radius ?? Math.min(w, h) * 0.2
  const topLeft = arc(x + r, y + r, r, Math.PI)
  const topRight = arc(x + w - r, y + r, r, -Math.PI / 2)
  const bottomRight = arc(x + w - r, y + h - r, r, 0)
  const bottomLeft = arc(x + r, y + h - r, r, Math.PI / 2)
  return [
    ...topLeft,
    ...(side === 'top' ? tail : []),
    ...topRight,
    ...(side === 'right' ? tail : []),
    ...bottomRight,
    ...(side === 'bottom' ? tail : []),
    ...bottomLeft,
    ...(side === 'left' ? tail : []),
  ]
}

/** Oval body with the tail spliced between the ellipse samples around the tip direction. */
function calloutOval(body: Rect, tip: Point): Point[] {
  const { x, y, width: w, height: h } = body
  const cx = x + w / 2
  const cy = y + h / 2
  const rx = w / 2
  const ry = h / 2
  const at = (t: number) => ({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) })
  const mid = Math.atan2(tip.y - cy, tip.x - cx)
  const start = mid - TAIL_ANGLE
  const end = mid + TAIL_ANGLE
  const span = 2 * Math.PI - 2 * TAIL_ANGLE
  const steps = Math.max(3, Math.round(ellipseSegments(body) * (span / (2 * Math.PI))))
  const points: Point[] = [at(start), tip]
  for (let i = 0; i < steps; i += 1) points.push(at(end + (i / steps) * span))
  return points
}

/**
 * The callout body is always the top `CALLOUT_BODY` of `box`, leaving room for a tail
 * below. The tail's origin follows `tip`: it attaches to the side of the body nearest the
 * tip and is spliced into that edge, so the result stays one closed outline with no seam.
 */
export function callout(kind: ShapeKind, box: Rect, tipOverride?: Point): Point[] {
  const { x, y, width: w, height: h } = box
  const body: Rect = { x, y, width: w, height: h * CALLOUT_BODY }
  const tip = tipOverride ?? { x: x + w * TAIL_TIP, y: y + h }
  if (kind === 'callout-oval') return calloutOval(body, tip)
  const side = calloutSide(body, tip)
  const tail = calloutTail(...calloutEdge(body, side), tip)
  if (kind === 'callout-rounded-rectangle') return calloutRounded(body, side, tail)
  return calloutRect(body, side, tail)
}

/**
 * The closed outline of a 'drag' shape filling `box` (continuous coordinates).
 * Returns an empty list for line, polyline and freeform, which have no box outline.
 */
export function shapePolygon(kind: ShapeKind, box: Rect, radius?: number): Point[] {
  const { x, y, width: w, height: h } = box
  const map = boxTransform(box)
  const unit = (points: readonly Point[]) => points.map((p) => map(p.x, p.y))
  switch (kind) {
    case 'rectangle':
      return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]
    case 'rounded-rectangle':
      return roundedRect(box, [], radius)
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
export function outlineBox(rect: Rect, width: number): Rect {
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
export function fillBox(outline: Rect, grow: number): Rect {
  return {
    x: outline.x + 0.5 - grow,
    y: outline.y + 0.5 - grow,
    width: outline.width + 2 * grow,
    height: outline.height + 2 * grow,
  }
}

/** Directed right triangle: `start` is a hypotenuse end, the right angle sits at (start.x, end.y). */
function rightTrianglePolygon(box: Rect, start: Point): Point[] {
  const map = boxTransform(box)
  const atRight = start.x > box.x + box.width / 2
  const atBottom = start.y > box.y + box.height / 2
  const sx = atRight ? 1 : 0
  const sy = atBottom ? 1 : 0
  return [map(sx, sy), map(sx, atBottom ? 0 : 1), map(atRight ? 0 : 1, atBottom ? 0 : 1)]
}

function strokeClosed(bitmap: Bitmap, points: readonly Point[], style: ShapeStyle): void {
  if (!style.stroke || points.length === 0) return
  drawPolyline(bitmap, [...points, points[0]], style.width, style.stroke, 'round')
}

/**
 * The four cubic bezier control points for a 'polyline' shape, tolerating short
 * input: fewer than two points has no curve, two gives the straight chord, and
 * three treats the middle point as a quadratic control converted to cubic.
 */
function bezierControl(points: readonly Point[]): [Point, Point, Point, Point] | null {
  if (points.length < 2) return null
  const p0 = points[0]
  const p3 = points[points.length - 1]
  if (points.length === 2) return [p0, p0, p3, p3]
  if (points.length === 3) {
    const c = points[1]
    return [
      p0,
      { x: p0.x + (2 / 3) * (c.x - p0.x), y: p0.y + (2 / 3) * (c.y - p0.y) },
      { x: p3.x + (2 / 3) * (c.x - p3.x), y: p3.y + (2 / 3) * (c.y - p3.y) },
      p3,
    ]
  }
  return [points[0], points[1], points[2], points[3]]
}

/**
 * Draws a shape onto `bitmap`. For 'drag' shapes `points` is [start, end] of the
 * dragged box; for 'freeform' it is the list of vertices of an open path; for
 * 'polyline' it is the four cubic bezier control points [p0, c1, c2, p3].
 */
export function renderShape(bitmap: Bitmap, kind: ShapeKind, points: readonly Point[], style: ShapeStyle): void {
  if (points.length === 0) return
  const start = points[0]
  const end = points[points.length - 1]
  if (kind === 'line') {
    if (style.stroke) drawLine(bitmap, start, end, style.width, style.stroke, 'round')
    return
  }
  if (kind === 'freeform') {
    if (style.stroke) drawPolyline(bitmap, [...points], style.width, style.stroke, 'round')
    return
  }
  if (kind === 'polyline') {
    if (!style.stroke) return
    const control = bezierControl(points)
    if (control) drawBezier(bitmap, control, style.width, style.stroke)
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
  const polygon = (box: Rect) =>
    kind === 'right-triangle' ? rightTrianglePolygon(box, start) : shapePolygon(kind, box)
  if (style.fill) fillPolygon(bitmap, polygon(fillBox(outline, style.stroke ? 0 : 0.25)), style.fill)
  if (style.stroke) strokeClosed(bitmap, polygon(outline), style)
}

const POLYLINE_ICON: readonly Point[] = [
  { x: 0, y: 1 },
  { x: 0.3, y: 0.2 },
  { x: 0.55, y: 0.75 },
  { x: 0.8, y: 0 },
  { x: 1, y: 0.55 },
]

/** Cubic control points for a smooth S-curve, sampled into polyline icon points. */
const CURVE_CONTROL: readonly [Point, Point, Point, Point] = [
  { x: 0, y: 1 },
  { x: 0, y: 0 },
  { x: 1, y: 1 },
  { x: 1, y: 0 },
]

const CURVE_ICON: readonly Point[] = bezierPoints(CURVE_CONTROL, 16)

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
  if (kind === 'polyline') return pathData(CURVE_ICON.map((p) => map(p.x, p.y)), false)
  if (kind === 'freeform') return pathData(POLYLINE_ICON.map((p) => map(p.x, p.y)), false)
  return pathData(shapePolygon(kind, box), true)
}
