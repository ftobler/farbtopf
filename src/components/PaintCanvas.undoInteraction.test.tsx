// Undo and redo while something is still in progress: a held stroke or drag, a pending
// shape, curve or text box, a floating selection, or an image still loading. That a
// finished action is one undo step is PaintCanvas.undoMatrix.test.tsx.

import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bitmap } from '../core/bitmap'
import { BLACK } from '../core/color'
import { RED, SIZE, baseImage, setup } from '../test/undoHarness'
import type { Setup } from '../test/undoHarness'

// The test canvas cannot draw glyphs; stand in a solid block so placed text changes pixels.
vi.mock('../render/text', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../render/text')>()
  return {
    ...actual,
    renderText: vi.fn(() => new Bitmap(10, 4, BLACK)),
    renderTextSubpixel: vi.fn(() => ({ width: 10, height: 4, data: new Float32Array(10 * 4 * 3).fill(1) })),
  }
})

const down = (s: Setup, x: number, y: number, pointerId = 1) =>
  fireEvent.pointerDown(s.canvas, { button: 0, buttons: 1, pointerId, clientX: x, clientY: y })
const move = (s: Setup, x: number, y: number, pointerId = 1) =>
  fireEvent.pointerMove(s.canvas, { buttons: 1, pointerId, clientX: x, clientY: y })
const up = (s: Setup, x: number, y: number, pointerId = 1) =>
  fireEvent.pointerUp(s.canvas, { button: 0, pointerId, clientX: x, clientY: y })

/** Grabs the canvas's east resize handle and drags it by `dx`, without letting go. */
function holdCanvasResize(s: Setup, dx: number) {
  const frame = s.container.querySelector<HTMLElement>('.canvas-frame')
  const handle = s.container.querySelector<HTMLElement>('.canvas-resize-handle-e')
  if (!frame || !handle) throw new Error('resize handle not rendered')
  frame.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, toJSON: () => ({}) }) as DOMRect
  handle.setPointerCapture = vi.fn()
  fireEvent.pointerDown(handle, { button: 0, pointerId: 7, clientX: SIZE, clientY: 15 })
  fireEvent.pointerMove(handle, { pointerId: 7, clientX: SIZE + dx, clientY: 15 })
  return (to: number) => fireEvent.pointerMove(handle, { pointerId: 7, clientX: to, clientY: 15 })
}

describe('PaintCanvas undo and redo during a drag', () => {
  it('aborts a held highlighter stroke before undoing so a later move cannot repaint it', () => {
    const s = setup({ tool: 'brush', brush: 'highlighter' })
    const before = s.state()
    down(s, 5, 5)
    move(s, 15, 15)
    s.call((h) => h.undo())
    expect(s.history()).toEqual([false, true])
    // The pointer is still held; a further move must not paint over the restored image.
    move(s, 25, 25)
    expect(s.state()).toEqual(before)
  })

  it('aborts a held selection move before undoing so a later move records no new step', () => {
    const s = setup()
    s.select([0, 0], [9, 9])
    // Lift the selection with a move drag, then undo without releasing.
    down(s, 5, 5, 2)
    move(s, 8, 8, 2)
    expect(s.history()).toEqual([true, false])
    s.call((h) => h.undo())
    expect(s.history()).toEqual([false, true])
    // The pointer is still held; another move must not lift a fresh floating selection.
    move(s, 25, 25, 2)
    expect(s.history()).toEqual([false, true])
    expect(s.ref.current?.getSelection()).toBeNull()
    s.call((h) => h.redo())
    expect(s.history()).toEqual([true, false])
  })

  it('aborts a held canvas resize before undoing so a later move cannot resize again', () => {
    const s = setup()
    const moveTo = holdCanvasResize(s, -5)
    expect(s.ref.current?.getSize()).toEqual({ width: 25, height: SIZE })
    expect(s.history()).toEqual([true, false])
    s.call((h) => h.undo())
    expect(s.ref.current?.getSize()).toEqual({ width: SIZE, height: SIZE })
    expect(s.history()).toEqual([false, true])
    // The pointer is still held; another move must not resize the restored document.
    moveTo(SIZE + 10)
    expect(s.ref.current?.getSize()).toEqual({ width: SIZE, height: SIZE })
    expect(s.history()).toEqual([false, true])
  })
})

describe('PaintCanvas opening a document during a drag', () => {
  it('aborts a held stroke so a later move cannot paint the new document', () => {
    const s = setup()
    down(s, 5, 5)
    move(s, 15, 15)
    s.call((h) => h.loadBitmap(baseImage()))
    const opened = s.state()
    move(s, 25, 25)
    up(s, 25, 25)
    expect(s.state()).toEqual(opened)
    expect(s.history()).toEqual([false, false])
  })

  it('aborts a held selection move so a later move lifts nothing from the new document', () => {
    const s = setup()
    s.select([0, 0], [9, 9])
    down(s, 5, 5, 2)
    move(s, 8, 8, 2)
    s.call((h) => h.newDocument(SIZE, SIZE))
    move(s, 25, 25, 2)
    expect(s.history()).toEqual([false, false])
    expect(s.ref.current?.getSelection()).toBeNull()
  })

  it('aborts a held canvas resize so a later move cannot resize the new document', () => {
    const s = setup()
    const moveTo = holdCanvasResize(s, -5)
    s.call((h) => h.newDocument(SIZE, SIZE))
    moveTo(SIZE + 10)
    expect(s.ref.current?.getSize()).toEqual({ width: SIZE, height: SIZE })
    expect(s.history()).toEqual([false, false])
  })
})

