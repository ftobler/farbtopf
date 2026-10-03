import { useCallback, useSyncExternalStore } from 'react'

/** True while the media query matches; false where matchMedia is unavailable. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => {}
      const list = window.matchMedia(query)
      list.addEventListener?.('change', onChange)
      return () => list.removeEventListener?.('change', onChange)
    },
    [query],
  )
  const getSnapshot = () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

/**
 * How the header (menu bar + ribbon) is laid out for the window size:
 * - `full`: the desktop ribbon with labelled groups (the default).
 * - `compact`: one ribbon row; groups collapse into buttons that open their controls in a popup.
 * - `phone`: like compact, the tools also collapse and the menus fold into one hamburger menu.
 * - `single-row`: a short landscape phone screen; the phone ribbon moves up into the menu bar so
 *   the whole header is one row.
 */
export type HeaderLayout = 'full' | 'compact' | 'phone' | 'single-row'

/** Below this width the labelled desktop ribbon would wrap. */
export const COMPACT_QUERY = '(max-width: 1179.98px)'
/** Below this width the compact ribbon row with its inline tools would not fit. */
export const PHONE_QUERY = '(max-width: 719.98px)'
/** A landscape phone: too short for two header rows but wide enough for one. */
export const SINGLE_ROW_QUERY = '(max-height: 500px) and (min-width: 560px)'

/**
 * Picks the header layout from CSS media queries. Breakpoints rather than measuring overflow:
 * they cannot oscillate (collapsing shrinks the very content an overflow check measures), they
 * match the CSS media queries one to one, and they are testable by mocking matchMedia.
 * All queries are "max" queries, so without matchMedia the desktop layout is kept.
 */
export function useHeaderLayout(): HeaderLayout {
  const compact = useMediaQuery(COMPACT_QUERY)
  const phone = useMediaQuery(PHONE_QUERY)
  const singleRow = useMediaQuery(SINGLE_ROW_QUERY)
  if (!compact) return 'full'
  if (singleRow) return 'single-row'
  return phone ? 'phone' : 'compact'
}
