import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BLACK, WHITE } from '../core/color'
import { DEFAULT_PALETTE } from '../core/palette'
import { Ribbon, type RibbonProps } from './Ribbon'

function renderRibbon(overrides: Partial<RibbonProps> = {}) {
  const noop = vi.fn()
  const props: RibbonProps = {
    tool: 'pencil',
    onToolChange: noop,
    brushSize: 3,
    onBrushSizeChange: noop,
    shapeFill: 'outline',
    onShapeFillChange: noop,
    shapeKind: 'rectangle',
    onShapeKindChange: noop,
    hasSelection: false,
    onCrop: noop,
    onScale: noop,
    onFlip: noop,
    onRotate: noop,
    lastRotation: 90,
    lastFlip: 'horizontal',
    onCustomRotate: noop,
    onPaste: noop,
    onCut: noop,
    onCopy: noop,
    primary: BLACK,
    secondary: WHITE,
    palette: DEFAULT_PALETTE,
    customColors: [],
    onPrimaryChange: noop,
    onSecondaryChange: noop,
    onSwap: noop,
    onAddCustomColor: noop,
    onRemoveCustomColor: noop,
    showLayers: false,
    onToggleLayers: noop,
    transparentSelection: false,
    onTransparentSelectionChange: noop,
    selectionShape: 'rectangle',
    onSelectionShapeChange: noop,
    onSelectAll: noop,
    onInvertSelection: noop,
    onDeleteSelection: noop,
    brush: 'round',
    onBrushChange: noop,
    ...overrides,
  }
  return render(<Ribbon {...props} />)
}

