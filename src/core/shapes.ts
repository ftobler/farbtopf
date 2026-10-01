import type { Bitmap } from './bitmap'
import type { Rgba } from './color'
import type { Point, Rect } from './geometry'
import { normalizeRect } from './geometry'
import { bezierPoints, drawBezier, drawEllipse, drawLine, drawPolyline, drawRect, fillPolygon } from './raster'

export type ShapeKind =
  | 'line'
  | 'polyline'
  | 'ellipse'
  | 'potatoid'
  | 'rectangle'
  | 'rounded-rectangle'
  | 'freeform'
  | 'triangle'
  | 'right-triangle'
  | 'diamond'
  | 'pentagon'
  | 'heptagon'
  | 'arrow'
  | 'arrow-double'
  | 'arrow-axis'
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
  { id: 'potatoid', label: 'Potatoid', interaction: 'drag', closed: true },
  { id: 'rectangle', label: 'Rectangle', interaction: 'drag', closed: true },
  { id: 'rounded-rectangle', label: 'Rounded rectangle', interaction: 'drag', closed: true },
  { id: 'freeform', label: 'Freeform shape', interaction: 'polyline', closed: false },
  { id: 'triangle', label: 'Triangle', interaction: 'drag', closed: true },
  { id: 'right-triangle', label: 'Right triangle', interaction: 'drag', closed: true },
  { id: 'diamond', label: 'Diamond', interaction: 'drag', closed: true },
  { id: 'pentagon', label: 'Pentagon', interaction: 'drag', closed: true },
  { id: 'heptagon', label: 'Heptagon', interaction: 'drag', closed: true },
  { id: 'arrow', label: 'Arrow', interaction: 'drag', closed: true },
  { id: 'arrow-double', label: 'Double arrow', interaction: 'drag', closed: true },
  { id: 'arrow-axis', label: '90° arrow', interaction: 'drag', closed: true },
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

/** How many draggable control points shape a potatoid. */
export const POTATOID_CONTROLS = 5
const POTATOID_START = -Math.PI / 2 + Math.PI / POTATOID_CONTROLS
const POTATOID_STEP = (2 * Math.PI) / POTATOID_CONTROLS
/** Outline samples per control span; the curve is smooth, this only controls how finely it is traced. */
const POTATOID_SAMPLES = 16
/** A gentle asymmetric wobble so a fresh potatoid already reads as a potato, not an ellipse. */
const POTATOID_WOBBLE = [1.25, 0.82, 1.15, 0.85, 1.2]

/**
 * A closed uniform cubic B-spline through `control`, sampled `samples` times per span.
 * Being a B-spline it is smooth everywhere, so dragging a control can never leave a
 * corner or a cusp behind, and it always stays inside the control polygon.
 */
function closedBSpline(control: readonly Point[], samples: number): Point[] {
  const n = control.length
  const points: Point[] = []
  const at = (index: number) => control[((index % n) + n) % n]
  for (let i = 0; i < n; i += 1) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    for (let s = 0; s < samples; s += 1) {
      const t = s / samples
      const t2 = t * t
      const t3 = t2 * t
      const b0 = (1 - t) ** 3
      const b1 = 3 * t3 - 6 * t2 + 4
      const b2 = -3 * t3 + 3 * t2 + 3 * t + 1
      const b3 = t3
      points.push({
        x: (b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x) / 6,
        y: (b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y) / 6,
      })
    }
  }
  return points
}

/** Unit-square control points whose smooth outline wraps the unit square exactly. */
export const POTATOID_BASE_CONTROLS: readonly Point[] = (() => {
  const raw: Point[] = []
  for (let i = 0; i < POTATOID_CONTROLS; i += 1) {
    const angle = POTATOID_START + i * POTATOID_STEP
    const r = POTATOID_WOBBLE[i]
    raw.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) })
  }
  const outline = closedBSpline(raw, 32)
  const xs = outline.map((p) => p.x)
  const ys = outline.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const spanX = Math.max(...xs) - minX || 1
  const spanY = Math.max(...ys) - minY || 1
  return raw.map((p) => ({ x: (p.x - minX) / spanX, y: (p.y - minY) / spanY }))
})()

/**
 * The smooth potatoid outline filling `box`. `offsets` nudge each control point in
 * unit space; the B-spline turns those nudges into gentle bulges and dents.
 */
export function potatoidOutline(box: Rect, offsets: readonly Point[] = []): Point[] {
  const map = boxTransform(box)
  const control = POTATOID_BASE_CONTROLS.map((point, index) => ({
    x: point.x + (offsets[index]?.x ?? 0),
    y: point.y + (offsets[index]?.y ?? 0),
  }))
  return closedBSpline(control, POTATOID_SAMPLES).map((point) => map(point.x, point.y))
}

