import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckIcon, ChevronIcon } from './icons'

export interface DropdownProps {
  trigger: ReactNode
  children: (close: () => void) => ReactNode
  title?: string
  ariaLabel?: string
  align?: 'start' | 'end'
  showChevron?: boolean
  triggerClassName?: string
  active?: boolean
  /**
   * Makes this a split button: the icon part runs `onAction` directly and only
   * the arrow part opens the menu.
   */
  onAction?: () => void
}

export function Dropdown({
  trigger,
  children,
  title,
  ariaLabel,
  align = 'start',
  showChevron = true,
  triggerClassName,
  active,
  onAction,
}: DropdownProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handlePointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div className="dropdown" ref={rootRef}>
      {onAction ? (
        <div className={`split-button ${triggerClassName ?? 'dropdown-trigger'}`}>
          <button
            type="button"
            className="split-button-action"
            title={title}
            aria-label={ariaLabel}
            aria-pressed={active === undefined ? undefined : active}
            onClick={() => {
              setOpen(false)
              onAction()
            }}
          >
            {trigger}
          </button>
          <button
            type="button"
            className="split-button-arrow"
            title={title ? `${title} options` : undefined}
            aria-label={ariaLabel ? `${ariaLabel} options` : undefined}
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={() => setOpen((value) => !value)}
          >
            <ChevronIcon size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={triggerClassName ?? 'dropdown-trigger'}
          title={title}
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-pressed={active === undefined ? undefined : active}
          onClick={() => setOpen((value) => !value)}
        >
          {trigger}
          {showChevron ? <ChevronIcon size={14} /> : null}
        </button>
      )}
      {open ? (
        <div className={`dropdown-menu dropdown-${align}`} role="menu">
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  )
}

export interface MenuItemProps {
  children: ReactNode
  onClick?: () => void
  shortcut?: string
  disabled?: boolean
  checked?: boolean
}

export function MenuItem({ children, onClick, shortcut, disabled, checked }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className="menu-item"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="menu-item-check">{checked ? <CheckIcon size={14} /> : null}</span>
      <span className="menu-item-label">{children}</span>
      {shortcut ? <span className="menu-item-shortcut">{shortcut}</span> : null}
    </button>
  )
}

export function MenuDivider() {
  return <div className="menu-divider" role="separator" />
}
