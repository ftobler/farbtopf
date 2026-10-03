import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'
import { COMPACT_QUERY, PHONE_QUERY, SINGLE_ROW_QUERY } from './hooks/useHeaderLayout'
import { mockMatchMedia, restoreMatchMedia } from './test/matchMedia'

afterEach(restoreMatchMedia)

describe('App header on small screens', () => {
  it('shows the full labelled ribbon on the desktop', () => {
    mockMatchMedia()
    const { container } = render(<App />)
    expect(screen.getByRole('button', { name: 'File' })).toBeTruthy()
    expect(container.querySelector('.topbar-compact')).toBeNull()
    expect(screen.getByText('Clipboard')).toBeTruthy()
  })

  it('collapses the ribbon into group buttons on a tablet', () => {
    mockMatchMedia([COMPACT_QUERY])
    const { container } = render(<App />)
    expect(container.querySelector('.topbar-compact .ribbon-compact')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'File' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pencil' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clipboard' })).toBeTruthy()
  })

  it('folds the menus into a hamburger and the tools into one button on a phone', () => {
    mockMatchMedia([COMPACT_QUERY, PHONE_QUERY])
    const { container } = render(<App />)
    expect(screen.queryByRole('button', { name: 'File' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Menu' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tools' })).toBeTruthy()
    expect(container.querySelector('.ribbon-phone')).toBeTruthy()
  })

  it('switches tools from the collapsed phone ribbon', () => {
    mockMatchMedia([COMPACT_QUERY, PHONE_QUERY])
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Tools options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Eraser' }))
    expect(screen.getByRole('button', { name: 'Tools' }).getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('.statusbar')?.textContent).toContain('Eraser')
  })

  it('opens the new image dialog through the hamburger menu', () => {
    mockMatchMedia([COMPACT_QUERY, PHONE_QUERY])
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'File' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^New/ }))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('puts the ribbon into the menu bar row on a short landscape phone', () => {
    mockMatchMedia([COMPACT_QUERY, SINGLE_ROW_QUERY])
    const { container } = render(<App />)
    expect(container.querySelector('.topbar')).toBeNull()
    expect(container.querySelector('.menubar .ribbon-phone')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Menu' })).toBeTruthy()
  })

  it('follows the window across breakpoints', () => {
    const media = mockMatchMedia()
    render(<App />)
    expect(screen.getByRole('button', { name: 'File' })).toBeTruthy()
    media.setMatching([COMPACT_QUERY, PHONE_QUERY])
    expect(screen.queryByRole('button', { name: 'File' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Menu' })).toBeTruthy()
  })
})
