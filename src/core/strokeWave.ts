const round2 = (n: number) => String(Math.round(n * 100) / 100)

/**
 * One full sine wavelength from x0 to x1 around the midline cy: a crest (peaking `amp`
 * above cy) followed by a mirrored trough. Each half is a cubic whose control points
 * sit at the thirds; a cubic reaches 3/4 of its control height, hence amp / 0.75.
 */
export function sineWavePath(x0: number, x1: number, cy: number, amp: number) {
  const third = (x1 - x0) / 6
  const k = amp / 0.75
  const p = (x: number, y: number) => `${round2(x)} ${round2(y)}`
  return (
    `M${p(x0, cy)}` +
    `C${p(x0 + third, cy - k)} ${p(x0 + 2 * third, cy - k)} ${p(x0 + 3 * third, cy)}` +
    `S${p(x1 - third, cy + k)} ${p(x1, cy)}`
  )
}

/**
 * On-screen thickness for a stroke size preview: true to size up to 5 px, then
 * compressed (square root) so the largest sizes still fit a menu row while staying
 * visibly thicker than their smaller neighbours.
 */
export function strokePreviewWidth(size: number) {
  if (size <= 5) return size
  return Math.round((5 + 2 * Math.sqrt(size - 5)) * 100) / 100
}
