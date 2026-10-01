import { createRef } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Rgba } from '../core/color'
import type { ToolId } from '../core/tools'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

const SIZE = 20
const RED: Rgba = { r: 255, g: 0, b: 0, a: 255 }
const BLUE: Rgba = { r: 0, g: 0, b: 255, a: 255 }
const WHITE_PIXEL = { r: 255, g: 255, b: 255, a: 255 }

function setup(tool: ToolId) {
  const ref = createRef<PaintCanvasHandle>()
  const onHistoryChange = vi.fn()
  const onPickColor = vi.fn()
  const { container } = render(
    <PaintCanvas
      ref={ref}
      initialWidth={SIZE}
      initialHeight={SIZE}
      tool={tool}
      primary={RED}
      secondary={BLUE}
      brushSize={3}
      shapeFill="outline"
      zoom={1}
      showGrid={false}
      onHistoryChange={onHistoryChange}
      onCursorMove={vi.fn()}
      onPickColor={onPickColor}
      onSizeChange={vi.fn()}
      transparentSelection={false}
    />,
  )
  const canvas = container.querySelector('canvas')
  if (!canvas) throw new Error('canvas not rendered')
  canvas.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, toJSON: () => ({}) }) as DOMRect
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  const context = { putImageData: vi.fn() }
  canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
  const shown = (x: number, y: number) => {
    const image = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray; width: number }
    const i = (y * image.width + x) * 4
    const [r, g, b, a] = Array.from(image.data.slice(i, i + 4))
    return { r, g, b, a }
  }
  const rightClick = (x: number, y: number) => {
    fireEvent.pointerDown(canvas, { button: 2, buttons: 2, pointerId: 1, clientX: x, clientY: y })
    fireEvent.pointerUp(canvas, { button: 2, buttons: 0, pointerId: 1, clientX: x, clientY: y })
  }
  return { ref, canvas, context, shown, rightClick, onHistoryChange, onPickColor }
}

describe('PaintCanvas right click', () => {
  it('fills with the secondary colour as one undo step', () => {
    const { ref, shown, rightClick, onHistoryChange } = setup('fill')
    rightClick(5, 5)
    expect(shown(0, 0)).toEqual(BLUE)
    expect(shown(19, 19)).toEqual(BLUE)
    expect(onHistoryChange).toHaveBeenLastCalledWith(true, false)
    act(() => ref.current?.undo())
    expect(shown(5, 5)).toEqual(WHITE_PIXEL)
    expect(onHistoryChange).toHaveBeenLastCalledWith(false, true)
  })
})
