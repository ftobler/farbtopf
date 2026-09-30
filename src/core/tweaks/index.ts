import type { Bitmap } from '../bitmap'
import type { Point } from '../geometry'
import type { ShapeKind, ShapeStyle } from '../shapes'
import { renderShape } from '../shapes'
import { arrowFamily } from './arrows'
import { boxFamily } from './box'
import { calloutFamily } from './callouts'
import { curveFamily } from './curve'
import { polygonFamily } from './polygons'
import { potatoidFamily } from './potatoid'
import { regularFamily } from './regular'
import { starFamily } from './stars'
import type { ShapeFamily, TweakHandle } from './types'

export type { ShapeFamily, TweakHandle } from './types'

const families = new Map<ShapeKind, ShapeFamily>()
for (const family of [
  boxFamily,
  curveFamily,
  polygonFamily,
  potatoidFamily,
  regularFamily,
  starFamily,
  arrowFamily,
  calloutFamily,
]) {
  for (const kind of family.kinds) families.set(kind, family)
}

export function insertShape(kind: ShapeKind, start: Point, end: Point): Point[] {
  return families.get(kind)?.insert(kind, start, end) ?? [start, end]
}

export function shapeHandles(kind: ShapeKind, points: readonly Point[]): TweakHandle[] {
  return families.get(kind)?.handles(kind, points) ?? []
}

export function moveShapeHandle(
  kind: ShapeKind,
  points: readonly Point[],
  id: string,
  point: Point,
): Point[] {
  const moved = families.get(kind)?.move(kind, points, id, point) ?? null
  return moved ?? [...points]
}

export function renderLiveShape(
  bitmap: Bitmap,
  kind: ShapeKind,
  points: readonly Point[],
  style: ShapeStyle,
): void {
  const family = families.get(kind)
  if (family) {
    family.render(bitmap, kind, points, style)
    return
  }
  renderShape(bitmap, kind, points, style)
}