describe('Ribbon compact layout', () => {
  it('collapses the groups into one row of group buttons without labels', () => {
    const { container } = renderRibbon({ layout: 'compact' })
    expect(container.querySelector('.ribbon-compact')).toBeTruthy()
    expect(container.querySelector('.ribbon-group-label')).toBeNull()
    expect(screen.getByRole('button', { name: 'Clipboard' }).getAttribute('aria-haspopup')).toBe('menu')
    expect(screen.getByRole('button', { name: 'Image' }).getAttribute('aria-haspopup')).toBe('menu')
    expect(screen.getByRole('button', { name: 'Shapes' }).getAttribute('aria-haspopup')).toBe('dialog')
    expect(screen.getByRole('button', { name: 'Colors' }).getAttribute('aria-haspopup')).toBe('dialog')
    // The shape gallery and palette stay out of the row until their group is opened.
    expect(screen.queryByRole('button', { name: 'Ellipse' })).toBeNull()
    expect(screen.queryByRole('listbox', { name: 'Color palette' })).toBeNull()
  })

  it('keeps the tools, select, brush and layers directly in the row', () => {
    renderRibbon({ layout: 'compact', tool: 'eraser' })
    expect(screen.getByRole('button', { name: 'Eraser' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Pencil' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Select' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Brush' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Layers' })).toBeTruthy()
  })

  it('runs cut, copy and paste from the clipboard menu', () => {
    const onCut = vi.fn()
    const onCopy = vi.fn()
    const onPaste = vi.fn()
    renderRibbon({ layout: 'compact', onCut, onCopy, onPaste })
    fireEvent.click(screen.getByRole('button', { name: 'Clipboard' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Cut/ }))
    expect(onCut).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Clipboard' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Copy/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Clipboard' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Paste/ }))
    expect(onCopy).toHaveBeenCalledTimes(1)
    expect(onPaste).toHaveBeenCalledTimes(1)
  })

  it('offers crop, scale, rotate and flip in the image menu', () => {
    const onRotate = vi.fn()
    const onFlip = vi.fn()
    const onScale = vi.fn()
    renderRibbon({ layout: 'compact', onRotate, onFlip, onScale })
    fireEvent.click(screen.getByRole('button', { name: 'Image' }))
    expect((screen.getByRole('menuitem', { name: 'Crop to selection' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rotate left 90°' }))
    expect(onRotate).toHaveBeenCalledWith(270)
    fireEvent.click(screen.getByRole('button', { name: 'Image' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Flip vertical' }))
    expect(onFlip).toHaveBeenCalledWith('vertical')
    fireEvent.click(screen.getByRole('button', { name: 'Image' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Scale image…' }))
    expect(onScale).toHaveBeenCalledTimes(1)
  })

  it('crops from the image menu once there is a selection', () => {
    const onCrop = vi.fn()
    renderRibbon({ layout: 'compact', hasSelection: true, onCrop })
    fireEvent.click(screen.getByRole('button', { name: 'Image' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Crop to selection' }))
    expect(onCrop).toHaveBeenCalledTimes(1)
  })

  it('opens the shapes group as a popover and closes it after picking a shape', () => {
    const onShapeKindChange = vi.fn()
    const onToolChange = vi.fn()
    renderRibbon({ layout: 'compact', onShapeKindChange, onToolChange })
    fireEvent.click(screen.getByRole('button', { name: 'Shapes' }))
    const popover = screen.getByRole('dialog', { name: 'Shapes' })
    expect(popover.contains(screen.getByRole('button', { name: 'Size' }))).toBe(true)
    expect(popover.contains(screen.getByRole('button', { name: 'Fill' }))).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Ellipse' }))
    expect(onShapeKindChange).toHaveBeenCalledWith('ellipse')
    expect(onToolChange).toHaveBeenCalledWith('shape')
    expect(screen.queryByRole('dialog', { name: 'Shapes' })).toBeNull()
  })

  it('marks the shapes button while the shape tool is active', () => {
    renderRibbon({ layout: 'compact', tool: 'shape' })
    expect(screen.getByRole('button', { name: 'Shapes' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('opens the palette from the colors button, which shows the current colors', () => {
    const onPrimaryChange = vi.fn()
    renderRibbon({ layout: 'compact', onPrimaryChange })
    const trigger = screen.getByRole('button', { name: 'Colors' })
    expect(trigger.querySelector<HTMLElement>('.color-pair-primary')!.style.background).toBe('rgb(0, 0, 0)')
    expect(trigger.querySelector<HTMLElement>('.color-pair-secondary')!.style.background).toBe('rgb(255, 255, 255)')
    fireEvent.click(trigger)
    const popover = screen.getByRole('dialog', { name: 'Colors' })
    expect(popover.contains(screen.getByRole('button', { name: 'Swap colors' }))).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: `Color ${DEFAULT_PALETTE[2]}` }))
    expect(onPrimaryChange).toHaveBeenCalled()
  })
})

describe('Ribbon phone layout', () => {
  it('folds the tools into one split button showing the current tool', () => {
    const onToolChange = vi.fn()
    const { container } = renderRibbon({ layout: 'phone', tool: 'eraser', onToolChange })
    expect(container.querySelector('.ribbon-phone')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Eraser' })).toBeNull()
    const tools = screen.getByRole('button', { name: 'Tools' })
    expect(tools.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(tools)
    expect(onToolChange).toHaveBeenCalledWith('eraser')
    fireEvent.click(screen.getByRole('button', { name: 'Tools options' }))
    expect(screen.getByRole('menuitem', { name: 'Eraser' }).classList.contains('menu-item-checked')).toBe(true)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Fill with color' }))
    expect(onToolChange).toHaveBeenCalledWith('fill')
  })

  it('falls back to the pencil while a tool outside the group is active', () => {
    const onToolChange = vi.fn()
    renderRibbon({ layout: 'phone', tool: 'brush', onToolChange })
    const tools = screen.getByRole('button', { name: 'Tools' })
    expect(tools.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(tools)
    expect(onToolChange).toHaveBeenCalledWith('pencil')
  })

  it('leaves cut, copy and paste to the Edit menu', () => {
    renderRibbon({ layout: 'phone' })
    expect(screen.queryByRole('button', { name: 'Clipboard' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
  })

  it('supports the keyboard in a collapsed group menu', () => {
    renderRibbon({ layout: 'phone' })
    const image = screen.getByRole('button', { name: 'Image' })
    fireEvent.click(image)
    // Crop is disabled without a selection, so focus starts on Scale.
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Scale image…' }))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Rotate right 90°' }))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(image)
  })
})
