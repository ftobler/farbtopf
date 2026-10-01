import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bitmap } from '../core/bitmap'
import { moveItem } from '../core/layers'
import { LayersPanel } from './LayersPanel'

const layer = (id: number, name: string) => ({ id, name, thumbnail: new Bitmap(8, 6) })
const LAYERS = [layer(1, 'Background'), layer(2, 'Layer 2'), layer(3, 'Layer 3')]

function setup(active = 1, layers = LAYERS) {
  const handlers = { onSelect: vi.fn(), onAdd: vi.fn(), onDelete: vi.fn(), onMove: vi.fn() }
  render(<LayersPanel layers={layers} active={active} {...handlers} />)
  return handlers
}

function ControlledLayers({ initial = LAYERS, active = 1 }: { initial?: typeof LAYERS; active?: number }) {
  const [state, setState] = useState({ list: initial, active })
  return (
    <LayersPanel
      layers={state.list}
      active={state.active}
      onSelect={(index) => setState((current) => ({ ...current, active: index }))}
      onAdd={vi.fn()}
      onDelete={vi.fn()}
      onMove={(from, to) =>
        setState((current) => {
          const id = current.list[from].id
          const list = moveItem(current.list, from, to)
          return { list, active: list.findIndex((item) => item.id === id) }
        })
      }
    />
  )
}

const rows = () => within(screen.getByRole('listbox', { name: 'Layers' })).getAllByRole('option')

describe('LayersPanel', () => {
  it('lists the top-most layer first', () => {
    setup()
    expect(rows().map((row) => row.getAttribute('aria-label'))).toEqual(['Layer 3', 'Layer 2', 'Background'])
  })

  it('shows each layer as a thumbnail image without a visible name', () => {
    setup()
    for (const row of rows()) {
      expect(row.textContent).toBe('')
      const thumbnail = row.querySelector('canvas')
      expect(thumbnail?.getAttribute('width')).toBe('8')
      expect(thumbnail?.getAttribute('height')).toBe('6')
    }
  })

  it('marks the active layer', () => {
    setup(1)
    expect(rows()[1].getAttribute('aria-selected')).toBe('true')
    expect(rows()[0].getAttribute('aria-selected')).toBe('false')
  })

  it('selects a layer when clicked', () => {
    const { onSelect } = setup()
    fireEvent.click(rows()[0])
    expect(onSelect).toHaveBeenCalledWith(2)
  })

  it('adds a new layer from the plus tile at the top of the list', () => {
    const { onAdd } = setup()
    const add = screen.getByRole('button', { name: 'New layer' })
    const list = screen.getByRole('listbox', { name: 'Layers' })
    expect(list.firstElementChild?.contains(add)).toBe(true)
    expect(add.style.width).toBe('64px')
    expect(add.style.height).toBe('48px')
    fireEvent.click(add)
    expect(onAdd).toHaveBeenCalled()
  })

  it('has no move or delete buttons', () => {
    setup()
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['New layer'])
  })

  it('deletes a layer with the Delete key', () => {
    const { onDelete } = setup(1)
    fireEvent.keyDown(rows()[1], { key: 'Delete' })
    expect(onDelete).toHaveBeenCalledWith(1)
  })

  it('keeps the Delete key from reaching the rest of the app', () => {
    const onWindowKey = vi.fn()
    window.addEventListener('keydown', onWindowKey)
    setup(1)
    fireEvent.keyDown(rows()[1], { key: 'Delete' })
    window.removeEventListener('keydown', onWindowKey)
    expect(onWindowKey).not.toHaveBeenCalled()
  })

  it('deletes a layer from its right-click menu', () => {
    const { onDelete, onSelect } = setup(1)
    fireEvent.contextMenu(rows()[0], { clientX: 40, clientY: 50 })
    expect(onSelect).toHaveBeenCalledWith(2)
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete layer/ }))
    expect(onDelete).toHaveBeenCalledWith(2)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('cannot delete the only layer', () => {
    const { onDelete } = setup(0, [layer(1, 'Background')])
    fireEvent.keyDown(rows()[0], { key: 'Delete' })
    fireEvent.contextMenu(rows()[0])
    expect(screen.getByRole('menuitem', { name: /Delete layer/ }).hasAttribute('disabled')).toBe(true)
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('re-orders layers by drag and drop', () => {
    const { onMove } = setup()
    fireEvent.dragStart(rows()[2])
    fireEvent.dragOver(rows()[0])
    fireEvent.drop(rows()[0])
    expect(onMove).toHaveBeenCalledWith(0, 2)
  })

  it('selects the visual previous and next layer with the arrow keys', () => {
    const { onSelect } = setup(1)
    fireEvent.keyDown(rows()[1], { key: 'ArrowUp' })
    expect(onSelect).toHaveBeenLastCalledWith(2)
    fireEvent.keyDown(rows()[1], { key: 'ArrowDown' })
    expect(onSelect).toHaveBeenLastCalledWith(0)
  })

  it('moves the active highlight with the arrow keys', () => {
    render(<ControlledLayers active={1} />)
    fireEvent.keyDown(rows()[1], { key: 'ArrowUp' })
    expect(rows()[0].getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(rows()[0], { key: 'ArrowDown' })
    expect(rows()[1].getAttribute('aria-selected')).toBe('true')
    expect(rows()[0].getAttribute('aria-selected')).toBe('false')
  })

  it('ignores arrow keys at the ends of the list', () => {
    const { onSelect } = setup(1)
    fireEvent.keyDown(rows()[0], { key: 'ArrowUp' })
    fireEvent.keyDown(rows()[2], { key: 'ArrowDown' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('moves a layer visually up with Alt+ArrowUp', () => {
    const { onMove } = setup(1)
    fireEvent.keyDown(rows()[1], { key: 'ArrowUp', altKey: true })
    expect(onMove).toHaveBeenCalledWith(1, 2)
  })

  it('moves a layer visually down with Alt+ArrowDown', () => {
    const { onMove } = setup(1)
    fireEvent.keyDown(rows()[1], { key: 'ArrowDown', altKey: true })
    expect(onMove).toHaveBeenCalledWith(1, 0)
  })

  it('does not move a layer past the top or bottom', () => {
    const { onMove } = setup(1)
    fireEvent.keyDown(rows()[0], { key: 'ArrowUp', altKey: true })
    fireEvent.keyDown(rows()[2], { key: 'ArrowDown', altKey: true })
    expect(onMove).not.toHaveBeenCalled()
  })

  it('keeps the moved layer focused and selected', () => {
    render(<ControlledLayers active={1} />)
    const focused = rows()[1]
    focused.focus()
    fireEvent.keyDown(focused, { key: 'ArrowUp', altKey: true })
    expect(rows()[0].getAttribute('aria-label')).toBe('Layer 2')
    const moved = screen.getByRole('option', { name: 'Layer 2' })
    expect(moved.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(moved)
  })

  it('advertises the keyboard shortcuts', () => {
    setup()
    expect(rows()[0].getAttribute('aria-keyshortcuts')).toBe('ArrowUp ArrowDown Alt+ArrowUp Alt+ArrowDown')
  })
})
