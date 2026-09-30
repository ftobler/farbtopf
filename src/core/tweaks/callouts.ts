import { renderShape } from '../shapes'
import { boxHandles, resizeBox } from './shared'
import type { ShapeFamily } from './types'

export const calloutFamily: ShapeFamily = {
  kinds: ['callout-rectangle', 'callout-rounded-rectangle', 'callout-oval'],
  insert(_kind, start, end) {
    return [start, end]
  },
  handles(_kind, points) {
    return boxHandles(points)
  },
  move(_kind, points, id, point) {
    return resizeBox(points, id, point)
  },
  render(bitmap, kind, points, style) {
    if (points.length < 2) return
    renderShape(bitmap, kind, [points[0], points[1]], style)
  },
}
