import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export interface ContextMenuProps {
  x: number
  y: number
  onClose: () => void
  children: (close: () => void) => ReactNode
}

/**
 * A fixed-position menu shown at the pointer, reusing the shared `dropdown-menu`
 * glass panel so it matches the File/Edit/View menus.
 */
export function ContextMenu({ x, y, onClose, children }: ContextMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handlePointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) onClose()
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return (
    <div
      ref={rootRef}
      className="dropdown-menu context-menu"
      role="menu"
      style={{ left: x, top: y }}
    >
      {children(onClose)}
    </div>
  )
}
