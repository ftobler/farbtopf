/**
 * Custom tool cursors in the MS Paint spirit, as inline SVG data URIs. Each shape
 * is drawn twice, a wide white stroke under a thin black one, so it stays visible
 * on light and dark images in either theme. Browsers that cannot show them fall
 * back to the crosshair.
 */

const HALO = 'fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"'
const LINE = 'stroke="#000" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"'

function svgCursor(shapes: string[], body: string, hotspotX: number, hotspotY: number): string {
  const halo = shapes.map((d) => `<path d="${d}" ${HALO}/>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${halo}${body}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotspotX} ${hotspotY}, crosshair`
}

/** A pencil tilted up to the right, its tip (the hotspot) at the bottom left. */
const PENCIL_OUTLINE = 'M2 30 L4 22 L22 4 L25 1 L31 7 L28 10 L10 28 Z'
export const PENCIL_CURSOR = svgCursor(
  [PENCIL_OUTLINE],
  [
    `<path d="M4 22 L22 4 L28 10 L10 28 Z" fill="#fff" ${LINE}/>`,
    `<path d="M22 4 L25 1 L31 7 L28 10 Z" fill="#bbb" ${LINE}/>`,
    `<path d="M2 30 L4 22 L10 28 Z" fill="#fff" ${LINE}/>`,
    '<path d="M2 30 L2.9 26.4 L5.6 29.1 Z" fill="#000"/>',
    `<path d="M7 25 L25 7" fill="none" ${LINE}/>`,
  ].join(''),
  2,
  30,
)

/**
 * A paint bucket tipped over to the left, with paint dripping from its lip; the
 * bottom of the drip is the hotspot. The bucket is drawn upright and rotated.
 */
const BUCKET = 'M12 6 L26 6 L24 24 L14 24 Z'
const BUCKET_TILT = 'rotate(-115 19 15)'
const DRIP = 'M13 24 C11.5 25.5 10.5 27.5 10.5 29 A1.5 1.5 0 0 0 13.5 29 C13.5 27.5 14 26 14.8 24.8 Z'
export const FILL_CURSOR = svgCursor(
  [DRIP],
  [
    `<g transform="${BUCKET_TILT}">`,
    `<path d="${BUCKET}" ${HALO}/>`,
    `<path d="${BUCKET}" fill="#fff" ${LINE}/>`,
    `<ellipse cx="19" cy="6" rx="7" ry="2" fill="#bbb" ${LINE}/>`,
    '</g>',
    `<path d="${DRIP}" fill="#000" ${LINE}/>`,
  ].join(''),
  12,
  30,
)
