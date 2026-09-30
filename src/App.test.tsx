import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { SHAPES } from './core/shapes'
import { CUSTOM_COLORS_KEY } from './core/customColors'
import { ZOOM_LEVELS } from './core/zoom'
import { BRUSH_SIZES } from './core/tools'
import { strokePreviewWidth } from './core/strokeWave'

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
    expect(within(screen.getByRole('menu')).getByRole('separator')).toBeTruthy()
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

  it('scales the whole image when nothing is selected', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Scale' }))
    expect(screen.getByRole('dialog', { name: 'Scale image' })).toBeTruthy()
  })

  it('scales the selection when there is one', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Select options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Select all/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Scale' }))
    const dialog = screen.getByRole('dialog', { name: 'Scale selection' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))
    expect(screen.getByText('Scaled selection to 800 × 600')).toBeTruthy()
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

  it('puts the brush kinds behind a single split button in the brushes group', () => {
    render(<App />)
    const brush = screen.getByRole('button', { name: 'Brush' })
    expect(brush.closest('.dropdown-trigger-large')).toBeTruthy()
    expect(brush.closest('.ribbon-group')?.querySelector('.ribbon-group-label')?.textContent).toBe('Brushes')

    fireEvent.click(screen.getByRole('button', { name: 'Brush options' }))
    const items = screen
      .getAllByRole('menuitem')
      .map((item) => item.querySelector('.menu-item-label')?.textContent)
    expect(items).toEqual([
      'Circle sharp',
      'Circle blurred',
      'Natural brush',
      'Calligraphy pen',
      'Highlighter pen',
      'Selective blurring',
      'Smudge',
      'Liquify',
    ])
  })

  it('selects a brush kind and activates the brush tool', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Brush options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Smudge' }))
    expect(screen.getByRole('button', { name: 'Brush' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Brush options' }))
    expect(screen.getByRole('menuitem', { name: 'Smudge' }).querySelector('svg')).toBeTruthy()
  })

  it('shows the floating text controls only while a text box is open', () => {
    render(<App />)
    expect(screen.queryByLabelText('Text size')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Text' }))
    expect(screen.queryByLabelText('Text size')).toBeNull()

    const canvas = document.querySelector('.paint-canvas') as HTMLCanvasElement
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 40, clientY: 40 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 40, clientY: 40 })
    expect(screen.getByLabelText('Text size')).toBeTruthy()

    const undo = screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement
    fireEvent.click(screen.getByRole('button', { name: 'Italic' }))
    expect(screen.getByRole('button', { name: 'Italic' }).getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('.text-editor')).not.toBeNull()
    expect(undo.disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Font' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Georgia' }))
    expect(screen.getByRole('button', { name: 'Font' }).textContent).toContain('Georgia')
  })

  it('shows icons in the file and edit menus', () => {
    render(<App />)
    fireEvent.click(screen.getByText('File'))
    const fileItems = screen.getAllByRole('menuitem')
    expect(fileItems.map((item) => item.querySelector('.menu-item-label')?.textContent)).toEqual([
      'New',
      'Open…',
      'Save as PNG',
      'Clear canvas',
    ])
    expect(fileItems.every((item) => item.querySelector('svg'))).toBe(true)

    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByText('Edit'))
    const editItems = screen.getAllByRole('menuitem')
    expect(editItems.map((item) => item.querySelector('.menu-item-label')?.textContent)).toEqual([
      'Undo',
      'Redo',
      'Cut',
      'Copy',
      'Paste',
      'Copy visible layers',
    ])
    expect(editItems.every((item) => item.querySelector('svg'))).toBe(true)
  })

  it('lists the view options and opens the zoom submenu', () => {
    render(<App />)
    fireEvent.click(screen.getByText('View'))
    const topItems = screen
      .getAllByRole('menuitem')
      .map((item) => item.querySelector('.menu-item-label')?.textContent)
    expect(topItems).toEqual(['Zoom', 'Pixel grid', 'Fullscreen', 'Miniature view'])

    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /^Zoom$/ }))
    const openItems = screen
      .getAllByRole('menuitem')
      .map((item) => item.querySelector('.menu-item-label')?.textContent)
    expect(openItems).toEqual([
      'Zoom',
      'Zoom in',
      'Zoom out',
      '100%',
      'Fit to window',
      'Pixel grid',
      'Fullscreen',
      'Miniature view',
    ])
  })

  it('toggles the pixel grid from the view menu', () => {
    render(<App />)
    fireEvent.click(screen.getByText('View'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Pixel grid/ }))
    expect(screen.getByRole('button', { name: 'Toggle pixel grid' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('shows the miniature view from the view menu', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByText('View'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Miniature view/ }))
    expect(container.querySelector('.miniature-view')).toBeTruthy()
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

  it('links to the GitHub repository from the menubar', () => {
    const { container } = render(<App />)
    const menubar = container.querySelector('.menubar')
    const link = screen.getByRole('link', { name: 'GitHub repository' })
    expect(link.getAttribute('href')).toBe('https://github.com/ftobler/farbtopf')
    expect(menubar?.contains(link)).toBe(true)
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

  it('zooms with ctrl and the mouse wheel', () => {
    const { container } = render(<App />)
    const workspace = container.querySelector('.workspace') as HTMLElement
    fireEvent.wheel(workspace, { ctrlKey: true, deltaY: -100 })
    expect(screen.getByRole('button', { name: '150%' })).toBeTruthy()
    fireEvent.wheel(workspace, { ctrlKey: true, deltaY: 100 })
    expect(screen.getByRole('button', { name: '100%' })).toBeTruthy()
  })

  it('pans the canvas while dragging with the middle mouse button', () => {
    const { container } = render(<App />)
    const workspace = container.querySelector('.workspace') as HTMLElement
    const frame = container.querySelector('.canvas-frame') as HTMLElement
    workspace.setPointerCapture = () => {}
    fireEvent.pointerDown(workspace, { button: 1, pointerId: 7, clientX: 200, clientY: 200 })
    fireEvent.pointerMove(workspace, { pointerId: 7, clientX: 230, clientY: 210 })
    expect(frame.style.transform).toBe('translate(30px, 10px)')
    fireEvent.pointerUp(workspace, { pointerId: 7, clientX: 230, clientY: 210 })
  })

  it('overlays the workspace with custom scrollbars', () => {
    const { container } = render(<App />)
    const workspace = container.querySelector('.workspace') as HTMLElement
    const scrollbars = container.querySelector('.workspace-scrollbars')
    expect(scrollbars).toBeTruthy()
    expect(workspace.contains(scrollbars)).toBe(true)

    const x = container.querySelector('.workspace-scrollbar[data-axis="x"]') as HTMLElement
    const y = container.querySelector('.workspace-scrollbar[data-axis="y"]') as HTMLElement
    expect(x).toBeTruthy()
    expect(y).toBeTruthy()
    expect(x.dataset.visible).toBe('false')

    fireEvent.pointerEnter(workspace)
    expect(x.dataset.visible).toBe('true')
    expect(y.dataset.visible).toBe('true')
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
    expect(size.getAttribute('title')).toBe('Stroke size')
    expect(size.querySelector('svg.stroke-size-icon')).toBeTruthy()
    expect(size.querySelector('.size-dot')).toBeNull()
    const stack = size.closest('.shape-options')
    expect(stack).toBeTruthy()
    expect(stack?.contains(fill)).toBe(true)
    expect(size.compareDocumentPosition(fill) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const gallery = group.querySelector('.shape-gallery')!
    expect(gallery.compareDocumentPosition(stack!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders the size dropdown as a single column with text labels', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Size' }))
    const menu = document.querySelector<HTMLElement>('.size-menu')
    expect(menu).toBeTruthy()
    const options = [...menu!.querySelectorAll('.size-option')]
    expect(options).toHaveLength(BRUSH_SIZES.length)
    expect(options.map((option) => option.querySelector('.size-label')?.textContent)).toEqual(
      BRUSH_SIZES.map((size) => `${size} px`),
    )
    expect(menu!.style.flexDirection).toBe('column')
  })

  it('previews every size in the sine wave dropdown as a wave drawn at that thickness', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Size' }))
    const options = [...document.querySelectorAll<HTMLElement>('.size-menu .size-option')]
    expect(options).toHaveLength(BRUSH_SIZES.length)
    const widths = options.map((option, i) => {
      expect(option.querySelector('.size-line')).toBeNull()
      const wave = option.querySelector('svg.size-wave')
      expect(wave).toBeTruthy()
      expect(wave!.getAttribute('stroke')).toBe('currentColor')
      expect(wave!.getAttribute('stroke-linecap')).toBe('round')
      const path = wave!.querySelector('path')!
      expect(path.getAttribute('d')).toMatch(/C.*S/)
      const width = Number(path.getAttribute('stroke-width'))
      expect(width).toBe(strokePreviewWidth(BRUSH_SIZES[i]))
      return width
    })
    for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeGreaterThan(widths[i - 1])
  })

  it('starts on a size the dropdown can show and steps it with [ and ]', () => {
    render(<App />)
    const pressedSize = () => {
      const trigger = screen.getByRole('button', { name: 'Size' })
      fireEvent.click(trigger)
      const option = document.querySelector<HTMLElement>('.size-option[aria-pressed="true"]')
      const label = option?.querySelector('.size-label')?.textContent ?? null
      fireEvent.click(trigger)
      return label
    }
    const initial = pressedSize()
    expect(initial).toBe('4 px')
    fireEvent.keyDown(window, { key: ']' })
    expect(pressedSize()).toBe('5 px')
    fireEvent.keyDown(window, { key: '[' })
    expect(pressedSize()).toBe('4 px')
  })

  it('keeps a size per tool', () => {
    render(<App />)
    const pressedSize = () => {
      const trigger = screen.getByRole('button', { name: 'Size' })
      fireEvent.click(trigger)
      const option = document.querySelector<HTMLElement>('.size-option[aria-pressed="true"]')
      const label = option?.querySelector('.size-label')?.textContent ?? null
      fireEvent.click(trigger)
      return label
    }
    expect(pressedSize()).toBe('4 px')
    fireEvent.click(screen.getByRole('button', { name: 'Pencil' }))
    expect(pressedSize()).toBe('1 px')
    fireEvent.keyDown(window, { key: ']' })
    fireEvent.keyDown(window, { key: ']' })
    expect(pressedSize()).toBe('3 px')
    fireEvent.click(screen.getByRole('button', { name: 'Brush' }))
    expect(pressedSize()).toBe('4 px')
    fireEvent.click(screen.getByRole('button', { name: 'Pencil' }))
    expect(pressedSize()).toBe('3 px')
  })

  it('sizes the last sized tool while an unsized tool is active', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Eraser' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fill with color' }))
    fireEvent.keyDown(window, { key: ']' })
    fireEvent.click(screen.getByRole('button', { name: 'Eraser' }))
    const trigger = screen.getByRole('button', { name: 'Size' })
    fireEvent.click(trigger)
    const option = document.querySelector<HTMLElement>('.size-option[aria-pressed="true"]')
    expect(option?.querySelector('.size-label')?.textContent).toBe('5 px')
  })

  it('steps past the largest preset and shows a size that is not a preset', () => {
    render(<App />)
    for (let i = 0; i < 12; i += 1) fireEvent.keyDown(window, { key: ']' })
    const trigger = screen.getByRole('button', { name: 'Size' })
    fireEvent.click(trigger)
    // No preset is highlighted, but the current size is shown.
    expect(document.querySelector('.size-option[aria-pressed="true"]')).toBeNull()
    const current = document.querySelector<HTMLElement>('.size-current')
    expect(current?.textContent).toMatch(/^\d+ px$/)
    const value = parseInt(current?.textContent ?? '', 10)
    expect(value).toBeGreaterThan(32)
    expect(value).toBeLessThanOrEqual(500)
    // Picking a preset brings the size back to the preset.
    fireEvent.click(screen.getByRole('button', { name: /^12 px/ }))
    fireEvent.click(trigger)
    expect(document.querySelector('.size-current')).toBeNull()
    expect(document.querySelector('.size-option[aria-pressed="true"] .size-label')?.textContent).toBe('12 px')
  })

  it('never steps past 500 px', () => {
    render(<App />)
    for (let i = 0; i < 60; i += 1) fireEvent.keyDown(window, { key: ']' })
    fireEvent.click(screen.getByRole('button', { name: 'Size' }))
    expect(document.querySelector('.size-current')?.textContent).toBe('500 px')
  })

  it('changes the shape fill from the fill dropdown', () => {
    render(<App />)
    const trigger = screen.getByRole('button', { name: 'Fill' })
    expect(trigger.querySelector('svg')).toBeTruthy()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Filled' }))
    expect(trigger.querySelector('svg')).toBeTruthy()
  })

  it('shows an icon next to every option in the fill dropdown', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Fill' }))
    for (const label of ['Outline', 'Filled', 'Outline + fill']) {
      expect(screen.getByRole('menuitem', { name: label }).querySelector('svg')).toBeTruthy()
    }
  })

  it('renders an icon on the fill trigger for every fill option', () => {
    render(<App />)
    for (const label of ['Filled', 'Outline + fill', 'Outline']) {
      const trigger = screen.getByRole('button', { name: 'Fill' })
      fireEvent.click(trigger)
      fireEvent.click(screen.getByRole('menuitem', { name: label }))
      expect(screen.getByRole('button', { name: 'Fill' }).querySelector('svg')).toBeTruthy()
    }
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

  it('opens the canvas context menu on right-click with the expected items', () => {
    const { container } = render(<App />)
    const workspace = container.querySelector('.workspace') as HTMLElement
    fireEvent.contextMenu(workspace, { clientX: 120, clientY: 80 })
    const menu = screen.getByRole('menu')
    expect(menu.classList.contains('dropdown-menu')).toBe(true)
    expect(menu.classList.contains('context-menu')).toBe(true)
    const items = screen
      .getAllByRole('menuitem')
      .map((item) => item.querySelector('.menu-item-label')?.textContent)
    expect(items).toEqual([
      'Cut',
      'Copy',
      'Paste',
      'Crop',
      'Select all',
      'Invert selection',
      'Delete',
      'Rotate',
      'Flip',
      'Resize',
      'Invert color',
    ])
  })

  it('shows an icon next to every canvas context menu entry', () => {
    const { container } = render(<App />)
    fireEvent.contextMenu(container.querySelector('.workspace') as HTMLElement, { clientX: 40, clientY: 40 })
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Rotate' }))
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Flip' }))
    const items = screen.getAllByRole('menuitem')
    expect(items.length).toBeGreaterThan(11)
    for (const item of items) {
      const slot = item.querySelector('.menu-item-icon')
      expect(slot, item.textContent ?? '').not.toBeNull()
      expect(slot?.querySelector('svg'), item.textContent ?? '').not.toBeNull()
    }
  })

  it('opens the rotate submenu from the context menu', () => {
    const { container } = render(<App />)
    fireEvent.contextMenu(container.querySelector('.workspace') as HTMLElement, { clientX: 40, clientY: 40 })
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Rotate' }))
    expect(screen.getByRole('menuitem', { name: 'Rotate left 90°' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Rotate right 90°' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Rotate 180°' })).toBeTruthy()
  })

  it('runs a context menu action and closes the menu', () => {
    const { container } = render(<App />)
    fireEvent.contextMenu(container.querySelector('.workspace') as HTMLElement, { clientX: 10, clientY: 10 })
    fireEvent.click(screen.getByRole('menuitem', { name: /^Select all/ }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'Crop' }).hasAttribute('disabled')).toBe(false)
  })

  it('closes the context menu on Escape', () => {
    const { container } = render(<App />)
    fireEvent.contextMenu(container.querySelector('.workspace') as HTMLElement, { clientX: 10, clientY: 10 })
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('keeps the context menu inside the viewport', () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 100,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    } as DOMRect)
    try {
      const { container } = render(<App />)
      fireEvent.contextMenu(container.querySelector('.workspace') as HTMLElement, {
        clientX: 99999,
        clientY: 99999,
      })
      const menu = screen.getByRole('menu') as HTMLElement
      expect(menu.style.left).toBe(`${Math.max(0, window.innerWidth - 200)}px`)
      expect(menu.style.top).toBe(`${Math.max(0, window.innerHeight - 100)}px`)
    } finally {
      spy.mockRestore()
    }
  })

  it('opens a submenu to the left when it would overflow the right edge', () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 5000,
      bottom: 5000,
      width: 5000,
      height: 5000,
      toJSON: () => ({}),
    } as DOMRect)
    try {
      const { container } = render(<App />)
      fireEvent.contextMenu(container.querySelector('.workspace') as HTMLElement, { clientX: 10, clientY: 10 })
      fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Rotate' }))
      const panel = screen.getByRole('menuitem', { name: 'Rotate left 90°' }).closest('.menu-submenu-panel')
      expect(panel?.classList.contains('menu-submenu-panel-left')).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })

  it('does not clear the selection when Escape dismisses the context menu', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Select options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Select all/ }))
    expect(screen.getByRole('button', { name: 'Crop' }).hasAttribute('disabled')).toBe(false)
    fireEvent.contextMenu(container.querySelector('.workspace') as HTMLElement, { clientX: 10, clientY: 10 })
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'Crop' }).hasAttribute('disabled')).toBe(false)
  })

  it('does not clear the selection when Escape dismisses a ribbon dropdown', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Select options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^Select all/ }))
    expect(screen.getByRole('button', { name: 'Crop' }).hasAttribute('disabled')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Size' }))
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'Crop' }).hasAttribute('disabled')).toBe(false)
  })
})

