import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ContextMenu } from './ContextMenu'
import { MenuDivider, MenuItem } from './Dropdown'

function Harness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true)
  if (!open) return null
  return (
    <ContextMenu
      x={10}
      y={10}
      onClose={() => {
        setOpen(false)
        onClose()
      }}
    >
      {() => (
        <>
          <MenuItem>Cut</MenuItem>
          <MenuItem disabled>Copy</MenuItem>
          <MenuDivider />
          <MenuItem>Paste</MenuItem>
        </>
      )}
    </ContextMenu>
  )
}

describe('ContextMenu', () => {
  it('takes focus on open and is navigable with the arrows, Home and End', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const cut = screen.getByRole('menuitem', { name: 'Cut' })
    const paste = screen.getByRole('menuitem', { name: 'Paste' })

    expect(document.activeElement).toBe(cut)
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(paste)
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(cut)
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(paste)
    fireEvent.keyDown(document.activeElement!, { key: 'Home' })
    expect(document.activeElement).toBe(cut)
    fireEvent.keyDown(document.activeElement!, { key: 'End' })
    expect(document.activeElement).toBe(paste)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Escape and restores the previously focused element', () => {
    const before = document.createElement('button')
    document.body.appendChild(before)
    before.focus()
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Cut' }))

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(before)
    before.remove()
  })
})
