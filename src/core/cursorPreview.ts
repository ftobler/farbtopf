import type { Point, Rect } from './geometry'

/**
 * The image pixels a square eraser stamp of `size` covers when centred on `point`,
 * clipped to the image. Mirrors `stamp` in raster.ts, so the preview and the
 * erased area always match.
 */
export function eraserFootprint(point: Point, size: number, width: number, height: number): Rect {
  const s = Math.max(1, Math.floor(size))
  const offset = Math.floor((s - 1) / 2)
  const left = Math.max(0, Math.floor(point.x) - offset)
  const top = Math.max(0, Math.floor(point.y) - offset)
  const right = Math.min(width, Math.floor(point.x) - offset + s)
  const bottom = Math.min(height, Math.floor(point.y) - offset + s)
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

/** Rounds a CSS length to the nearest device pixel so 1px lines stay crisp. */
export function snapToDevicePixels(value: number, ratio: number): number {
  const r = ratio > 0 ? ratio : 1
  return Math.round(value * r) / r
}

/**
 * The eraser footprint in CSS pixels relative to the canvas, with its edges
 * snapped to device pixels. It never collapses below one device pixel.
 */
export function eraserPreviewRect(
  point: Point,
  size: number,
  zoom: number,
  ratio: number,
  width: number,
  height: number,
): Rect {
  const footprint = eraserFootprint(point, size, width, height)
  const r = ratio > 0 ? ratio : 1
  const left = snapToDevicePixels(footprint.x * zoom, r)
  const top = snapToDevicePixels(footprint.y * zoom, r)
  const right = snapToDevicePixels((footprint.x + footprint.width) * zoom, r)
  const bottom = snapToDevicePixels((footprint.y + footprint.height) * zoom, r)
  return { x: left, y: top, width: Math.max(1 / r, right - left), height: Math.max(1 / r, bottom - top) }
}