describe('tool size and opacity sliders', () => {
  const panel = () => screen.queryByRole('group', { name: 'Tool size and opacity' })
  const sizeSlider = () => screen.getByRole('slider', { name: 'Size' })
  const opacitySlider = () => screen.getByRole('slider', { name: 'Opacity' })

  it('floats on the left of the workspace for the sized tools only', () => {
    const { container } = render(<App />)
    const workspace = container.querySelector('.workspace') as HTMLElement
    expect(panel()).toBeTruthy()
    expect(workspace.contains(panel())).toBe(true)
    // Tool shortcuts: pencil, airbrush, eraser, shape, brush are sized...
    for (const key of ['p', 'a', 'e', 'u', 'b']) {
      fireEvent.keyDown(window, { key })
      expect(panel(), key).toBeTruthy()
    }
    // ...fill, picker, text, zoom and select are not.
    for (const key of ['f', 'k', 't', 'z', 's']) {
      fireEvent.keyDown(window, { key })
      expect(panel(), key).toBeNull()
    }
  })

  it('shows the size and opacity of the current tool', () => {
    render(<App />)
    expect(sizeSlider().getAttribute('aria-valuetext')).toBe('4 px')
    expect(opacitySlider().getAttribute('aria-valuetext')).toBe('100%')
    fireEvent.click(screen.getByRole('button', { name: 'Pencil' }))
    expect(sizeSlider().getAttribute('aria-valuetext')).toBe('1 px')
  })

  it('changes the size from the slider, also to sizes that are not presets', () => {
    render(<App />)
    fireEvent.keyDown(sizeSlider(), { key: 'ArrowUp' })
    fireEvent.keyDown(sizeSlider(), { key: 'ArrowUp' })
    expect(sizeSlider().getAttribute('aria-valuenow')).toBe('6')
    fireEvent.click(screen.getByRole('button', { name: 'Size' }))
    expect(document.querySelector('.size-option[aria-pressed="true"]')).toBeNull()
    expect(document.querySelector('.size-current')?.textContent).toBe('6 px')
  })

  it('moves the slider when a preset is picked from the dropdown', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Size' }))
    fireEvent.click(screen.getByRole('button', { name: /^20 px/ }))
    expect(sizeSlider().getAttribute('aria-valuenow')).toBe('20')
    expect(sizeSlider().getAttribute('aria-valuetext')).toBe('20 px')
  })

  it('changes the opacity of the current tool only', () => {
    render(<App />)
    fireEvent.keyDown(opacitySlider(), { key: 'PageDown' })
    expect(opacitySlider().getAttribute('aria-valuetext')).toBe('90%')
    fireEvent.click(screen.getByRole('button', { name: 'Eraser' }))
    expect(opacitySlider().getAttribute('aria-valuetext')).toBe('100%')
    fireEvent.click(screen.getByRole('button', { name: 'Brush' }))
    expect(opacitySlider().getAttribute('aria-valuetext')).toBe('90%')
  })
})

