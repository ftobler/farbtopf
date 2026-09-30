import { createRef } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BLACK, WHITE } from '../core/color'
import { SPRAY_TICK_MS } from '../core/brushes'
import { seededRandom } from '../core/random'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

const SIZE = 40

function setup(opacity = 100) {
  const ref = createRef<PaintCanvasHandle>()
  const onHistoryChange = vi.fn()
  const { container } = render(
    <PaintCanvas
      ref={ref}
      initialWidth={SIZE}
      initialHeight={SIZE}
      tool="brush"
      brush="spray"
      random={seededRandom(11)}
      primary={BLACK}
      secondary={WHITE}
      brushSize={20}
      opacity={opacity}
      shapeFill="outline"
      zoom={1}
      showGrid={false}
      onHistoryChange={onHistoryChange}
      onCursorMove={vi.fn()}
      onPickColor={vi.fn()}
      onSizeChange={vi.fn()}
      transparentSelection={false}
    />,
  )
  const canvas = container.querySelector('canvas')!
  canvas.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, toJSON: () => ({}) }) as DOMRect
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  const context = { putImageData: vi.fn() }
  canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
  const image = () => context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray; width: number }
  const painted = () => {
    const { data } = image()
    let count = 0
    for (let i = 0; i < data.length; i += 4) if (data[i] < 255) count += 1
    return count
  }
  return { ref, canvas, painted, image, onHistoryChange }
}

describe('PaintCanvas spray can', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps spraying while the pointer is held still', () => {
    const { canvas, painted, image } = setup()
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 20, clientY: 20 })
    const first = painted()
    expect(first).toBeGreaterThan(0)
    act(() => {
      vi.advanceTimersByTime(SPRAY_TICK_MS * 10)
    })
    const later = painted()
    expect(later).toBeGreaterThan(first * 2)
    // Everything stays inside the 20 px circle around the pointer.
    const { data, width } = image()
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === 255) continue
      const x = (i / 4) % width
      const y = Math.floor(i / 4 / width)
      expect(Math.hypot(x - 20, y - 20)).toBeLessThanOrEqual(10.75)
    }
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 20, clientY: 20 })
  })

  it('stops spraying when the pointer is released', () => {
    const { canvas, painted } = setup()
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 20, clientY: 20 })
    act(() => {
      vi.advanceTimersByTime(SPRAY_TICK_MS * 3)
    })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 20, clientY: 20 })
    const done = painted()
    act(() => {
      vi.advanceTimersByTime(SPRAY_TICK_MS * 20)
    })
    expect(painted()).toBe(done)
  })

  it('follows the pointer while dragging', () => {
    const { canvas, image } = setup()
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 30, clientY: 30 })
    act(() => {
      vi.advanceTimersByTime(SPRAY_TICK_MS * 30)
    })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 30, clientY: 30 })
    const { data, width } = image()
    let nearEnd = 0
    for (let y = 25; y < 36; y += 1) for (let x = 25; x < 36; x += 1) if (data[(y * width + x) * 4] < 255) nearEnd += 1
    expect(nearEnd).toBeGreaterThan(30)
  })

  it('never goes past its opacity however long it sprays', () => {
    const { canvas, image } = setup(40)
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 20, clientY: 20 })
    act(() => {
      vi.advanceTimersByTime(SPRAY_TICK_MS * 100)
    })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 20, clientY: 20 })
    const { data, width } = image()
    const center = (20 * width + 20) * 4
    expect(Math.abs(data[center] - 153)).toBeLessThanOrEqual(1)
  })

  it('undoes a whole spray in one step', () => {
    const { ref, canvas, painted } = setup()
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 20, clientY: 20 })
    act(() => {
      vi.advanceTimersByTime(SPRAY_TICK_MS * 10)
    })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 20, clientY: 20 })
    expect(painted()).toBeGreaterThan(0)
    act(() => ref.current?.undo())
    expect(painted()).toBe(0)
  })
})
