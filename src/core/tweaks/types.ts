import type { Bitmap } from '../bitmap'
import type { Point } from '../geometry'
import type { ShapeKind, ShapeStyle } from '../shapes'

export interface TweakHandle {
  /** Kind-scoped handle name, e.g. 'nw', 'e', 'v0', 'c1', 'radius'. */
  id: string
  /** Handle position in continuous image space. */
  point: Point
}

export interface ShapeFamily {
  readonly kinds: readonly ShapeKind[]
  /** Anchor points for a freshly dragged box. */
  insert(kind: ShapeKind, start: Point, end: Point): Point[]
  /** Draggable handles for the current anchors. */
  handles(kind: ShapeKind, points: readonly Point[]): TweakHandle[]
  /** New anchors after dragging handle `id` to `point`; null means "ignore". */
  move(kind: ShapeKind, points: readonly Point[], id: string, point: Point): Point[] | null
  /** Draws the shape for the current anchors. */
  render(bitmap: Bitmap, kind: ShapeKind, points: readonly Point[], style: ShapeStyle): void
}
