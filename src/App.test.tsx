import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'
import { ZOOM_LEVELS } from './core/zoom'

describe('App', () => {
  it('renders the tool palette and status bar', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Pencil' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fill with color' })).toBeTruthy()
    expect(screen.getByText('800 × 600 px')).toBeTruthy()
  })

  it('renders the color palette inside the topbar', () => {
    const { container } = render(<App />)
    const palette = screen.getByRole('listbox', { name: 'Color palette' })
    const topbar = container.querySelector('.topbar')
    expect(topbar).toBeTruthy()
    expect(topbar?.contains(palette)).toBe(true)
  })

  it('renders the ribbon groups and paste button inside the topbar', () => {
    const { container } = render(<App />)
    const topbar = container.querySelector('.topbar')
    expect(topbar).toBeTruthy()

    for (const label of ['Clipboard', 'Image', 'Tools', 'Shapes', 'Size', 'Colors']) {
      expect(screen.getByText(label)).toBeTruthy()
    }

    const paste = screen.getByRole('button', { name: 'Paste' })
    expect(topbar?.contains(paste)).toBe(true)

    const cut = screen.getByRole('button', { name: 'Cut' })
    expect(topbar?.contains(cut)).toBe(true)

    const copy = screen.getByRole('button', { name: 'Copy' })
    expect(topbar?.contains(copy)).toBe(true)
  })

  it('places save, undo and redo in the menubar', () => {
    const { container } = render(<App />)
    const menubar = container.querySelector('.menubar')
    expect(menubar?.contains(screen.getByRole('button', { name: 'Save' }))).toBe(true)
    expect(menubar?.contains(screen.getByRole('button', { name: 'Undo' }))).toBe(true)
    expect(menubar?.contains(screen.getByRole('button', { name: 'Redo' }))).toBe(true)
  })

  it('switches the active tool on click', () => {
    render(<App />)
    const pencil = screen.getByRole('button', { name: 'Pencil' })
    fireEvent.click(pencil)
    expect(pencil.getAttribute('aria-pressed')).toBe('true')
  })

  it('changes zoom with the status bar slider and resets it', () => {
    render(<App />)
    const slider = screen.getByRole('slider', { name: 'Zoom' })
    fireEvent.change(slider, { target: { value: String(ZOOM_LEVELS.indexOf(4)) } })
    expect(screen.getByRole('button', { name: '400%' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '400%' }))
    expect(screen.getByRole('button', { name: '100%' })).toBeTruthy()
  })

  it('shows the new image dialog with presets', () => {
    render(<App />)
    fireEvent.click(screen.getByText('File'))
    fireEvent.click(screen.getByText('New'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('640 x 480')).toBeTruthy()
  })

  it('exposes the image group actions', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Select' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Crop' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Scale' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Flip' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Rotate' })).toBeTruthy()
  })

  it('lists the flip modes', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Flip' }))
    expect(screen.getByText('Flip horizontal')).toBeTruthy()
    expect(screen.getByText('Flip vertical')).toBeTruthy()
  })

  it('keeps the pixel grid toggle in the status bar', () => {
    const { container } = render(<App />)
    const statusbar = container.querySelector('.statusbar')
    expect(statusbar?.contains(screen.getByRole('button', { name: 'Toggle pixel grid' }))).toBe(
      true,
    )
  })
})
