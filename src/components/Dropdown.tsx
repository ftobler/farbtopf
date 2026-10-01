import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckIcon, ChevronIcon } from './icons'
import { focusMenuItem, handleMenuKeyDown } from './menuKeyboard'

export interface DropdownProps {
  trigger: ReactNode
  children: (close: () => void) => ReactNode
  title?: string
  ariaLabel?: string
  align?: 'start' | 'end'
  /** Opens the menu below the trigger (default) or above it when space is tight. */
  placement?: 'down' | 'up'
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
  placement = 'down',
  showChevron = true,
  triggerClassName,
  active,
  onAction,
}: DropdownProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    if (menuRef.current) focusMenuItem(menuRef.current)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handlePointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Escape dismisses the open menu only; don't let it reach the global
        // handler that clears the canvas selection.
        event.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus()
      }
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
            ref={triggerRef}
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
          ref={triggerRef}
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
        <div
          ref={menuRef}
          className={`dropdown-menu dropdown-${align}${placement === 'up' ? ' dropdown-up' : ''}`}
          role="menu"
          tabIndex={-1}
          onKeyDown={(event) => handleMenuKeyDown(event, menuRef.current)}
        >
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
  icon?: ReactNode
}

export function MenuItem({ children, onClick, shortcut, disabled, checked, icon }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`menu-item${icon && checked ? ' menu-item-checked' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className={`menu-item-check${icon ? ' menu-item-icon' : ''}`}>
        {icon ?? (checked ? <CheckIcon size={14} /> : null)}
      </span>
      <span className="menu-item-label">{children}</span>
      {shortcut ? <span className="menu-item-shortcut">{shortcut}</span> : null}
    </button>
  )
}

export interface MenuSubmenuProps {
  children: (close: () => void) => ReactNode
  label: ReactNode
  icon?: ReactNode
  disabled?: boolean
}

/** A menu item that reveals a nested flyout menu on hover, click or keyboard focus. */
export function MenuSubmenu({ children, label, icon, disabled }: MenuSubmenuProps) {
  const [open, setOpen] = useState(false)
  const [openLeft, setOpenLeft] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  // Flip the flyout to the left when it would spill past the right viewport edge.
  useLayoutEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return
    setOpenLeft(panel.getBoundingClientRect().right > window.innerWidth)
  }, [open])

  useEffect(() => {
    if (!open) return
    if (panelRef.current) focusMenuItem(panelRef.current)
  }, [open])

  return (
    <div
      className="menu-submenu"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={triggerRef}
        type="button"
        role="menuitem"
        className="menu-item menu-submenu-trigger"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowRight') return
          event.preventDefault()
          event.stopPropagation()
          setOpen(true)
          if (panelRef.current) focusMenuItem(panelRef.current)
        }}
      >
        <span className={`menu-item-check${icon ? ' menu-item-icon' : ''}`}>{icon}</span>
        <span className="menu-item-label">{label}</span>
        <span className="menu-item-arrow">
          <ChevronIcon size={14} />
        </span>
      </button>
      {open ? (
        <div
          ref={panelRef}
          className={`dropdown-menu menu-submenu-panel${openLeft ? ' menu-submenu-panel-left' : ''}`}
          role="menu"
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault()
              event.stopPropagation()
              setOpen(false)
              triggerRef.current?.focus()
              return
            }
            handleMenuKeyDown(event, panelRef.current)
          }}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  )
}

export function MenuDivider() {
  return <div className="menu-divider" role="separator" />
}
