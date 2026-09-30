import { render } from '@testing-library/react'
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
})
