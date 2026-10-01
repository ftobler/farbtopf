import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

/** Keeps keyboard focus inside a modal while it is open and restores it on close. */
export function useModalFocus(open: boolean, ref: RefObject<HTMLElement | null>) {
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) return
    const track = () => {
      previouslyFocused.current = document.activeElement as HTMLElement | null
    }
    track()
    document.addEventListener('focusin', track)
    return () => document.removeEventListener('focusin', track)
  }, [open])

  useEffect(() => {
    if (!open) return
    const container = ref.current
    if (!container) return

    const active = document.activeElement as HTMLElement | null
    const initial =
      active && active !== document.body && container.contains(active)
        ? active
        : container.querySelector<HTMLElement>('[autofocus]') ?? focusableElements(container)[0]
    if (initial) {
      initial.focus()
    } else {
      container.tabIndex = -1
      container.focus()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const items = focusableElements(container)
      if (items.length === 0) {
        event.preventDefault()
        container.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement
      const inside = container.contains(current)
      if (event.shiftKey) {
        if (!inside || current === first) {
          event.preventDefault()
          last.focus()
        }
      } else if (!inside || current === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      const restore = previouslyFocused.current
      if (restore && restore.isConnected) restore.focus()
    }
  }, [open, ref])
}
