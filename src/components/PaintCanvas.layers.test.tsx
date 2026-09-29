import { createRef } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bitmap } from '../core/bitmap'
import { BLACK, WHITE } from '../core/color'
import type { LayerInfo } from '../core/layers'
import type { ToolId } from '../core/tools'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

const SIZE = 20

function setup(initialTool: ToolId = 'pencil') {
  const ref = createRef<PaintCanvasHandle>()
  const onLayersChange = vi.fn<(layers: LayerInfo[], active: number) => void>()
  const onHistoryChange = vi.fn()
  const onPickColor = vi.fn()
  const element = (tool: ToolId) => (
    <PaintCanvas
      ref={ref}
      initialWidth={SIZE}
      initialHeight={SIZE}
      tool={tool}
      primary={BLACK}
      secondary={WHITE}
      brushSize={1}
      shapeFill="outline"
      zoom={1}
      showGrid={false}
      onHistoryChange={onHistoryChange}
      onCursorMove={vi.fn()}
      onPickColor={onPickColor}
      onSizeChange={vi.fn()}
      transparentSelection={false}
      onLayersChange={onLayersChange}
    />
  )
  const { container, rerender } = render(element(initialTool))
  const canvas = container.querySelector('canvas')
  if (!canvas) throw new Error('canvas not rendered')
  canvas.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, toJSON: () => ({}) }) as DOMRect
  canvas.setPointerCapture = vi.fn()
  const context = { putImageData: vi.fn() }
  canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext

  const setTool = (tool: ToolId) => rerender(element(tool))
  const click = (x: number, y: number, button = 0) => {
    fireEvent.pointerDown(canvas, { button, pointerId: 1, clientX: x, clientY: y })
    fireEvent.pointerUp(canvas, { button, pointerId: 1, clientX: x, clientY: y })
  }
  /** A pixel of what is currently shown, i.e. every layer flattened. */
  const shown = (x: number, y: number) => {
    const image = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray; width: number }
    const i = (y * image.width + x) * 4
    return Array.from(image.data.slice(i, i + 4))
  }
  const layers = () => onLayersChange.mock.calls.at(-1)?.[0].map((layer) => layer.name)
  const active = () => onLayersChange.mock.calls.at(-1)?.[1]
  return { ref, canvas, click, shown, layers, active, setTool, onPickColor }
}

const black = [0, 0, 0, 255]
const white = [255, 255, 255, 255]