/** Block arrow pointing towards +u; v runs across the arrow. */
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
/** Half the tail's width where it starts at the body centre, as a fraction of the body's smaller side. */
const TAIL_HALF = 0.2
/** The oval callout's wider tail start, since its curved sides pinch in towards the tip. */
const TAIL_HALF_OVAL = 0.28
/** Where an oval tail side's curve control sits, as a fraction of the tail's starting half-width. */
const TAIL_PINCH = 0.25
/** Samples along each curved side of an oval callout's tail. */
const TAIL_CURVE_SAMPLES = 16

function bodyCentre(body: Rect): Point {
  return { x: body.x + body.width / 2, y: body.y + body.height / 2 }
}

/** The callout body's clockwise outline. */
function calloutBody(kind: ShapeKind, body: Rect): Point[] {
  const { x, y, width: w, height: h } = body
  if (kind === 'callout-rounded-rectangle') return roundedRect(body)
  if (kind === 'callout-oval') {
    const segments = ellipseSegments(body)
    const points: Point[] = []
    for (let i = 0; i < segments; i += 1) {
      const t = (i / segments) * 2 * Math.PI
      points.push({ x: x + w / 2 + (w / 2) * Math.cos(t), y: y + h / 2 + (h / 2) * Math.sin(t) })
    }
    return points
  }
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]
}

/** Where a tail side leaves the body: the crossing's position along the outline (edge index + fraction) and along the side. */
interface TailExit {
  outline: number
  side: number
  point: Point
}

/** The last crossing of the polyline `side` with the closed `outline`, or null when it never leaves. */
function tailExit(outline: Point[], side: Point[]): TailExit | null {
  let exit: TailExit | null = null
  for (let i = 0; i < side.length - 1; i += 1) {
    const a = side[i]
    const b = side[i + 1]
    for (let j = 0; j < outline.length; j += 1) {
      const c = outline[j]
      const d = outline[(j + 1) % outline.length]
      const denom = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x)
      if (denom === 0) continue
      const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / denom
      const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / denom
      if (t < 0 || t > 1 || u < 0 || u > 1) continue
      if (exit && i + t <= exit.side) continue
      exit = { outline: j + u, side: i + t, point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t } }
    }
  }
  return exit
}

/** The outline vertices passed walking clockwise from position `from` to position `to`. */
function walkOutline(outline: Point[], from: number, to: number): Point[] {
  const n = outline.length
  const span = (to - from + n) % n
  const points: Point[] = []
  for (let k = Math.floor(from) + 1; k - from < span; k += 1) points.push(outline[k % n])
  return points
}

/** A tail side from `base` to `tip`, bent towards `control` (straight without one). */
function tailSide(base: Point, tip: Point, control?: Point): Point[] {
  if (!control) return [base, tip]
  const points: Point[] = []
  for (let i = 0; i <= TAIL_CURVE_SAMPLES; i += 1) {
    const t = i / TAIL_CURVE_SAMPLES
    const a = (1 - t) * (1 - t)
    const b = 2 * (1 - t) * t
    const c = t * t
    points.push({ x: a * base.x + b * control.x + c * tip.x, y: a * base.y + b * control.y + c * tip.y })
  }
  return points
}

/**
 * The callout body is always the top `CALLOUT_BODY` of `box`, leaving room for a tail
 * below. The tail is a wedge running from the body centre to `tip`, merged with the body
 * into one closed outline with no seam, so it leaves the body wherever the tip points,
 * corners included. The oval's tail has rounded, inward-curving sides.
 */
