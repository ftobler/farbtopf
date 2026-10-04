import type { Point } from './geometry'
import type { ShapeKind } from './shapes'
import { shapeById } from './shapes'

/** The modifier keys that change how a shape is dragged out. */
export interface DragModifiers {
  /** Shift: a square box, or a line snapped to 45° steps. */
  constrain: boolean
  /** Ctrl (Cmd on a Mac): the drag starts at the shape's centre. */
  fromCentre: boolean
}

export const NO_MODIFIERS: DragModifiers = { constrain: false, fromCentre: false }

export function dragModifiers(event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): DragModifiers {
  return { constrain: event.shiftKey, fromCentre: event.ctrlKey || event.metaKey }
}

/** Lines are snapped by angle, everything else spans a bounding box. */
export type DragMode = 'box' | 'line'

export function dragModeFor(kind: ShapeKind): DragMode {
  return kind === 'line' || shapeById(kind).interaction === 'curve' ? 'line' : 'box'
}

/** Avoids -0, which reads oddly and trips strict equality checks. */
const tidy = (value: number) => value + 0

/** `delta` snapped to the nearest multiple of 45°, keeping its projection on that direction. */
function snapAngle(dx: number, dy: number): Point {
  if (dx === 0 && dy === 0) return { x: 0, y: 0 }
  const step = Math.PI / 4
  const octant = Math.round(Math.atan2(dy, dx) / step)
  const ux = Math.round(Math.cos(octant * step))
  const uy = Math.round(Math.sin(octant * step))
  if (ux !== 0 && uy !== 0) {
    const k = Math.round((dx * ux + dy * uy) / 2)
    return { x: k * ux, y: k * uy }
  }
  return ux !== 0 ? { x: dx, y: 0 } : { x: 0, y: dy }
}

/** `delta` stretched to a square on its larger side, keeping the sign of each axis. */
function square(dx: number, dy: number): Point {
  const side = Math.max(Math.abs(dx), Math.abs(dy))
  return { x: dx < 0 ? -side : side, y: dy < 0 ? -side : side }
}

/**
 * The corners (or ends) of a shape dragged from `start` to `end` under the given
 * modifiers. Shift squares a box or snaps a line to 45°; Ctrl makes `start` the
 * centre (or the midpoint of a line), so the shape grows both ways.
 */
export function constrainDrag(
  start: Point,
  end: Point,
  mode: DragMode,
  modifiers: DragModifiers,
): { start: Point; end: Point } {
  let delta: Point = { x: end.x - start.x, y: end.y - start.y }
  if (modifiers.constrain) delta = mode === 'line' ? snapAngle(delta.x, delta.y) : square(delta.x, delta.y)
  const to = { x: tidy(start.x + delta.x), y: tidy(start.y + delta.y) }
  if (!modifiers.fromCentre) return { start, end: to }
  return { start: { x: tidy(start.x - delta.x), y: tidy(start.y - delta.y) }, end: to }
}

/**
 * The ends of a line whose `grabbed` end is dragged to `point`, `other` being the
 * far end as it was when the handle was grabbed. Shift snaps the line to 45° steps
 * around the end that stays put; Ctrl keeps the line's midpoint where it was, so the
 * other end mirrors the drag (and Shift then snaps around that midpoint).
 */
export function dragLineEnd(
  other: Point,
  grabbed: Point,
  point: Point,
  modifiers: DragModifiers,
): { other: Point; grabbed: Point } {
  const snap = { constrain: modifiers.constrain, fromCentre: false }
  if (!modifiers.fromCentre) return { other, grabbed: constrainDrag(other, point, 'line', snap).end }
  // Worked in doubled coordinates, so a midpoint on a half pixel stays exact.
  const sum = { x: other.x + grabbed.x, y: other.y + grabbed.y }
  const doubled = constrainDrag(sum, { x: 2 * point.x, y: 2 * point.y }, 'line', snap).end
  const end = { x: tidy(Math.round(doubled.x / 2)), y: tidy(Math.round(doubled.y / 2)) }
  return { other: { x: tidy(sum.x - end.x), y: tidy(sum.y - end.y) }, grabbed: end }
}

/**
 * Where a corner handle lands when the box keeps its aspect ratio: `point`
 * projected onto the diagonal from the fixed `anchor` through the handle's
 * original position `corner`, rounded to a pixel.
 */
export function keepAspect(anchor: Point, corner: Point, point: Point): Point {
  const dx = corner.x - anchor.x
  const dy = corner.y - anchor.y
  const length = dx * dx + dy * dy
  if (length === 0) return point
  const t = ((point.x - anchor.x) * dx + (point.y - anchor.y) * dy) / length
  return { x: tidy(Math.round(anchor.x + t * dx)), y: tidy(Math.round(anchor.y + t * dy)) }
}
