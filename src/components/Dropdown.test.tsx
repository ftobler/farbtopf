import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Dropdown, MenuItem } from './Dropdown'

function renderSplit(onAction = vi.fn()) {
  render(
    <Dropdown title="Rotate" ariaLabel="Rotate" trigger={<span>R</span>} onAction={onAction}>
      {() => <MenuItem>Rotate 180°</MenuItem>}
    </Dropdown>,
  )
  return onAction
}

describe('Dropdown', () => {
  it('opens the menu from a plain trigger', () => {
    render(
      <Dropdown title="Size" ariaLabel="Size" trigger={<span>S</span>}>
        {() => <MenuItem>Small</MenuItem>}
      </Dropdown>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Size' }))
    expect(screen.getByRole('menuitem', { name: 'Small' })).toBeTruthy()
  })

  it('runs the action from the icon part of a split button without opening the menu', () => {
    const onAction = renderSplit()
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }))
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('opens the menu only from the arrow part of a split button', () => {
    const onAction = renderSplit()
    const arrow = screen.getByRole('button', { name: 'Rotate options' })
    expect(arrow.getAttribute('aria-haspopup')).toBe('menu')
    fireEvent.click(arrow)
    expect(screen.getByRole('menuitem', { name: 'Rotate 180°' })).toBeTruthy()
    expect(onAction).not.toHaveBeenCalled()
  })

  it('marks a checked item that shows an icon', () => {
    render(
      <Dropdown title="Fill" ariaLabel="Fill" trigger={<span>F</span>}>
        {() => (
          <>
            <MenuItem icon={<svg />} checked>
              Filled
            </MenuItem>
            <MenuItem icon={<svg />}>Outline</MenuItem>
          </>
        )}
      </Dropdown>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Fill' }))
    const filled = screen.getByRole('menuitem', { name: 'Filled' })
    const outline = screen.getByRole('menuitem', { name: 'Outline' })
    expect(filled.classList.contains('menu-item-checked')).toBe(true)
    expect(outline.classList.contains('menu-item-checked')).toBe(false)
    expect(filled.querySelector('svg')).toBeTruthy()
  })

  it('opens downward by default and upward when placement is up', () => {
    const { unmount } = render(
      <Dropdown title="Font" ariaLabel="Font" trigger={<span>F</span>}>
        {() => <MenuItem>Georgia</MenuItem>}
      </Dropdown>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Font' }))
    expect(screen.getByRole('menu').classList.contains('dropdown-up')).toBe(false)
    unmount()

    render(
      <Dropdown title="Font" ariaLabel="Font" placement="up" trigger={<span>F</span>}>
        {() => <MenuItem>Georgia</MenuItem>}
      </Dropdown>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Font' }))
    expect(screen.getByRole('menu').classList.contains('dropdown-up')).toBe(true)
  })
})
