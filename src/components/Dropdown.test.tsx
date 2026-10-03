import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Dropdown, MenuItem, MenuSubmenu } from './Dropdown'

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

  it('moves focus to the first menu item when it opens', () => {
    render(
      <Dropdown title="Size" ariaLabel="Size" trigger={<span>S</span>}>
        {() => (
          <>
            <MenuItem>Small</MenuItem>
            <MenuItem>Medium</MenuItem>
          </>
        )}
      </Dropdown>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Size' }))
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Small' }))
  })

  it('navigates the open menu with the arrow, Home and End keys', () => {
    render(
      <Dropdown title="Size" ariaLabel="Size" trigger={<span>S</span>}>
        {() => (
          <>
            <MenuItem>Small</MenuItem>
            <MenuItem disabled>Medium</MenuItem>
            <MenuItem>Large</MenuItem>
          </>
        )}
      </Dropdown>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Size' }))
    const small = screen.getByRole('menuitem', { name: 'Small' })
    const large = screen.getByRole('menuitem', { name: 'Large' })

    expect(document.activeElement).toBe(small)
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(large)
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(small)
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(large)
    fireEvent.keyDown(document.activeElement!, { key: 'Home' })
    expect(document.activeElement).toBe(small)
    fireEvent.keyDown(document.activeElement!, { key: 'End' })
    expect(document.activeElement).toBe(large)
  })

  it('closes on Escape and returns focus to the trigger', () => {
    render(
      <Dropdown title="Size" ariaLabel="Size" trigger={<span>S</span>}>
        {() => (
          <>
            <MenuItem>Small</MenuItem>
            <MenuItem>Large</MenuItem>
          </>
        )}
      </Dropdown>,
    )
    const trigger = screen.getByRole('button', { name: 'Size' })
    fireEvent.click(trigger)
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Small' }))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})

describe('MenuSubmenu', () => {
  it('opens with ArrowRight and closes with ArrowLeft, moving focus', () => {
    render(
      <Dropdown title="View" ariaLabel="View" trigger={<span>V</span>}>
        {() => (
          <MenuSubmenu label="Zoom">
            {() => (
              <>
                <MenuItem>Zoom in</MenuItem>
                <MenuItem>Zoom out</MenuItem>
              </>
            )}
          </MenuSubmenu>
        )}
      </Dropdown>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    const trigger = screen.getByRole('menuitem', { name: 'Zoom' })
    expect(document.activeElement).toBe(trigger)

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
    const zoomIn = screen.getByRole('menuitem', { name: 'Zoom in' })
    expect(document.activeElement).toBe(zoomIn)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' })
    expect(screen.queryByRole('menuitem', { name: 'Zoom in' })).toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
  })

  it('navigates within the submenu without moving the parent menu', () => {
    render(
      <Dropdown title="View" ariaLabel="View" trigger={<span>V</span>}>
        {() => (
          <>
            <MenuSubmenu label="Zoom">
              {() => (
                <>
                  <MenuItem>Zoom in</MenuItem>
                  <MenuItem>Zoom out</MenuItem>
                </>
              )}
            </MenuSubmenu>
            <MenuItem>Fullscreen</MenuItem>
          </>
        )}
      </Dropdown>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
    const zoomIn = screen.getByRole('menuitem', { name: 'Zoom in' })
    expect(document.activeElement).toBe(zoomIn)
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Zoom out' }))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(zoomIn)
  })

  it('opens on a tap without the emulated hover closing it again', () => {
    render(
      <Dropdown title="View" ariaLabel="View" trigger={<span>V</span>}>
        {() => (
          <MenuSubmenu label="Zoom">{() => <MenuItem>Zoom in</MenuItem>}</MenuSubmenu>
        )}
      </Dropdown>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    const zoom = screen.getByRole('menuitem', { name: 'Zoom' })
    // A tap: pointerenter (touch), then the browser's emulated mouseenter, then click.
    fireEvent.pointerEnter(zoom, { pointerType: 'touch' })
    fireEvent.mouseEnter(zoom)
    fireEvent.click(zoom)
    expect(screen.getByRole('menuitem', { name: 'Zoom in' })).toBeTruthy()
  })
})
