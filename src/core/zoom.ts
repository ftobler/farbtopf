export const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16] as const

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

/** Returns the index of the zoom level closest to the given value. */
export function nearestZoomIndex(value: number): number {
  let best = 0
  let bestDistance = Math.abs(ZOOM_LEVELS[0] - value)
  for (let index = 1; index < ZOOM_LEVELS.length; index += 1) {
    const distance = Math.abs(ZOOM_LEVELS[index] - value)
    if (distance < bestDistance) {
      best = index
      bestDistance = distance
    }
  }
  return best
}

/**
 * The zoom actually shown on screen. On a fractional device pixel ratio
 * (e.g. Windows at 125%) a whole-number level would put each image pixel on
 * a fractional number of device pixels, so every n-th row or column showed up
 * one device pixel thicker. Whole-number levels are snapped to whole device
 * pixels instead, like MS Paint does; fractional levels are uneven anyway.
 */
export function displayZoom(zoom: number, ratio: number): number {
  if (!Number.isInteger(zoom) || !(ratio > 0) || Number.isInteger(ratio)) return zoom
  return Math.max(1, Math.round(zoom * ratio)) / ratio
}

/**
 * Canvas backing-store pixels per image pixel. Only a whole-number ratio is
 * worth upscaling by; a fractional one would stretch rows unevenly before the
 * browser even scales the canvas.
 */
export function backingScale(ratio: number): number {
  return Number.isInteger(ratio) && ratio > 1 ? ratio : 1
}
