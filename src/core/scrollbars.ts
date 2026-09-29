import { clamp } from './geometry'

/** Padding around the canvas inside `.workspace`, matching index.css. */
export const WORKSPACE_PADDING = 24

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
 * Scroll geometry for one axis. The canvas is centred in the workspace at rest,
 * so the scroll offset is `(content - viewport) / 2 - pan`: a positive pan moves
 * the content right/down and therefore scrolls toward its start.
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
