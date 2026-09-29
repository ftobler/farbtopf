import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LayersPanel } from './LayersPanel'

const LAYERS = [
  { id: 1, name: 'Background' },
  { id: 2, name: 'Layer 2' },
  { id: 3, name: 'Layer 3' },
]

function setup(active = 1, layers = LAYERS) {
  const handlers = { onSelect: vi.fn(), onAdd: vi.fn(), onDelete: vi.fn(), onMove: vi.fn() }
  render(<LayersPanel layers={layers} active={active} {...handlers} />)
  return handlers
}

const rows = () => within(screen.getByRole('listbox', { name: 'Layers' })).getAllByRole('option')

describe('LayersPanel', () => {
  it('lists the top-most layer first', () => {
    setup()
    expect(rows().map((row) => row.textContent)).toEqual(['Layer 3', 'Layer 2', 'Background'])
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

  it('adds a new layer', () => {
    const { onAdd } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'New layer' }))
    expect(onAdd).toHaveBeenCalled()
  })

  it('deletes the active layer', () => {
    const { onDelete } = setup(1)
    fireEvent.click(screen.getByRole('button', { name: 'Delete layer' }))
    expect(onDelete).toHaveBeenCalledWith(1)
  })

  it('cannot delete the only layer', () => {
    setup(0, [{ id: 1, name: 'Background' }])
    expect(screen.getByRole('button', { name: 'Delete layer' }).hasAttribute('disabled')).toBe(true)
  })

  it('moves the active layer up and down the stack', () => {
    const { onMove } = setup(1)
    fireEvent.click(screen.getByRole('button', { name: 'Move layer up' }))
    expect(onMove).toHaveBeenLastCalledWith(1, 2)
    fireEvent.click(screen.getByRole('button', { name: 'Move layer down' }))
    expect(onMove).toHaveBeenLastCalledWith(1, 0)
  })

  it('disables moving past the ends of the stack', () => {
    setup(2)
    expect(screen.getByRole('button', { name: 'Move layer up' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Move layer down' }).hasAttribute('disabled')).toBe(false)
  })

  it('re-orders layers by drag and drop', () => {
    const { onMove } = setup()
    fireEvent.dragStart(rows()[2])
    fireEvent.dragOver(rows()[0])
    fireEvent.drop(rows()[0])
    expect(onMove).toHaveBeenCalledWith(0, 2)
  })
})
