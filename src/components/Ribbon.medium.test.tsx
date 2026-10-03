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

const groupLabels = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.ribbon-group-label')).map((label) => label.textContent)

describe('Ribbon medium layout', () => {
  it('keeps every labelled group of the desktop ribbon', () => {
    const { container } = renderRibbon({ layout: 'medium' })
    expect(container.querySelector('.ribbon-compact')).toBeNull()
    expect(groupLabels(container)).toEqual(['Clipboard', 'Selection', 'Image', 'Tools', 'Brushes', 'Shapes', 'Colors', 'Layers'])
  })

  it('keeps the clipboard, image, tool, brush and layers controls inline', () => {
    renderRibbon({ layout: 'medium', tool: 'eraser' })
    for (const name of ['Copy', 'Cut', 'Paste', 'Select', 'Crop', 'Rotate', 'Scale', 'Flip', 'Pencil', 'Brush', 'Layers']) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: 'Eraser' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Clipboard' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Image' })).toBeNull()
  })

  it('folds the shape gallery and the palette behind buttons', () => {
    renderRibbon({ layout: 'medium' })
    expect(screen.queryByRole('button', { name: 'Ellipse' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Size' })).toBeNull()
    expect(screen.queryByRole('listbox', { name: 'Color palette' })).toBeNull()
    expect(screen.queryByRole('button', { name: `Color ${DEFAULT_PALETTE[2]}` })).toBeNull()
    expect(screen.getByRole('button', { name: 'Shapes' }).getAttribute('aria-haspopup')).toBe('dialog')
    expect(screen.getByRole('button', { name: 'Colors' }).getAttribute('aria-haspopup')).toBe('dialog')
  })

  it('opens the shapes popover with the size and fill options and closes it after picking', () => {
    const onShapeKindChange = vi.fn()
    const onToolChange = vi.fn()
    renderRibbon({ layout: 'medium', onShapeKindChange, onToolChange })
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
    renderRibbon({ layout: 'medium', tool: 'shape' })
    expect(screen.getByRole('button', { name: 'Shapes' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('shows the current colours on the colors button and opens the palette and editor from it', () => {
    const onPrimaryChange = vi.fn()
    renderRibbon({ layout: 'medium', onPrimaryChange })
    const trigger = screen.getByRole('button', { name: 'Colors' })
    expect(trigger.querySelector<HTMLElement>('.color-pair-primary')!.style.background).toBe('rgb(0, 0, 0)')
    expect(trigger.querySelector<HTMLElement>('.color-pair-secondary')!.style.background).toBe('rgb(255, 255, 255)')
    fireEvent.click(trigger)
    const popover = screen.getByRole('dialog', { name: 'Colors' })
    expect(popover.contains(screen.getByRole('button', { name: 'Swap colors' }))).toBe(true)
    expect(popover.contains(screen.getByRole('button', { name: 'Custom colors' }))).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: `Color ${DEFAULT_PALETTE[2]}` }))
    expect(onPrimaryChange).toHaveBeenCalled()
  })

  it('moves focus into a popover and back to its button on Escape', () => {
    renderRibbon({ layout: 'medium' })
    const trigger = screen.getByRole('button', { name: 'Colors' })
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Colors' }).contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})
