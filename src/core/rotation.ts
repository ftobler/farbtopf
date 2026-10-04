import type { Point, Rect } from './geometry'

/** How far, in image pixels, a box's rotate handle sits outside its edge. */
export const ROTATE_HANDLE_OFFSET = 18

/**
 * Which edge of an upright box the rotate handle sits beyond: above the top
 * (shapes) or left of the left edge (the text box, whose toolbar sits above).
 */
export type RotateHandleSide = 'top' | 'left'

export function rectCentre(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

/** `point` turned by `angle` radians about `centre`; positive turns clockwise on screen. */
export function rotateAround(point: Point, centre: Point, angle: number): Point {
  if (angle === 0) return point
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = point.x - centre.x
  const dy = point.y - centre.y
  return { x: centre.x + dx * cos - dy * sin, y: centre.y + dx * sin + dy * cos }
}

/** Undoes {@link rotateAround}: maps a point on a turned box back into its upright frame. */
export function unrotateAround(point: Point, centre: Point, angle: number): Point {
  return rotateAround(point, centre, -angle)
}

/**
 * The angle a box takes when its rotate handle is dragged to `point`: 0 with the
 * handle straight out from `centre` on its `side` (above, or to the left), growing
 * clockwise. A left handle's angle stays within (-π, π], so it is 0 at rest.
 */
export function rotationToward(centre: Point, point: Point, side: RotateHandleSide = 'top'): number {
  const dx = point.x - centre.x
  const dy = point.y - centre.y
  // Measured from the handle's own direction: up is -π/2, left is π (taken as
  // atan2 of the reversed vector so the result needs no wrapping; `0 - dy` rather
  // than `-dy` so a pointer level with the centre gives π, not -π).
  return side === 'left' ? Math.atan2(0 - dy, 0 - dx) : Math.atan2(dy, dx) + Math.PI / 2
}

/** Where the rotate handle of `box`, turned by `angle` about its centre, sits. */
export function rotateHandlePoint(box: Rect, angle: number, side: RotateHandleSide = 'top'): Point {
  const local: Point =
    side === 'left'
      ? { x: box.x - ROTATE_HANDLE_OFFSET, y: box.y + box.height / 2 }
      : { x: box.x + box.width / 2, y: box.y - ROTATE_HANDLE_OFFSET }
  return rotateAround(local, rectCentre(box), angle)
}
