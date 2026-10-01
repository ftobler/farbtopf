import { createRef } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bitmap } from '../core/bitmap'
import type { Rgba } from '../core/color'
import { BLACK, WHITE } from '../core/color'
import type { ToolId } from '../core/tools'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

const SIZE = 20
const RED: Rgba = { r: 255, g: 0, b: 0, a: 255 }

interface Props {
  tool: ToolId
  secondary: Rgba
  brushSize: number
  zoom: number
}

function setup(initial: Partial<Props> = {}) {
  const ref = createRef<PaintCanvasHandle>()
  const onHistoryChange = vi.fn()
  let props: Props = { tool: 'eraser', secondary: RED, brushSize: 4, zoom: 2, ...initial }
  const element = (p: Props) => (
    <PaintCanvas
      ref={ref}
      initialWidth={SIZE}
      initialHeight={SIZE}
      tool={p.tool}
      primary={BLACK}
      secondary={p.secondary}
      brushSize={p.brushSize}
      shapeFill="outline"
      zoom={p.zoom}
      showGrid={false}
      onHistoryChange={onHistoryChange}
      onCursorMove={vi.fn()}
      onPickColor={vi.fn()}
      onSizeChange={vi.fn()}
      transparentSelection={false}
    />
  )
  const { container, rerender } = render(element(props))
  const canvas = container.querySelector('canvas')
  if (!canvas) throw new Error('canvas not rendered')
  canvas.getBoundingClientRect = () => {
    const side = SIZE * props.zoom
    return { x: 0, y: 0, left: 0, top: 0, right: side, bottom: side, width: side, height: side, toJSON: () => ({}) } as DOMRect
  }
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  const context = { putImageData: vi.fn() }
  canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext

  const setProps = (patch: Partial<Props>) => {
    props = { ...props, ...patch }
    rerender(element(props))
  }
  const preview = () => container.querySelector<HTMLElement>('.eraser-preview')
  const hover = (x: number, y: number) => fireEvent.pointerMove(canvas, { pointerId: 1, clientX: x, clientY: y })
  const shown = (x: number, y: number) => {
    const image = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray; width: number }
    const i = (y * image.width + x) * 4
    return Array.from(image.data.slice(i, i + 4))
  }
  return { ref, canvas, container, setProps, preview, hover, shown, onHistoryChange }
}

describe('PaintCanvas eraser preview', () => {
  it('is not shown before the pointer is over the canvas', () => {
    const { preview } = setup()
    expect(preview()).toBeNull()
  })

  it('shows a box filled with the background colour while hovering', () => {
    const { preview, hover } = setup()
    hover(20, 20)
    const box = preview()
    expect(box).not.toBeNull()
    expect(box?.style.backgroundColor).toBe('rgb(255, 0, 0)')
  })

  it('previews the secondary colour on the background layer while hovering', () => {
    const { preview, hover } = setup({ secondary: RED })
    hover(20, 20)
    expect(preview()?.style.backgroundColor).toBe('rgb(255, 0, 0)')
  })

  it('previews transparency on an upper layer', () => {
    const { ref, preview, hover } = setup({ secondary: RED })
    act(() => ref.current?.addLayer())
    hover(20, 20)
    expect(preview()?.style.backgroundColor).toBe('rgba(0, 0, 0, 0)')
  })

  it('previews the primary colour for a right-button stroke on the background layer', () => {
    const { preview, canvas } = setup({ secondary: RED })
    fireEvent.pointerDown(canvas, { button: 2, buttons: 2, pointerId: 1, clientX: 20, clientY: 20 })
    expect(preview()?.style.backgroundColor).toBe('rgb(0, 0, 0)')
    fireEvent.pointerUp(canvas, { button: 2, buttons: 0, pointerId: 1, clientX: 20, clientY: 20 })
  })

  it('sizes and places the box on the image pixel grid', () => {
    const { preview, hover } = setup({ brushSize: 4, zoom: 2 })
    // Screen (21, 21) at zoom 2 is image pixel (10, 10); a size-4 stamp covers 9..12.
    hover(21, 21)
    const box = preview()
    expect(box?.style.left).toBe('18px')
    expect(box?.style.top).toBe('18px')
    expect(box?.style.width).toBe('8px')
    expect(box?.style.height).toBe('8px')
  })

  it('covers exactly the pixels the eraser erases', () => {
    const { ref, preview, hover, canvas, shown } = setup({ brushSize: 5, zoom: 2, secondary: WHITE })
    act(() => ref.current?.loadBitmap(new Bitmap(SIZE, SIZE, BLACK)))
    hover(15, 13)
    const box = preview()
    const left = parseFloat(box?.style.left ?? '') / 2
    const top = parseFloat(box?.style.top ?? '') / 2
    const width = parseFloat(box?.style.width ?? '') / 2
    const height = parseFloat(box?.style.height ?? '') / 2
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 15, clientY: 13 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 15, clientY: 13 })
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const inside = x >= left && x < left + width && y >= top && y < top + height
        expect(shown(x, y)).toEqual(inside ? [255, 255, 255, 255] : [0, 0, 0, 255])
      }
    }
  })

  it('erases and previews a 500 px footprint', () => {
    const { ref, preview, hover, canvas, shown } = setup({ brushSize: 500, zoom: 2, secondary: WHITE })
    act(() => ref.current?.loadBitmap(new Bitmap(SIZE, SIZE, BLACK)))
    hover(21, 21)
    // The footprint is clipped to the 20 × 20 image.
    expect(preview()?.style.left).toBe('0px')
    expect(preview()?.style.width).toBe(`${SIZE * 2}px`)
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 21, clientY: 21 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 25, clientY: 23 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 25, clientY: 23 })
    for (const [x, y] of [[0, 0], [19, 19], [0, 19], [10, 10]]) expect(shown(x, y)).toEqual([255, 255, 255, 255])
  })

  it('follows the pointer while dragging', () => {
    const { preview, hover, canvas } = setup({ brushSize: 1, zoom: 2 })
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 2, clientY: 2 })
    expect(preview()?.style.left).toBe('2px')
    hover(30, 10)
    expect(preview()?.style.left).toBe('30px')
    expect(preview()?.style.top).toBe('10px')
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 30, clientY: 10 })
  })

  it('is hidden when the pointer leaves the canvas', () => {
    const { preview, hover, canvas } = setup()
    hover(20, 20)
    fireEvent.pointerLeave(canvas)
    expect(preview()).toBeNull()
  })

  it('is hidden for other tools', () => {
    const { preview, hover, setProps } = setup()
    hover(20, 20)
    setProps({ tool: 'pencil' })
    expect(preview()).toBeNull()
    hover(22, 22)
    expect(preview()).toBeNull()
  })

  it('follows background colour and eraser size changes', () => {
    const { preview, hover, setProps } = setup({ brushSize: 4, zoom: 1 })
    hover(10, 10)
    setProps({ secondary: { r: 0, g: 128, b: 255, a: 255 }, brushSize: 8 })
    expect(preview()?.style.backgroundColor).toBe('rgb(0, 128, 255)')
    expect(preview()?.style.width).toBe('8px')
  })

  it('never touches the image or the history', () => {
    const { ref, hover, shown, onHistoryChange } = setup({ secondary: WHITE })
    act(() => ref.current?.loadBitmap(new Bitmap(SIZE, SIZE, BLACK)))
    const calls = onHistoryChange.mock.calls.length
    hover(20, 20)
    expect(shown(10, 10)).toEqual([0, 0, 0, 255])
    expect(onHistoryChange.mock.calls.length).toBe(calls)
  })
})
