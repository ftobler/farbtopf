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
 * - `medium`: the desktop ribbon, but the shape gallery and the colour palette fold into buttons
 *   that open them in a popup.
 * - `compact`: one ribbon row; groups collapse into buttons that open their controls in a popup.
 * - `phone`: like compact, the tools also collapse and the menus fold into one hamburger menu.
 * - `single-row`: a short landscape phone screen; the phone ribbon moves up into the menu bar so
 *   the whole header is one row.
 */
export type HeaderLayout = 'full' | 'medium' | 'compact' | 'phone' | 'single-row'

/**
 * Below this width the labelled desktop ribbon would wrap (measured in Chrome: it needs 1178 px
 * including the header padding).
 */
export const MEDIUM_QUERY = '(max-width: 1179.98px)'
/**
 * Below this width even the medium ribbon, with shapes and colours folded, would wrap (measured:
 * it needs 667 px; the rest is safety margin). That is narrower than the phone breakpoint, so the
 * compact layout only takes over should the phone breakpoint ever move below it.
 */
export const COMPACT_QUERY = '(max-width: 699.98px)'
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
  const medium = useMediaQuery(MEDIUM_QUERY)
  const compact = useMediaQuery(COMPACT_QUERY)
  const phone = useMediaQuery(PHONE_QUERY)
  const singleRow = useMediaQuery(SINGLE_ROW_QUERY)
  if (!medium) return 'full'
  // A short landscape screen has no room for the tall labelled ribbon, however wide it is.
  if (singleRow) return 'single-row'
  if (phone) return 'phone'
  return compact ? 'compact' : 'medium'
}
