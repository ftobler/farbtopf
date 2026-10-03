import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MenuBar, type MenuBarProps } from './MenuBar'

function renderCollapsed(overrides: Partial<MenuBarProps> = {}) {
  const noop = vi.fn()
  const props: MenuBarProps = {
    canUndo: true,
    canRedo: false,
    theme: 'light',
    zoom: 1,
    showGrid: false,
    isFullscreen: false,
    showMiniature: false,
    onNew: noop,
    onOpen: noop,
    onSave: noop,
    onSaveAs: noop,
    onDownload: noop,
    onUndo: noop,
    onRedo: noop,
    onClear: noop,
    onCut: noop,
    onCopy: noop,
    onPaste: noop,
    onCopyVisible: noop,
    onZoomChange: noop,
    onZoomFit: noop,
    onToggleGrid: noop,
    onToggleFullscreen: noop,
    onToggleMiniature: noop,
    onToggleTheme: noop,
    collapsed: true,
    ...overrides,
  }
  return render(<MenuBar {...props} />)
}

function openHamburger() {
  fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MenuBar collapsed into a hamburger menu', () => {
  it('replaces the File, Edit and View buttons with one menu button', () => {
    renderCollapsed()
    expect(screen.queryByRole('button', { name: 'File' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'View' })).toBeNull()
    const menu = screen.getByRole('button', { name: 'Menu' })
    expect(menu.getAttribute('aria-haspopup')).toBe('menu')
    expect(menu.getAttribute('aria-expanded')).toBe('false')
  })

  it('keeps save, undo, redo and the theme toggle directly visible', () => {
    const onUndo = vi.fn()
    renderCollapsed({ onUndo })
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect((screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Toggle color theme' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'GitHub repository' })).toBeNull()
  })

  it('lists File, Edit and View as submenus with their items', () => {
    const onNew = vi.fn()
    renderCollapsed({ onNew })
    openHamburger()
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'View' })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'File' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^New/ }))
    expect(onNew).toHaveBeenCalledTimes(1)
    // Choosing an item closes the whole menu.
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('reaches the edit and view items', () => {
    const onPaste = vi.fn()
    const onToggleGrid = vi.fn()
    renderCollapsed({ onPaste, onToggleGrid })
    openHamburger()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Paste/ }))
    expect(onPaste).toHaveBeenCalledTimes(1)
    openHamburger()
    fireEvent.click(screen.getByRole('menuitem', { name: 'View' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Pixel grid/ }))
    expect(onToggleGrid).toHaveBeenCalledTimes(1)
  })

  it('navigates with the keyboard into a submenu', () => {
    renderCollapsed()
    openHamburger()
    const file = screen.getByRole('menuitem', { name: 'File' })
    expect(document.activeElement).toBe(file)
    fireEvent.keyDown(file, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Edit' }))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: /^Undo/ }))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Menu' }))
  })

  it('moves the GitHub link into the menu', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    renderCollapsed()
    openHamburger()
    fireEvent.click(screen.getByRole('menuitem', { name: 'View source on GitHub' }))
    expect(open).toHaveBeenCalledWith('https://github.com/ftobler/farbtopf', '_blank', 'noreferrer')
  })

  it('shows extra header content such as the ribbon next to the quick actions', () => {
    renderCollapsed({ children: <button type="button">Ribbon stand-in</button> })
    expect(screen.getByRole('button', { name: 'Ribbon stand-in' })).toBeTruthy()
  })
})
