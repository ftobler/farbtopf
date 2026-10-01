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
    selectionShape: 'freeform',
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

function openMenu(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `${name} options` }))
}

function isChecked(item: HTMLElement) {
  return item.classList.contains('menu-item-checked')
}

describe('Ribbon select menu', () => {
  it('switches to a rectangular selection with the select tool and closes the menu', () => {
    const onSelectionShapeChange = vi.fn()
    const onToolChange = vi.fn()
    renderRibbon({ onSelectionShapeChange, onToolChange })
    openMenu('Select')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rectangular selection' }))
    expect(onSelectionShapeChange).toHaveBeenCalledWith('rectangle')
    expect(onToolChange).toHaveBeenCalledWith('select')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('checks the selection shape only while the select tool is active', () => {
    const { unmount } = renderRibbon({ tool: 'select', selectionShape: 'rectangle' })
    openMenu('Select')
    expect(isChecked(screen.getByRole('menuitem', { name: 'Rectangular selection' }))).toBe(true)
    expect(isChecked(screen.getByRole('menuitem', { name: 'Free-form selection' }))).toBe(false)
    unmount()

    renderRibbon({ tool: 'pencil', selectionShape: 'rectangle' })
    openMenu('Select')
    expect(isChecked(screen.getByRole('menuitem', { name: 'Rectangular selection' }))).toBe(false)
  })

  it('inverts the selection and closes the menu', () => {
    const onInvertSelection = vi.fn()
    renderRibbon({ onInvertSelection })
    openMenu('Select')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invert selection' }))
    expect(onInvertSelection).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('toggles transparent selection and shows its current state', () => {
    const onTransparentSelectionChange = vi.fn()
    const { unmount } = renderRibbon({ transparentSelection: false, onTransparentSelectionChange })
    openMenu('Select')
    const off = screen.getByRole('menuitem', { name: 'Transparent selection' })
    expect(isChecked(off)).toBe(false)
    fireEvent.click(off)
    expect(onTransparentSelectionChange).toHaveBeenLastCalledWith(true)
    expect(screen.queryByRole('menu')).toBeNull()
    unmount()

    renderRibbon({ transparentSelection: true, onTransparentSelectionChange })
    openMenu('Select')
    const on = screen.getByRole('menuitem', { name: 'Transparent selection' })
    expect(isChecked(on)).toBe(true)
    fireEvent.click(on)
    expect(onTransparentSelectionChange).toHaveBeenLastCalledWith(false)
  })

  it('disables clearing the selection when there is none', () => {
    const onDeleteSelection = vi.fn()
    renderRibbon({ hasSelection: false, onDeleteSelection })
    openMenu('Select')
    const item = screen.getByRole('menuitem', { name: /Clear selection/ }) as HTMLButtonElement
    expect(item.disabled).toBe(true)
    fireEvent.click(item)
    expect(onDeleteSelection).not.toHaveBeenCalled()
  })

  it('clears an existing selection and closes the menu', () => {
    const onDeleteSelection = vi.fn()
    renderRibbon({ hasSelection: true, onDeleteSelection })
    openMenu('Select')
    fireEvent.click(screen.getByRole('menuitem', { name: /Clear selection/ }))
    expect(onDeleteSelection).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('Ribbon rotate and flip menus', () => {
  it.each([
    ['Rotate right 90°', 90],
    ['Rotate left 90°', 270],
    ['Rotate 180°', 180],
  ])('%s rotates by %i degrees clockwise and closes the menu', (label, degrees) => {
    const onRotate = vi.fn()
    renderRibbon({ onRotate })
    openMenu('Rotate')
    fireEvent.click(screen.getByRole('menuitem', { name: label }))
    expect(onRotate).toHaveBeenCalledWith(degrees)
    expect(onRotate).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('opens the custom rotation from the rotate menu', () => {
    const onCustomRotate = vi.fn()
    const onRotate = vi.fn()
    renderRibbon({ onCustomRotate, onRotate })
    openMenu('Rotate')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Custom rotation…' }))
    expect(onCustomRotate).toHaveBeenCalledTimes(1)
    expect(onRotate).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it.each([
    ['Flip horizontal', 'horizontal'],
    ['Flip vertical', 'vertical'],
  ])('%s flips the image and closes the menu', (label, axis) => {
    const onFlip = vi.fn()
    renderRibbon({ onFlip })
    openMenu('Flip')
    fireEvent.click(screen.getByRole('menuitem', { name: label }))
    expect(onFlip).toHaveBeenCalledWith(axis)
    expect(onFlip).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('repeats the last rotation and flip from the icon parts', () => {
    const onRotate = vi.fn()
    const onFlip = vi.fn()
    renderRibbon({ onRotate, onFlip, lastRotation: 180, lastFlip: 'vertical' })
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }))
    fireEvent.click(screen.getByRole('button', { name: 'Flip' }))
    expect(onRotate).toHaveBeenCalledWith(180)
    expect(onFlip).toHaveBeenCalledWith('vertical')
  })
})
