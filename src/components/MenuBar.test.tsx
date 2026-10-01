import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MenuBar, type MenuBarProps } from './MenuBar'

function renderMenuBar(overrides: Partial<MenuBarProps> = {}) {
  const noop = vi.fn()
  const props: MenuBarProps = {
    canUndo: false,
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
    ...overrides,
  }
  return render(<MenuBar {...props} />)
}

function openMenu(name: string) {
  fireEvent.click(screen.getByRole('button', { name }))
}

function openZoomSubmenu() {
  openMenu('View')
  fireEvent.click(screen.getByRole('menuitem', { name: 'Zoom' }))
}

function isChecked(item: HTMLElement) {
  return item.classList.contains('menu-item-checked')
}

describe('MenuBar', () => {
  it('shows the favicon as the app icon, resolved against the base path', () => {
    const { container } = renderMenuBar()
    const logo = container.querySelector<HTMLImageElement>('.menubar-logo img')
    expect(logo).toBeTruthy()
    expect(logo?.getAttribute('src')).toBe(`${import.meta.env.BASE_URL}favicon.svg`)
    expect(logo?.getAttribute('alt')).toBe('')
    expect(logo?.getAttribute('width')).toBe('28')
    expect(logo?.getAttribute('height')).toBe('28')
  })

  it('describes the app logo with an accessible tooltip', () => {
    const { container } = renderMenuBar()
    const logo = container.querySelector<HTMLElement>('.menubar-logo')!
    expect(logo.getAttribute('aria-label')).toBe('Farbtopf')
    expect(logo.tabIndex).toBe(0)
    const tooltip = screen.getByRole('tooltip', { hidden: true })
    expect(logo.getAttribute('aria-describedby')).toBe(tooltip.id)
    expect(tooltip.querySelector('.app-tooltip-title')?.textContent).toBe('Farbtopf')
    expect(tooltip.textContent).toContain('A tiny paint pot for your browser.')
  })

  it('shows the logo tooltip on hover and hides it on leave', () => {
    const { container } = renderMenuBar()
    const logo = container.querySelector<HTMLElement>('.menubar-logo')!
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.mouseEnter(logo)
    expect(screen.getByRole('tooltip')).toBeTruthy()
    fireEvent.mouseLeave(logo)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('shows the logo tooltip on keyboard focus and dismisses it with Escape', () => {
    const { container } = renderMenuBar()
    const logo = container.querySelector<HTMLElement>('.menubar-logo')!
    fireEvent.focus(logo)
    expect(screen.getByRole('tooltip')).toBeTruthy()
    fireEvent.keyDown(logo, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.focus(logo)
    fireEvent.blur(logo)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('saves from the File menu and closes it', () => {
    const onSave = vi.fn()
    renderMenuBar({ onSave })
    openMenu('File')
    fireEvent.click(screen.getByRole('menuitem', { name: /^Save(?! as)/ }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('zooms in and out one level from the View menu and closes it', () => {
    const onZoomChange = vi.fn()
    renderMenuBar({ zoom: 2, onZoomChange })
    openZoomSubmenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Zoom in' }))
    expect(onZoomChange).toHaveBeenLastCalledWith(3)
    expect(screen.queryByRole('menu')).toBeNull()

    openZoomSubmenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Zoom out' }))
    expect(onZoomChange).toHaveBeenLastCalledWith(1.5)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('resets the zoom to 100% and closes the menu', () => {
    const onZoomChange = vi.fn()
    renderMenuBar({ zoom: 4, onZoomChange })
    openZoomSubmenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '100%' }))
    expect(onZoomChange).toHaveBeenCalledWith(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('checks 100% only at actual size', () => {
    const { unmount } = renderMenuBar({ zoom: 1 })
    openZoomSubmenu()
    expect(isChecked(screen.getByRole('menuitem', { name: '100%' }))).toBe(true)
    unmount()

    renderMenuBar({ zoom: 2 })
    openZoomSubmenu()
    expect(isChecked(screen.getByRole('menuitem', { name: '100%' }))).toBe(false)
  })

  it('fits the image to the window and closes the menu', () => {
    const onZoomFit = vi.fn()
    const onZoomChange = vi.fn()
    renderMenuBar({ onZoomFit, onZoomChange })
    openZoomSubmenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Fit to window' }))
    expect(onZoomFit).toHaveBeenCalledTimes(1)
    expect(onZoomChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('shows and toggles the pixel grid from the View menu', () => {
    const onToggleGrid = vi.fn()
    const { unmount } = renderMenuBar({ showGrid: false, onToggleGrid })
    openMenu('View')
    expect(isChecked(screen.getByRole('menuitem', { name: /Pixel grid/ }))).toBe(false)
    fireEvent.click(screen.getByRole('menuitem', { name: /Pixel grid/ }))
    expect(onToggleGrid).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
    unmount()

    renderMenuBar({ showGrid: true })
    openMenu('View')
    expect(isChecked(screen.getByRole('menuitem', { name: /Pixel grid/ }))).toBe(true)
  })

  it('shows and toggles fullscreen from the View menu', () => {
    const onToggleFullscreen = vi.fn()
    const { unmount } = renderMenuBar({ isFullscreen: false, onToggleFullscreen })
    openMenu('View')
    expect(isChecked(screen.getByRole('menuitem', { name: 'Fullscreen' }))).toBe(false)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Fullscreen' }))
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
    unmount()

    renderMenuBar({ isFullscreen: true })
    openMenu('View')
    expect(isChecked(screen.getByRole('menuitem', { name: 'Fullscreen' }))).toBe(true)
  })
})
