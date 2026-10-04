import type { Point, Rect } from './geometry'

/** How far, in image pixels, a box's rotate handle sits above its top edge. */
export const ROTATE_HANDLE_OFFSET = 18

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
 * handle straight above `centre`, growing clockwise.
 */
export function rotationToward(centre: Point, point: Point): number {
  return Math.atan2(point.y - centre.y, point.x - centre.x) + Math.PI / 2
}

/** Where the rotate handle of `box`, turned by `angle` about its centre, sits. */
export function rotateHandlePoint(box: Rect, angle: number): Point {
  const local: Point = { x: box.x + box.width / 2, y: box.y - ROTATE_HANDLE_OFFSET }
  return rotateAround(local, rectCentre(box), angle)
}
