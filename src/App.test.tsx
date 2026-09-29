import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'
import { SHAPES } from './core/shapes'
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

    for (const label of ['Clipboard', 'Image', 'Tools', 'Shapes', 'Colors']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    const labels = [...document.querySelectorAll('.ribbon-group-label')].map((label) => label.textContent)
    expect(labels).not.toContain('Size')

    const paste = screen.getByRole('button', { name: 'Paste' })
    expect(topbar?.contains(paste)).toBe(true)

    const cut = screen.getByRole('button', { name: 'Cut' })
    expect(topbar?.contains(cut)).toBe(true)

    const copy = screen.getByRole('button', { name: 'Copy' })
    expect(topbar?.contains(copy)).toBe(true)
  })

  it('shows copy as a large button beside a stack of cut and paste', () => {
    render(<App />)
    const copy = screen.getByRole('button', { name: 'Copy' })
    const cut = screen.getByRole('button', { name: 'Cut' })
    const paste = screen.getByRole('button', { name: 'Paste' })

    expect(copy.classList.contains('icon-button-large')).toBe(true)

    const stack = cut.parentElement
    expect(stack?.classList.contains('button-stack')).toBe(true)
    expect(paste.parentElement).toBe(stack)
    expect([...(stack?.children ?? [])]).toEqual([cut, paste])
    expect(stack?.previousElementSibling).toBe(copy)
  })

  it('puts a large select button in its own group between clipboard and image', () => {
    render(<App />)
    const select = screen.getByRole('button', { name: 'Select' })
    expect(select.closest('.dropdown-trigger-large')).toBeTruthy()

    const group = select.closest('.ribbon-group')
    expect(group?.querySelector('.ribbon-group-label')?.textContent).toBe('Selection')

    const labels = [...document.querySelectorAll('.ribbon-group-label')].map((label) => label.textContent)
    expect(labels.slice(0, 3)).toEqual(['Clipboard', 'Selection', 'Image'])
  })

  it('lists the selection commands in the select menu', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Select options' }))
    const items = screen
      .getAllByRole('menuitem')
      .map((item) => item.querySelector('.menu-item-label')?.textContent)
    expect(items).toEqual([
      'Rectangular selection',
      'Free-form selection',
      'Select all',
      'Invert selection',
      'Transparent selection',
      'Clear selection',
    ])
    expect(screen.getByRole('separator')).toBeTruthy()
  })

  it('switches to the select tool with a free-form shape', () => {
    render(<App />)
    const select = screen.getByRole('button', { name: 'Select' })
    fireEvent.click(screen.getByRole('button', { name: 'Select options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Free-form selection' }))
    expect(select.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Select options' }))
    const freeform = screen.getByRole('menuitem', { name: 'Free-form selection' })
    expect(freeform.querySelector('svg')).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Rectangular selection' }).querySelector('svg')).toBeNull()
  })

  it('select all activates the select tool', () => {
    render(<App />)
    const select = screen.getByRole('button', { name: 'Select' })
    fireEvent.click(screen.getByRole('button', { name: 'Select options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Select all/ }))
    expect(select.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Crop' }).hasAttribute('disabled')).toBe(false)
  })

  it('arranges the image commands in a two by two grid', () => {
    render(<App />)
    const names = ['Crop', 'Rotate', 'Scale', 'Flip']
    const buttons = names.map((name) => screen.getByRole('button', { name }))
    const grid = buttons[0].closest('.button-grid')
    expect(grid).toBeTruthy()
    const cells = buttons.map((button) => [...grid!.children].find((cell) => cell.contains(button)))
    expect(cells.every(Boolean)).toBe(true)
    expect(cells.map((cell) => [...grid!.children].indexOf(cell!))).toEqual([0, 1, 2, 3])
  })

  it('arranges the tools in two rows of three', () => {
    render(<App />)
    const names = ['Pencil', 'Fill with color', 'Text', 'Eraser', 'Color picker', 'Zoom']
    const buttons = names.map((name) => screen.getByRole('button', { name }))
    const grid = buttons[0].closest('.tool-grid')
    expect(grid).toBeTruthy()
    expect([...grid!.children]).toEqual(buttons)
    expect(grid!.closest('.ribbon-group')?.querySelector('.ribbon-group-label')?.textContent).toBe('Tools')
  })

  it('keeps brush and airbrush in a brushes group', () => {
    render(<App />)
    const brush = screen.getByRole('button', { name: 'Brush' })
    const airbrush = screen.getByRole('button', { name: 'Airbrush' })
    const group = brush.closest('.ribbon-group')
    expect(group?.contains(airbrush)).toBe(true)
    expect(group?.querySelector('.ribbon-group-label')?.textContent).toBe('Brushes')
  })

  it('selects the zoom tool', () => {
    render(<App />)
    const zoom = screen.getByRole('button', { name: 'Zoom' })
    fireEvent.click(zoom)
    expect(zoom.getAttribute('aria-pressed')).toBe('true')
  })

  it('stacks the primary colour above the secondary colour', () => {
    const { container } = render(<App />)
    const swatches = [...container.querySelectorAll('.current-colors .color-swatch')]
    expect(swatches.map((swatch) => swatch.classList.contains('primary'))).toEqual([true, false])
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

  it('selects the remembered selection shape from the select icon', () => {
    render(<App />)
    const select = screen.getByRole('button', { name: 'Select' })
    fireEvent.click(select)
    expect(select.getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Pencil' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Free-form selection' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pencil' }))
    fireEvent.click(select)
    fireEvent.click(screen.getByRole('button', { name: 'Select options' }))
    expect(screen.getByRole('menuitem', { name: 'Free-form selection' }).querySelector('svg')).toBeTruthy()
  })

  it('rotates right from the rotate icon and repeats the last rotation', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByText('600 × 800 px')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Rotate options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rotate 180°' }))
    expect(screen.getByText('600 × 800 px')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }))
    expect(screen.getByText('600 × 800 px')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Rotate options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rotate left 90°' }))
    expect(screen.getByText('800 × 600 px')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }))
    expect(screen.getByText('600 × 800 px')).toBeTruthy()
  })

  it('flips from the flip icon without opening the menu', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Flip' }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(false)
  })

  it('lists the flip modes', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Flip options' }))
    expect(screen.getByText('Flip horizontal')).toBeTruthy()
    expect(screen.getByText('Flip vertical')).toBeTruthy()
  })

  it('lists the rotate modes', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Rotate options' }))
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent)
    expect(items).toEqual([
      'Rotate right 90°',
      'Rotate left 90°',
      'Rotate 180°',
      'Custom rotation…',
    ])
  })

  it('opens the custom rotation dialog and applies an angle', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Rotate options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Custom rotation…' }))
    expect(screen.getByRole('dialog', { name: 'Rotate' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Degrees/), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('cancels the custom rotation dialog', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Rotate options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Custom rotation…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not apply an invalid custom rotation', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Rotate options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Custom rotation…' }))
    fireEvent.change(screen.getByLabelText(/Degrees/), { target: { value: '' } })
    const apply = screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement
    expect(apply.disabled).toBe(true)
    fireEvent.click(apply)
    expect(screen.getByRole('dialog', { name: 'Rotate' })).toBeTruthy()
  })

  it('keeps the pixel grid toggle in the status bar', () => {
    const { container } = render(<App />)
    const statusbar = container.querySelector('.statusbar')
    expect(statusbar?.contains(screen.getByRole('button', { name: 'Toggle pixel grid' }))).toBe(
      true,
    )
  })

  const shapesGroup = () =>
    [...document.querySelectorAll('.ribbon-group')].find(
      (group) => group.querySelector('.ribbon-group-label')?.textContent === 'Shapes',
    ) as HTMLElement

  it('shows every shape in a gallery box inside the shapes group', () => {
    render(<App />)
    const group = shapesGroup()
    expect(group).toBeTruthy()
    const gallery = group.querySelector('.shape-gallery') as HTMLElement
    expect(gallery).toBeTruthy()
    const buttons = within(gallery).getAllByRole('button')
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(SHAPES.map((shape) => shape.label))
    expect(buttons.map((button) => button.getAttribute('title'))).toEqual(SHAPES.map((shape) => shape.label))
    expect(buttons.every((button) => button.querySelector('svg path'))).toBe(true)
  })

  it('selects a shape from the gallery and activates the shape tool', () => {
    render(<App />)
    const star = screen.getByRole('button', { name: 'Five-point star' })
    expect(star.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(star)
    expect(star.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Rectangle' }).getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Pencil' }))
    expect(star.getAttribute('aria-pressed')).toBe('false')
  })

  it('stacks the size dropdown above the fill dropdown in the shapes group', () => {
    render(<App />)
    const group = shapesGroup()
    const size = screen.getByRole('button', { name: 'Size' })
    const fill = screen.getByRole('button', { name: 'Fill' })
    expect(group.contains(size)).toBe(true)
    expect(group.contains(fill)).toBe(true)
    expect(size.getAttribute('title')).toBe('Outline size')
    const stack = size.closest('.shape-options')
    expect(stack).toBeTruthy()
    expect(stack?.contains(fill)).toBe(true)
    expect(size.compareDocumentPosition(fill) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const gallery = group.querySelector('.shape-gallery')!
    expect(gallery.compareDocumentPosition(stack!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('changes the shape fill from the fill dropdown', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Fill' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Filled' }))
    expect(screen.getByRole('button', { name: 'Fill' }).textContent).toContain('Filled')
  })

  it('selects line, rectangle and ellipse shapes with L, R and O', () => {
    render(<App />)
    for (const [key, name] of [
      ['r', 'Rectangle'],
      ['l', 'Line'],
      ['o', 'Ellipse'],
    ]) {
      fireEvent.keyDown(window, { key })
      expect(screen.getByRole('button', { name }).getAttribute('aria-pressed')).toBe('true')
    }
  })

  it('selects the shape tool with U', () => {
    render(<App />)
    fireEvent.keyDown(window, { key: 'u' })
    expect(screen.getByRole('button', { name: 'Rectangle' }).getAttribute('aria-pressed')).toBe('true')
  })
})
