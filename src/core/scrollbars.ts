import { clamp } from './geometry'

/** Extra travel (in workspace px) the scroll range allows past each canvas edge. */
export const SCROLL_OVERSCROLL = 20

export interface ScrollbarMetrics {
  content: number
  viewport: number
  maxScroll: number
  scroll: number
  scrollable: boolean
  thumbRatio: number
  positionRatio: number
}

/**
 * Scroll geometry for one axis. `viewport` is the full workspace size: the
 * visible region is clipped to the workspace border box, and the canvas is
 * centred inside the workspace padding box whose centre matches the border box,
 * so the 24px padding cancels out and must not be subtracted. The scrollable
 * extent is the canvas grown by `SCROLL_OVERSCROLL` on both sides, so at each
 * limit the canvas edge rests ~20px inside the viewport. The scroll offset is
 * `(extent - viewport) / 2 - pan`: a positive pan moves the content right/down
 * and therefore scrolls toward its start.
 */
export function computeScrollbarMetrics(content: number, viewport: number, pan: number): ScrollbarMetrics {
  const safeContent = Math.max(0, content)
  const safeViewport = Math.max(0, viewport)
  const extent = safeContent + SCROLL_OVERSCROLL * 2
  const scrollable = safeContent > safeViewport
  const maxScroll = scrollable ? Math.max(0, extent - safeViewport) : 0
  const scroll = maxScroll > 0 ? clamp((extent - safeViewport) / 2 - pan, 0, maxScroll) : 0
  return {
    content: safeContent,
    viewport: safeViewport,
    maxScroll,
    scroll,
    scrollable,
    thumbRatio: scrollable && extent > 0 ? clamp(safeViewport / extent, 0, 1) : 1,
    positionRatio: maxScroll > 0 ? scroll / maxScroll : 0,
  }
}

/** Inverse of `computeScrollbarMetrics`: the pan that puts the content at `scroll`. */
export function panForScroll(content: number, viewport: number, scroll: number): number {
  const safeContent = Math.max(0, content)
  const safeViewport = Math.max(0, viewport)
  const extent = safeContent + SCROLL_OVERSCROLL * 2
  const maxScroll = Math.max(0, extent - safeViewport)
  return (extent - safeViewport) / 2 - clamp(scroll, 0, maxScroll)
}
