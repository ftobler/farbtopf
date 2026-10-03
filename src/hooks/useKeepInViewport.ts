import { useLayoutEffect } from 'react'
import type { RefObject } from 'react'

/** Distance kept between a popup and the viewport edges, in CSS pixels. */
export const VIEWPORT_MARGIN = 8

/**
 * Nudges an open popup (dropdown menu, popover) sideways so it stays within the viewport,
 * and caps its height with an inner scroll when it would run off the bottom. Desktop
 * popups that already fit are left untouched; on a phone this keeps menus opened from a
 * trigger near the right edge on screen.
 */
export function useKeepInViewport(ref: RefObject<HTMLElement | null>, active: boolean) {
  useLayoutEffect(() => {
    if (!active) return
    const element = ref.current
    if (!element) return

    const place = () => {
      element.style.removeProperty('translate')
      element.style.removeProperty('max-height')
      element.style.removeProperty('overflow-y')
      const rect = element.getBoundingClientRect()
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth
      const viewportHeight = window.innerHeight

      let shift = 0
      if (rect.right > viewportWidth - VIEWPORT_MARGIN) shift = viewportWidth - VIEWPORT_MARGIN - rect.right
      if (rect.left + shift < VIEWPORT_MARGIN) shift = VIEWPORT_MARGIN - rect.left
      if (shift !== 0) element.style.setProperty('translate', `${Math.round(shift)}px 0`)

      const available = viewportHeight - VIEWPORT_MARGIN - rect.top
      // Only for popups that open downwards into too little room; a sliver is not worth it.
      if (rect.bottom > viewportHeight - VIEWPORT_MARGIN && rect.top >= 0 && available >= 120) {
        element.style.setProperty('max-height', `${Math.floor(available)}px`)
        element.style.setProperty('overflow-y', 'auto')
      }
    }

    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [active, ref])
}