describe('PaintCanvas undo and redo with a pending shape', () => {
  // Undo takes back the pending shape itself, as in Paint: it is placed and then
  // undone, so the step before it survives and redo brings it back.
  const place = (s: Setup) => s.drag([2, 5], [20, 25])
  /** A rectangle placed as the one step before the pending work. */
  function placedFirst() {
    const s = setup({ tool: 'shape', shapeKind: 'rectangle' })
    s.drag([2, 2], [8, 8])
    s.enter()
    return { s, first: s.state() }
  }

  it('takes back only the pending shape on undo, and redo brings it back', () => {
    const { s, first } = placedFirst()
    place(s)
    const placed = s.state()
    s.call((h) => h.undo())
    expect(s.ref.current?.hasPendingShape()).toBe(false)
    expect(s.state()).toEqual(first)
    expect(s.history()).toEqual([true, true])
    s.call((h) => h.redo())
    expect(s.state()).toEqual(placed)
  })

  it('takes back an unfinished freeform shape on undo, and redo brings it back', () => {
    const s = setup({ tool: 'shape', shapeKind: 'freeform' })
    const before = s.state()
    down(s, 2, 2)
    move(s, 12, 2)
    up(s, 12, 2)
    s.call((h) => h.undo())
    expect(s.state()).toEqual(before)
    expect(s.history()).toEqual([false, true])
    s.call((h) => h.redo())
    expect(s.state()).not.toEqual(before)
  })

  it('takes back only a lone freeform vertex on undo', () => {
    const { s, first } = placedFirst()
    s.setProps({ shapeKind: 'freeform' })
    s.click(15, 15)
    s.call((h) => h.undo())
    expect(s.ref.current?.hasPendingShape()).toBe(false)
    expect(s.state()).toEqual(first)
    expect(s.history()).toEqual([true, false])
  })

  it('takes back only a shape still being dragged out on undo', () => {
    const { s, first } = placedFirst()
    down(s, 12, 12)
    move(s, 25, 25)
    s.call((h) => h.undo())
    expect(s.ref.current?.hasPendingShape()).toBe(false)
    expect(s.state()).toEqual(first)
    expect(s.history()).toEqual([true, false])
  })

  it('drops the pending shape on redo', () => {
    const { s, first } = placedFirst()
    s.call((h) => h.undo())
    place(s)
    s.call((h) => h.redo())
    expect(s.ref.current?.hasPendingShape()).toBe(false)
    expect(s.state()).toEqual(first)
  })

  it('drops a freeform shape in progress on redo, and redoes', () => {
    const { s, first } = placedFirst()
    s.call((h) => h.undo())
    s.setProps({ shapeKind: 'freeform' })
    s.click(5, 15)
    s.click(25, 15)
    s.call((h) => h.redo())
    expect(s.ref.current?.hasPendingShape()).toBe(false)
    expect(s.state()).toEqual(first)
    expect(s.history()).toEqual([true, false])
  })

  it('drops a curve in progress on redo, and redoes', () => {
    const { s, first } = placedFirst()
    s.call((h) => h.undo())
    s.setProps({ shapeKind: 'polyline' })
    s.drag([5, 15], [25, 15])
    s.call((h) => h.redo())
    expect(s.ref.current?.hasPendingShape()).toBe(false)
    expect(s.state()).toEqual(first)
  })
})

describe('PaintCanvas redo with nothing to redo is a no-op', () => {
  it('does not drop a pending shape on a redo with nothing to redo', () => {
    const s = setup({ tool: 'shape', shapeKind: 'rectangle' })
    s.drag([2, 2], [8, 8])
    expect(s.ref.current?.hasPendingShape()).toBe(true)
    s.call((h) => h.redo())
    expect(s.ref.current?.hasPendingShape()).toBe(true)
  })

  it('does not commit a floating selection on a redo with nothing to redo', () => {
    const s = setup({ tool: 'select' })
    s.call((h) => h.pasteBitmap(new Bitmap(4, 4, RED)))
    expect(s.ref.current?.getSelection()).not.toBeNull()
    s.call((h) => h.redo())
    expect(s.ref.current?.getSelection()).not.toBeNull()
  })
})

