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

  it('places undo and redo in the menubar', () => {
    const { container } = render(<App />)
    const menubar = container.querySelector('.menubar')
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
})
