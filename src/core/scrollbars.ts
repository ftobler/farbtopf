import { clamp } from './geometry'

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
 * so the 24px padding cancels out and must not be subtracted. The scroll offset
 * is `(content - viewport) / 2 - pan`: a positive pan moves the content
 * right/down and therefore scrolls toward its start.
 */
export function computeScrollbarMetrics(content: number, viewport: number, pan: number): ScrollbarMetrics {
  const safeContent = Math.max(0, content)
  const safeViewport = Math.max(0, viewport)
  const maxScroll = Math.max(0, safeContent - safeViewport)
  const scroll = maxScroll > 0 ? clamp((safeContent - safeViewport) / 2 - pan, 0, maxScroll) : 0
  return {
    content: safeContent,
    viewport: safeViewport,
    maxScroll,
    scroll,
    scrollable: maxScroll > 0,
    thumbRatio: safeContent > 0 ? clamp(safeViewport / safeContent, 0, 1) : 1,
    positionRatio: maxScroll > 0 ? scroll / maxScroll : 0,
  }
}

/** Inverse of `computeScrollbarMetrics`: the pan that puts the content at `scroll`. */
export function panForScroll(content: number, viewport: number, scroll: number): number {
  const maxScroll = Math.max(0, content - viewport)
  return (content - viewport) / 2 - clamp(scroll, 0, maxScroll)
}
