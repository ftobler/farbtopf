import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export interface ContextMenuProps {
  x: number
  y: number
  onClose: () => void
  children: (close: () => void) => ReactNode
}

/**
 * A fixed-position menu shown at the pointer, reusing the shared `dropdown-menu`
 * glass panel so it matches the File/Edit/View menus. It is measured after mount
 * and nudged so it never spills past the viewport edges.
 */
export function ContextMenu({ x, y, onClose, children }: ContextMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState({ x, y })

  useLayoutEffect(() => {
    const menu = rootRef.current
    if (!menu) return
    const rect = menu.getBoundingClientRect()
    const left = Math.max(0, Math.min(x, window.innerWidth - rect.width))
    const top = Math.max(0, Math.min(y, window.innerHeight - rect.height))
    setPosition((current) =>
      current.x === left && current.y === top ? current : { x: left, y: top },
    )
  }, [x, y])

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
      style={{ left: position.x, top: position.y }}
    >
      {children(onClose)}
    </div>
  )
}
