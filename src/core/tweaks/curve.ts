import type { Bitmap } from '../bitmap'
import type { ShapeStyle } from '../shapes'
import { renderShape } from '../shapes'
import type { ShapeFamily, TweakHandle } from './types'

const HANDLE_IDS = ['p0', 'c1', 'c2', 'p3'] as const

export const curveFamily: ShapeFamily = {
  kinds: ['polyline'],
  insert(_kind, start, end) {
    const dx = end.x - start.x
    const dy = end.y - start.y
    return [
      start,
      { x: start.x + dx / 3, y: start.y + dy / 3 },
      { x: start.x + (2 * dx) / 3, y: start.y + (2 * dy) / 3 },
      end,
    ]
  },
  handles(_kind, points): TweakHandle[] {
    return points.slice(0, 4).map((point, index) => ({ id: HANDLE_IDS[index], point }))
  },
  move(_kind, points, id, point) {
    if (points.length < 4) return null
    const [p0, c1, c2, p3] = points
    switch (id) {
      case 'p0':
        return [
          point,
          { x: c1.x + (point.x - p0.x), y: c1.y + (point.y - p0.y) },
          c2,
          p3,
        ]
      case 'c1':
        return [p0, point, c2, p3]
      case 'c2':
        return [p0, c1, point, p3]
      case 'p3':
        return [
          p0,
          c1,
          { x: c2.x + (point.x - p3.x), y: c2.y + (point.y - p3.y) },
          point,
        ]
      default:
        return null
    }
  },
  render(bitmap: Bitmap, kind, points, style: ShapeStyle) {
    renderShape(bitmap, kind, points, style)
  },
}