describe('PaintCanvas undo with a floating selection', () => {
  it('places a floating paste before another tool paints, so undoing the stroke keeps the paste', () => {
    const s = setup({ tool: 'pencil' })
    s.call((h) => h.pasteBitmap(new Bitmap(10, 10, BLACK)))
    const pasted = s.state()
    s.drag([20, 20], [25, 25])
    s.call((h) => h.undo())
    expect(s.state()).toEqual(pasted)
  })

  it('keeps a selection through a same-size undo', () => {
    const s = setup()
    s.select([2, 2], [10, 9])
    const selection = s.ref.current?.getSelection()
    expect(selection).not.toBeNull()
    s.call((h) => h.invertColors())
    s.call((h) => h.undo())
    expect(s.ref.current?.getSize()).toEqual({ width: SIZE, height: SIZE })
    expect(s.ref.current?.getSelection()).toEqual(selection)
  })
})

describe('PaintCanvas undo and redo with an open text box', () => {
  // Like a pending shape: undo takes back the text box itself (placed, then undone,
  // so redo brings it back), and redo drops it.
  it('takes back only the typed text on undo, and redo brings it back', () => {
    const s = setup()
    s.drag([2, 2], [25, 20])
    const stroked = s.state()
    s.setProps({ tool: 'text' })
    s.typeText('hi')
    s.call((h) => h.undo())
    expect(s.editor()).toBeNull()
    expect(s.state()).toEqual(stroked)
    expect(s.history()).toEqual([true, true])
    s.call((h) => h.redo())
    const withText = s.state()
    expect(withText).not.toEqual(stroked)
    expect(s.history()).toEqual([true, false])
    // The text is a step of its own on top of the stroke.
    s.call((h) => h.undo())
    expect(s.state()).toEqual(stroked)
    s.call((h) => h.undo())
    expect(s.history()).toEqual([false, true])
  })

  it('reports the text undo as an edit', () => {
    const s = setup({ tool: 'text' })
    s.typeText('hi')
    s.onDocumentChange.mockClear()
    s.call((h) => h.undo())
    // Placing the text, then taking it back.
    expect(s.onDocumentChange).toHaveBeenCalledTimes(2)
  })

  it('only closes an empty text box on undo', () => {
    const s = setup()
    s.drag([2, 2], [25, 20])
    const stroked = s.state()
    s.setProps({ tool: 'text' })
    s.typeText('   ')
    s.call((h) => h.undo())
    expect(s.editor()).toBeNull()
    expect(s.state()).toEqual(stroked)
    expect(s.history()).toEqual([true, false])
  })

  it('drops the text box on redo, and redoes', () => {
    const s = setup()
    s.drag([2, 2], [25, 20])
    const stroked = s.state()
    s.call((h) => h.undo())
    s.setProps({ tool: 'text' })
    s.typeText('hi')
    s.call((h) => h.redo())
    expect(s.editor()).toBeNull()
    expect(s.state()).toEqual(stroked)
    expect(s.history()).toEqual([true, false])
  })

  it('keeps the text box on a redo with nothing to redo', () => {
    const s = setup({ tool: 'text' })
    s.typeText('hi')
    s.call((h) => h.redo())
    expect(s.editor()?.value).toBe('hi')
  })

  it('takes back the text, then the resize, when undoing past a size change', () => {
    const s = setup()
    s.call((h) => h.resizeCanvas({ x: 0, y: 0, width: 40, height: 40 }))
    const resized = s.state()
    s.setProps({ tool: 'text' })
    s.typeText('hi', [32, 32])
    s.call((h) => h.undo())
    expect(s.editor()).toBeNull()
    expect(s.state()).toEqual(resized)
    s.call((h) => h.undo())
    expect(s.state().size).toEqual({ width: SIZE, height: SIZE })
    expect(s.editor()).toBeNull()
  })
})

describe('PaintCanvas undo and redo with a selection', () => {
  it('takes back a lifted selection rotated and scaled in several goes as one step', () => {
    const s = setup()
    s.select([0, 0], [10, 10])
    const before = s.state()
    s.drag([5, 5], [12, 12])
    s.call((h) => h.rotate(90))
    s.call((h) => h.scale(14, 6))
    s.call((h) => h.flip('vertical'))
    s.call((h) => h.undo())
    expect(s.state()).toEqual(before)
    expect(s.ref.current?.getSelection()).toBeNull()
    expect(s.history()).toEqual([false, true])
    s.call((h) => h.redo())
    expect(s.history()).toEqual([true, false])
  })

  it('drops a selection that no longer fits when undo changes the size', () => {
    const s = setup()
    s.call((h) => h.resize(60, 60))
    // The 30px canvas box now shows 60 image pixels: this selects 40..56.
    s.select([20, 20], [28, 28])
    expect(s.ref.current?.getSelection()).not.toBeNull()
    s.call((h) => h.undo())
    expect(s.state().size).toEqual({ width: SIZE, height: SIZE })
    expect(s.ref.current?.getSelection()).toBeNull()
  })

  it('drops a selection that no longer fits when redo changes the size', () => {
    const s = setup()
    s.call((h) => h.resize(10, 10))
    s.call((h) => h.undo())
    s.select([15, 15], [28, 28])
    s.call((h) => h.redo())
    expect(s.state().size).toEqual({ width: 10, height: 10 })
    expect(s.ref.current?.getSelection()).toBeNull()
  })
})