export function callout(kind: ShapeKind, box: Rect, tipOverride?: Point): Point[] {
  const { x, y, width: w, height: h } = box
  const body: Rect = { x, y, width: w, height: h * CALLOUT_BODY }
  const tip = tipOverride ?? { x: x + w * TAIL_TIP, y: y + h }
  const outline = calloutBody(kind, body)
  const centre = bodyCentre(body)
  const length = Math.hypot(tip.x - centre.x, tip.y - centre.y)
  if (length === 0) return outline
  const dir = { x: (tip.x - centre.x) / length, y: (tip.y - centre.y) / length }
  const perp = { x: -dir.y, y: dir.x }
  const round = kind === 'callout-oval'
  const half = (round ? TAIL_HALF_OVAL : TAIL_HALF) * Math.min(body.width, body.height)
  const middle = { x: (centre.x + tip.x) / 2, y: (centre.y + tip.y) / 2 }
  // The oval's tail sides curve inwards, so it flares smoothly out of the body and tapers to the tip.
  const side = (sign: number) =>
    tailSide(
      { x: centre.x + perp.x * sign * half, y: centre.y + perp.y * sign * half },
      tip,
      round ? { x: middle.x + perp.x * sign * half * TAIL_PINCH, y: middle.y + perp.y * sign * half * TAIL_PINCH } : undefined,
    )
  const left = side(1)
  const right = side(-1)
  const leftExit = tailExit(outline, left)
  const rightExit = tailExit(outline, right)
  if (!leftExit || !rightExit) return outline
  // Walk the body the long way round, from one exit to the other, skipping the stretch the tail covers.
  const ray = tailExit(outline, [centre, tip])
  const n = outline.length
  const covers = (from: TailExit, to: TailExit) =>
    ray !== null && (ray.outline - from.outline + n) % n < (to.outline - from.outline + n) % n
  const [first, second, firstSide, secondSide] = covers(leftExit, rightExit)
    ? [rightExit, leftExit, right, left]
    : [leftExit, rightExit, left, right]
  const outward = (side: Point[], exit: TailExit) => [exit.point, ...side.slice(Math.floor(exit.side) + 1, -1)]
  return [
    first.point,
    ...walkOutline(outline, first.outline, second.outline),
    ...outward(secondSide, second),
    tip,
    ...outward(firstSide, first).slice(1).reverse(),
  ]
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
    case 'potatoid':
      return potatoidOutline(box)
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

/** Unit-space outline of a line-arrow from `tail` to `tip` with shaft thickness `t`. */
function unitArrowPolygon(tail: Point, tip: Point, t: number, doubleHeaded: boolean): Point[] {
  const dx = tip.x - tail.x
  const dy = tip.y - tail.y
  const length = Math.hypot(dx, dy) || 1
  const dir = { x: dx / length, y: dy / length }
  const perp = { x: -dir.y, y: dir.x }
  const shaftHalf = t / 2
  const headHalf = 1.5 * t
  const headLen = Math.min(3 * t, (doubleHeaded ? 0.45 : 0.9) * length)
  const base = { x: tip.x - dir.x * headLen, y: tip.y - dir.y * headLen }
  const head: Point[] = [
    { x: base.x + perp.x * shaftHalf, y: base.y + perp.y * shaftHalf },
    { x: base.x + perp.x * headHalf, y: base.y + perp.y * headHalf },
    tip,
    { x: base.x - perp.x * headHalf, y: base.y - perp.y * headHalf },
    { x: base.x - perp.x * shaftHalf, y: base.y - perp.y * shaftHalf },
  ]
  if (!doubleHeaded) {
    return [
      { x: tail.x + perp.x * shaftHalf, y: tail.y + perp.y * shaftHalf },
      ...head,
      { x: tail.x - perp.x * shaftHalf, y: tail.y - perp.y * shaftHalf },
    ]
  }
  const tailBase = { x: tail.x + dir.x * headLen, y: tail.y + dir.y * headLen }
  return [
    tail,
    { x: tailBase.x + perp.x * headHalf, y: tailBase.y + perp.y * headHalf },
    { x: tailBase.x + perp.x * shaftHalf, y: tailBase.y + perp.y * shaftHalf },
    { x: base.x + perp.x * shaftHalf, y: base.y + perp.y * shaftHalf },
    { x: base.x + perp.x * headHalf, y: base.y + perp.y * headHalf },
    tip,
    { x: base.x - perp.x * headHalf, y: base.y - perp.y * headHalf },
    { x: base.x - perp.x * shaftHalf, y: base.y - perp.y * shaftHalf },
    { x: tailBase.x - perp.x * shaftHalf, y: tailBase.y - perp.y * shaftHalf },
    { x: tailBase.x - perp.x * headHalf, y: tailBase.y - perp.y * headHalf },
  ]
}

/** Scales `points` uniformly to fit inside `box`, centred, preserving aspect ratio. */
function fitToBox(points: readonly Point[], box: Rect): Point[] {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const spanX = Math.max(...xs) - minX || 1
  const spanY = Math.max(...ys) - minY || 1
  const scale = Math.min(box.width / spanX, box.height / spanY)
  const offsetX = box.x + (box.width - spanX * scale) / 2
  const offsetY = box.y + (box.height - spanY * scale) / 2
  return points.map((p) => ({ x: offsetX + (p.x - minX) * scale, y: offsetY + (p.y - minY) * scale }))
}

/** SVG path data for the shape's gallery icon inside a `size`×`size` box. */
export function shapeIconPath(kind: ShapeKind, size = 24): string {
  const m = size * 0.12
  const box: Rect = { x: m, y: m, width: size - 2 * m, height: size - 2 * m }
  const map = boxTransform(box)
  if (kind === 'line') return pathData([map(0, 1), map(1, 0)], false)
  if (kind === 'polyline') return pathData(CURVE_ICON.map((p) => map(p.x, p.y)), false)
  if (kind === 'freeform') return pathData(POLYLINE_ICON.map((p) => map(p.x, p.y)), false)
  if (kind === 'arrow' || kind === 'arrow-double' || kind === 'arrow-axis') {
    const axis = kind === 'arrow-axis'
    const tail: Point = axis ? { x: 0, y: 0.5 } : { x: 0, y: 1 }
    const tip: Point = axis ? { x: 1, y: 0.5 } : { x: 1, y: 0 }
    const arrow = unitArrowPolygon(tail, tip, 0.16, kind === 'arrow-double')
    return pathData(fitToBox(arrow, box), true)
  }
  return pathData(shapePolygon(kind, box), true)
}
