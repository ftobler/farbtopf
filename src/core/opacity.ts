import type { Bitmap } from './bitmap'
import type { Rect } from './geometry'

/**
 * Opacity (strength) for a stroke that must not build up where it overlaps itself.
 *
 * The tool paints its whole stroke at full strength into `work`, a copy of `base` (the
 * layer as it was before the stroke). The visible result is then `base` moved toward
 * `work` by `strength`, recomputed from `base` every time, so going over the same
 * spot twice within one stroke never makes it more opaque.
 *
 * Mixing happens on premultiplied colour, which makes it work for every tool:
 * paint over transparency keeps its colour and only gets a lower alpha, erasing
 * toward transparency fades the alpha, and blur/smudge/liquify fade in their effect.
 *
 * Only pixels inside `rect` (clipped to the bitmaps) are written to `target`.
 */
export function blendToward(target: Bitmap, base: Bitmap, work: Bitmap, strength: number, rect?: Rect): void {
  const width = Math.min(target.width, base.width, work.width)
  const height = Math.min(target.height, base.height, work.height)
  const x0 = Math.max(0, Math.floor(rect ? rect.x : 0))
  const y0 = Math.max(0, Math.floor(rect ? rect.y : 0))
  const x1 = Math.min(width, Math.ceil(rect ? rect.x + rect.width : width))
  const y1 = Math.min(height, Math.ceil(rect ? rect.y + rect.height : height))
  const t = Math.min(1, Math.max(0, strength))
  const out = target.data
  const from = base.data
  const to = work.data
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const ti = (y * target.width + x) * 4
      const bi = (y * base.width + x) * 4
      const wi = (y * work.width + x) * 4
      const ba = from[bi + 3]
      const wa = to[wi + 3]
      if (
        from[bi] === to[wi] &&
        from[bi + 1] === to[wi + 1] &&
        from[bi + 2] === to[wi + 2] &&
        ba === wa
      ) {
        out[ti] = from[bi]
        out[ti + 1] = from[bi + 1]
        out[ti + 2] = from[bi + 2]
        out[ti + 3] = ba
        continue
      }
      const a = ba + (wa - ba) * t
      if (a <= 0) {
        out[ti] = 0
        out[ti + 1] = 0
        out[ti + 2] = 0
        out[ti + 3] = 0
        continue
      }
      for (let c = 0; c < 3; c += 1) {
        const premultiplied = from[bi + c] * ba + (to[wi + c] * wa - from[bi + c] * ba) * t
        out[ti + c] = Math.round(premultiplied / a)
      }
      out[ti + 3] = Math.round(a)
    }
  }
}
