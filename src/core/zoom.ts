export const ZOOM_LEVELS = [0.25, 0.5, 1, 2, 4, 8] as const

export type ZoomLevel = (typeof ZOOM_LEVELS)[number]

/** Returns the next zoom level in the given direction, clamped at both ends. */
export function nextZoom(current: number, direction: 1 | -1): number {
  if (direction > 0) {
    for (const level of ZOOM_LEVELS) {
      if (level > current) return level
    }
    return ZOOM_LEVELS[ZOOM_LEVELS.length - 1]
  }
  for (let index = ZOOM_LEVELS.length - 1; index >= 0; index -= 1) {
    if (ZOOM_LEVELS[index] < current) return ZOOM_LEVELS[index]
  }
  return ZOOM_LEVELS[0]
}
