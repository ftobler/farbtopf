import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BLACK, WHITE } from '../core/color'
import { DEFAULT_TEXT_OPTIONS } from '../render/text'
import { PaintCanvas } from './PaintCanvas'

const SIZE = 50
const SLOTS = 3

interface HistoryCall {
  salt: number
  undo: boolean
  redo: boolean
}

/**
 * Renders the canvas with a fresh set of callback identities on every re-render, the
 * way App does whenever one of its own state values changes. A callback prop becoming
 * a new function must not rebind the component's internal event handlers.
 */
function renderWithUnstableProps() {
  const addSpy = vi.spyOn(document, 'addEventListener')
  const removeSpy = vi.spyOn(document, 'removeEventListener')
  const historyCalls: HistoryCall[] = []

  const element = (salt: number) => (
    <PaintCanvas
      initialWidth={SIZE}
      initialHeight={SIZE}
      tool="text"
      primary={BLACK}
      secondary={WHITE}
      brushSize={1}
      shapeFill="outline"
      zoom={1}
      showGrid={false}
      onHistoryChange={(undo, redo) => historyCalls.push({ salt, undo, redo })}
      onCursorMove={() => salt}
      onPickColor={() => salt}
      onSizeChange={() => salt}
      onSelectionChange={() => salt}
      onSelectionSizeChange={() => salt}
      onZoomClick={() => salt}
      transparentSelection={false}
      text={DEFAULT_TEXT_OPTIONS}
      onTextChange={() => salt}
      onPanChange={() => salt}
      onLayersChange={() => salt}
      onDocumentChange={() => salt}
      onPendingChange={() => salt}
    />
  )

  const { container, rerender } = render(element(0))
  const canvas = container.querySelector('canvas')
  if (!canvas) throw new Error('canvas not rendered')
  canvas.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, toJSON: () => ({}) }) as DOMRect
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()

  const flush = () =>
    act(() => {
      vi.runOnlyPendingTimers()
    })

  const openEditor = () => {
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    flush()
  }

  const rerenderUnstable = (salt: number) => {
    rerender(element(salt))
    flush()
  }

  const mousedownCalls = (calls: unknown[][]) => calls.filter((call) => call[0] === 'mousedown').length
  const editor = () => container.querySelector<HTMLTextAreaElement>('.text-editor')

  return {
    openEditor,
    rerenderUnstable,
    editor,
    historyCalls,
    adds: () => mousedownCalls(addSpy.mock.calls),
    removes: () => mousedownCalls(removeSpy.mock.calls),
  }
}

describe('PaintCanvas callback prop stability', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('keeps the text outside-click listener bound across unrelated re-renders', () => {
    vi.useFakeTimers()
    const { openEditor, rerenderUnstable, adds, removes } = renderWithUnstableProps()

    openEditor()
    expect(adds()).toBe(1)

    const addsOnOpen = adds()
    const removesOnOpen = removes()

    for (let salt = 1; salt <= SLOTS; salt += 1) rerenderUnstable(salt)

    expect(adds()).toBe(addsOnOpen)
    expect(removes()).toBe(removesOnOpen)
  })

  it('invokes the callback from the latest render after a text commit', () => {
    vi.useFakeTimers()
    const { openEditor, rerenderUnstable, editor, historyCalls } = renderWithUnstableProps()

    openEditor()
    fireEvent.change(editor()!, { target: { value: 'hi' } })
    for (let salt = 1; salt <= SLOTS; salt += 1) rerenderUnstable(salt)

    fireEvent.keyDown(editor()!, { key: 'Enter' })

    expect(historyCalls.at(-1)).toEqual({ salt: SLOTS, undo: true, redo: false })
  })
})