describe('custom color picker', () => {
  const primary = () => screen.getByLabelText('Primary color') as HTMLInputElement
  const secondary = () => screen.getByLabelText('Secondary color') as HTMLInputElement
  const openPicker = () => fireEvent.click(screen.getByRole('button', { name: 'Custom colors' }))

  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the picker trigger to the right of the swatch grid', () => {
    const { container } = render(<App />)
    const swatches = container.querySelector('.swatches') as HTMLElement
    const trigger = screen.getByRole('button', { name: 'Custom colors' })
    expect(swatches.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('updates the primary color from the hex input', () => {
    render(<App />)
    openPicker()
    expect(screen.getByRole('dialog', { name: 'Color picker' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Hex color'), { target: { value: '#123456' } })
    expect(primary().value).toBe('#123456')
  })

  it('ignores an invalid hex value', () => {
    render(<App />)
    openPicker()
    fireEvent.change(screen.getByLabelText('Hex color'), { target: { value: 'nope' } })
    expect(primary().value).toBe('#000000')
  })

  it('updates the color from the RGB inputs', () => {
    render(<App />)
    openPicker()
    fireEvent.change(screen.getByLabelText('Red'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Green'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('Blue'), { target: { value: '30' } })
    expect(primary().value).toBe('#0a141e')
  })

  it('applies the picked color to the secondary slot', () => {
    render(<App />)
    openPicker()
    fireEvent.click(screen.getByRole('button', { name: 'Secondary' }))
    fireEvent.change(screen.getByLabelText('Hex color'), { target: { value: '#00ff00' } })
    expect(secondary().value).toBe('#00ff00')
    expect(primary().value).toBe('#000000')
  })

  it('closes the picker on Escape', () => {
    render(<App />)
    openPicker()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Color picker' })).toBeNull()
  })

  it('reserves a third palette row of ten empty custom slots', () => {
    const { container } = render(<App />)
    const row = container.querySelector('.swatches .custom-row') as HTMLElement
    expect(row).toBeTruthy()
    expect(row.querySelectorAll('.swatch-empty')).toHaveLength(10)
    expect(row.querySelectorAll('.swatch.custom')).toHaveLength(0)
  })

  it('fills custom colors into the third row ahead of the empty slots', () => {
    localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(['#abcdef', '#123456']))
    const { container } = render(<App />)
    const row = container.querySelector('.swatches .custom-row') as HTMLElement
    const slots = [...row.children]
    expect(slots).toHaveLength(10)
    expect(slots[0].getAttribute('aria-label')).toBe('Custom color #abcdef')
    expect(slots[1].getAttribute('aria-label')).toBe('Custom color #123456')
    expect(row.querySelectorAll('.swatch-empty')).toHaveLength(8)
  })

  it('adds a custom swatch and persists it', () => {
    render(<App />)
    openPicker()
    fireEvent.change(screen.getByLabelText('Hex color'), { target: { value: '#abcdef' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add custom color' }))
    expect(screen.getByRole('button', { name: 'Custom color #abcdef' })).toBeTruthy()
    expect(JSON.parse(localStorage.getItem(CUSTOM_COLORS_KEY) ?? '[]')).toEqual(['#abcdef'])
  })

  it('reloads custom swatches on remount', () => {
    const first = render(<App />)
    openPicker()
    fireEvent.change(screen.getByLabelText('Hex color'), { target: { value: '#abcdef' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add custom color' }))
    first.unmount()
    render(<App />)
    expect(screen.getByRole('button', { name: 'Custom color #abcdef' })).toBeTruthy()
  })

  it('picks custom swatches with click and context menu', () => {
    localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(['#abcdef']))
    render(<App />)
    const swatch = screen.getByRole('button', { name: 'Custom color #abcdef' })
    fireEvent.contextMenu(swatch)
    expect(secondary().value).toBe('#abcdef')
    fireEvent.click(swatch)
    expect(primary().value).toBe('#abcdef')
  })

  it('removes a custom swatch from the picker', () => {
    localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(['#abcdef']))
    render(<App />)
    openPicker()
    fireEvent.click(screen.getByRole('button', { name: 'Remove custom color #abcdef' }))
    expect(screen.queryByRole('button', { name: 'Custom color #abcdef' })).toBeNull()
  })

  it('toggles the layers panel from the ribbon and adds layers', () => {
    render(<App />)
    expect(within(screen.getByRole('banner')).queryByRole('button', { name: 'Layers' })).toBeNull()
    const toggle = screen.getByRole('button', { name: 'Layers' })
    expect(toggle.closest('.ribbon-group')?.previousElementSibling?.previousElementSibling?.textContent).toContain('Colors')
    expect(screen.queryByRole('complementary', { name: 'Layers panel' })).toBeNull()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    const list = screen.getByRole('listbox', { name: 'Layers' })
    const names = () => within(list).getAllByRole('option').map((row) => row.getAttribute('aria-label'))
    expect(names()).toEqual(['Background'])
    fireEvent.click(screen.getByRole('button', { name: 'New layer' }))
    expect(names()).toEqual(['Layer 2', 'Background'])
    expect(within(list).getByRole('option', { name: 'Layer 2' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(toggle)
    expect(screen.queryByRole('complementary', { name: 'Layers panel' })).toBeNull()
  })

  it('offers copy visible layers in the Edit menu after a divider', () => {
    render(<App />)
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Edit' }))
    const item = screen.getByRole('menuitem', { name: /Copy visible layers/ })
    expect(item.previousElementSibling?.getAttribute('role')).toBe('separator')
    fireEvent.click(item)
    expect(screen.getByText('Clipboard copy is not supported here')).toBeTruthy()
  })

  it('opens only the layer menu when a layer is right-clicked', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Layers' }))
    fireEvent.contextMenu(screen.getByRole('option', { name: 'Background' }), { clientX: 20, clientY: 20 })
    expect(screen.getAllByRole('menu')).toHaveLength(1)
    expect(screen.getByRole('menuitem', { name: /Delete layer/ })).toBeTruthy()
  })
})
