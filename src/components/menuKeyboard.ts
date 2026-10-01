import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

/** The focusable, enabled menu items that belong directly to a menu container. */
export function menuItems(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).filter(
    (item) => item.closest('[role="menu"]') === container && !item.disabled,
  )
}

/** Focuses the first enabled item, or the menu container itself when it is empty. */
export function focusMenuItem(container: HTMLElement) {
  const items = menuItems(container)
  if (items.length > 0) {
    items[0].focus()
    return
  }
  container.tabIndex = -1
  container.focus()
}

export function handleMenuKeyDown(event: ReactKeyboardEvent, container: HTMLElement | null) {
  if (!container) return
  const items = menuItems(container)
  if (items.length === 0) return
  const active = document.activeElement as HTMLElement | null
  const index = active ? items.indexOf(active as HTMLButtonElement) : -1

  let next: number
  switch (event.key) {
    case 'ArrowDown':
      next = index < 0 ? 0 : (index + 1) % items.length
      break
    case 'ArrowUp':
      next = index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = items.length - 1
      break
    default:
      return
  }

  event.preventDefault()
  event.stopPropagation()
  items[next].focus()
}
