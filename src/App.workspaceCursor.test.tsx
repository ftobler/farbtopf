import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

function setup() {
  const { container } = render(<App />)
  const workspace = container.querySelector('.workspace') as HTMLElement
  const canvas = container.querySelector('.paint-canvas') as HTMLCanvasElement
  const pick = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
  return { container, workspace, canvas, pick }
}

describe('App cursor over the workspace around the image', () => {
  it('keeps the crosshair over the background with the Select tool', () => {
    const { workspace, canvas, pick } = setup()
    pick('Select')
    expect(workspace.getAttribute('data-tool-cursor')).toBe('crosshair')
    expect(canvas.style.cursor).toBe('crosshair')
  })

  it.each(['Pencil', 'Brush', 'Eraser', 'Fill with color', 'Color picker', 'Text', 'Zoom'])(
    'shows the normal cursor over the background with the %s tool, which does nothing there',
    (name) => {
      const { workspace, pick } = setup()
      pick(name)
      expect(workspace.hasAttribute('data-tool-cursor')).toBe(false)
    },
  )

  it('switches with the tool', () => {
    const { workspace, canvas, pick } = setup()
    pick('Fill with color')
    expect(workspace.hasAttribute('data-tool-cursor')).toBe(false)
    expect(canvas.style.cursor).toMatch(/^url\("data:image\/svg\+xml,.+, crosshair$/)
    pick('Select')
    expect(workspace.getAttribute('data-tool-cursor')).toBe('crosshair')
  })

  it('shows the pencil cursor over the image, but not around it', () => {
    const { workspace, canvas, pick } = setup()
    pick('Pencil')
    expect(canvas.style.cursor).toMatch(/^url\("data:image\/svg\+xml,.+, crosshair$/)
    expect(workspace.hasAttribute('data-tool-cursor')).toBe(false)
  })

  it('keeps the resize cursors on the selection handles', () => {
    const { container, pick } = setup()
    pick('Select')
    fireEvent.click(screen.getByRole('button', { name: 'Select options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Select all/ }))
    const handles = Array.from(container.querySelectorAll<HTMLElement>('.canvas-frame [style*="resize"]'))
    expect(handles.length).toBeGreaterThan(0)
    expect(handles.map((handle) => handle.style.cursor)).toContain('nwse-resize')
  })
})