describe('PaintCanvas layers', () => {
  it('starts with a single background layer', () => {
    const { layers, active } = setup()
    expect(layers()).toEqual(['Background'])
    expect(active()).toBe(0)
  })

  it('adds a new layer above the active one and makes it active', () => {
    const { ref, layers, active } = setup()
    act(() => ref.current?.addLayer())
    expect(layers()).toEqual(['Background', 'Layer 2'])
    expect(active()).toBe(1)
    act(() => ref.current?.selectLayer(0))
    act(() => ref.current?.addLayer())
    expect(layers()).toEqual(['Background', 'Layer 3', 'Layer 2'])
    expect(active()).toBe(1)
  })

  it('only draws on the active layer', () => {
    const { ref, click, shown } = setup()
    act(() => ref.current?.addLayer())
    click(5, 5)
    expect(shown(5, 5)).toEqual(black)
    act(() => ref.current?.deleteLayer(1))
    expect(shown(5, 5)).toEqual(white)
  })

  it('draws on the background again after selecting it', () => {
    const { ref, click, shown } = setup()
    act(() => ref.current?.addLayer())
    act(() => ref.current?.selectLayer(0))
    click(5, 5)
    act(() => ref.current?.deleteLayer(1))
    expect(shown(5, 5)).toEqual(black)
  })

  it('draws the bottom-most layer first and follows re-ordering', () => {
    const { ref, click, shown, layers, active } = setup()
    click(5, 5)
    act(() => ref.current?.addLayer())
    click(5, 5, 2)
    expect(shown(5, 5)).toEqual(white)
    act(() => ref.current?.moveLayer(1, 0))
    expect(layers()).toEqual(['Layer 2', 'Background'])
    expect(active()).toBe(0)
    expect(shown(5, 5)).toEqual(black)
  })

  it('erases upper layers to transparency', () => {
    const { ref, click, shown, setTool } = setup()
    act(() => ref.current?.loadBitmap(new Bitmap(SIZE, SIZE, BLACK)))
    act(() => ref.current?.addLayer())
    setTool('eraser')
    click(5, 5)
    expect(shown(5, 5)).toEqual(black)
  })

  it('clears an upper layer to transparency', () => {
    const { ref, shown } = setup()
    act(() => ref.current?.loadBitmap(new Bitmap(SIZE, SIZE, BLACK)))
    act(() => ref.current?.addLayer())
    act(() => ref.current?.clear())
    expect(shown(5, 5)).toEqual(black)
  })

  it('keeps at least one layer', () => {
    const { ref, layers } = setup()
    act(() => ref.current?.deleteLayer(0))
    expect(layers()).toEqual(['Background'])
  })

  it('selects the layer below after deleting the active one', () => {
    const { ref, layers, active } = setup()
    act(() => ref.current?.addLayer())
    act(() => ref.current?.addLayer())
    act(() => ref.current?.deleteLayer(2))
    expect(layers()).toEqual(['Background', 'Layer 2'])
    expect(active()).toBe(1)
  })

  it('undoes and redoes layer changes', () => {
    const { ref, click, shown, layers } = setup()
    act(() => ref.current?.addLayer())
    click(5, 5)
    act(() => ref.current?.deleteLayer(1))
    expect(shown(5, 5)).toEqual(white)
    act(() => ref.current?.undo())
    expect(layers()).toEqual(['Background', 'Layer 2'])
    expect(shown(5, 5)).toEqual(black)
    act(() => ref.current?.undo())
    expect(shown(5, 5)).toEqual(white)
    act(() => ref.current?.undo())
    expect(layers()).toEqual(['Background'])
    act(() => ref.current?.redo())
    act(() => ref.current?.redo())
    expect(shown(5, 5)).toEqual(black)
  })

  it('returns to the layer a change was made on when undoing it', () => {
    const { ref, click, shown, active } = setup()
    act(() => ref.current?.addLayer())
    act(() => ref.current?.selectLayer(0))
    click(5, 5)
    act(() => ref.current?.selectLayer(1))
    act(() => ref.current?.undo())
    expect(shown(5, 5)).toEqual(white)
    expect(active()).toBe(0)
    act(() => ref.current?.redo())
    expect(shown(5, 5)).toEqual(black)
  })

  it('flips every layer together', () => {
    const { ref, click, shown } = setup()
    click(0, 0)
    act(() => ref.current?.addLayer())
    click(0, 5)
    act(() => ref.current?.flip('horizontal'))
    expect(shown(0, 0)).toEqual(white)
    expect(shown(19, 0)).toEqual(black)
    expect(shown(19, 5)).toEqual(black)
  })

  it('resizes every layer together', () => {
    const { ref, shown } = setup()
    act(() => ref.current?.addLayer())
    act(() => ref.current?.resize(10, 8))
    expect(ref.current?.getSize()).toEqual({ width: 10, height: 8 })
    act(() => ref.current?.selectLayer(0))
    expect(shown(9, 7)).toEqual(white)
  })

  it('picks colours from the flattened image', () => {
    const { ref, click, setTool, onPickColor } = setup()
    act(() => ref.current?.addLayer())
    setTool('picker')
    click(5, 5)
    expect(onPickColor).toHaveBeenLastCalledWith(WHITE, 'primary')
  })

  it('starts over with a single layer for a new document', () => {
    const { ref, layers } = setup()
    act(() => ref.current?.addLayer())
    act(() => ref.current?.newDocument(10, 10))
    expect(layers()).toEqual(['Background'])
  })
})
