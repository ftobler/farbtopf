import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MenuBar, type MenuBarProps } from './MenuBar'

function renderMenuBar() {
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
  }
  return render(<MenuBar {...props} />)
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
})
