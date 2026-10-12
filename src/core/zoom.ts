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
 * The zoom the canvas is laid out at, in CSS pixels per image pixel. The
 * device pixel ratio grows both with the display scale and with the browser's
 * page zoom, so dividing by it keeps the slider in image pixels: at 100% one
 * image pixel covers one physical pixel, whatever the user's browser zoom.
 */
export function displayZoom(zoom: number, ratio: number): number {
  return ratio > 0 ? zoom / ratio : zoom
}

/**
 * Canvas backing-store pixels per image pixel. Only a whole-number ratio is
 * worth upscaling by; a fractional one would stretch rows unevenly before the
 * browser even scales the canvas.
 */
export function backingScale(ratio: number): number {
  return Number.isInteger(ratio) && ratio > 1 ? ratio : 1
}
