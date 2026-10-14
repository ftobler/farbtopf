// The undo matrix: every document-editing action is exactly one undo step that
// restores pixels, canvas size, layer stack and active layer, reports one document
// change, is redone in full, leaves no undo step sharing the live surface, and a new
// edit clears the redo stack. Undo while something is still in progress is
// PaintCanvas.undoInteraction.test.tsx.

import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bitmap } from '../core/bitmap'
import { BLACK } from '../core/color'
import { RED, setup } from '../test/undoHarness'
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

interface Row {
  /** Brings the canvas to where the action starts; may record history of its own. */
  given?: (s: Setup) => void
  /** The editing action under test. */
  act: (s: Setup) => void
  /** How many document changes the action reports; more than one when it edits a selection it lifted itself. */
  reports?: number
}

const rows: Record<string, Row> = {
  'pencil stroke': { given: (s) => s.setProps({ tool: 'pencil' }), act: (s) => s.drag([2, 2], [25, 20]) },
  'brush stroke': { given: (s) => s.setProps({ tool: 'brush', brush: 'round' }), act: (s) => s.drag([2, 2], [25, 20]) },
  'calligraphy brush stroke': {
    given: (s) => s.setProps({ tool: 'brush', brush: 'calligraphy' }),
    act: (s) => s.drag([2, 2], [25, 20]),
  },
  'eraser stroke': { given: (s) => s.setProps({ tool: 'eraser' }), act: (s) => s.drag([2, 2], [25, 20]) },
  'highlighter stroke': {
    given: (s) => s.setProps({ tool: 'brush', brush: 'highlighter' }),
    act: (s) => s.drag([2, 2], [25, 20]),
  },
  'spray stroke': { given: (s) => s.setProps({ tool: 'brush', brush: 'spray' }), act: (s) => s.drag([5, 5], [25, 20]) },
  'airbrush stroke': { given: (s) => s.setProps({ tool: 'airbrush' }), act: (s) => s.drag([5, 5], [25, 20]) },
  fill: { given: (s) => s.setProps({ tool: 'fill' }), act: (s) => s.click(3, 3) },
  'shape placed with Enter': {
    given: (s) => s.setProps({ tool: 'shape', shapeKind: 'rectangle' }),
    act: (s) => {
      s.drag([3, 3], [20, 20])
      s.enter()
    },
  },
  'shape placed by switching tools': {
    given: (s) => s.setProps({ tool: 'shape', shapeKind: 'ellipse' }),
    act: (s) => {
      s.drag([3, 3], [20, 20])
      s.setProps({ tool: 'pencil' })
    },
  },
  'freeform polyline': {
    given: (s) => s.setProps({ tool: 'shape', shapeKind: 'freeform' }),
    act: (s) => {
      s.click(3, 3)
      s.click(20, 5)
      s.click(10, 25)
      s.enter()
    },
  },
  curve: {
    given: (s) => s.setProps({ tool: 'shape', shapeKind: 'polyline' }),
    act: (s) => {
      s.drag([3, 15], [27, 15])
      s.enter()
    },
  },
  'text placed with Enter': {
    given: (s) => s.setProps({ tool: 'text' }),
    act: (s) => {
      const textarea = s.typeText('hi')
      fireEvent.keyDown(textarea, { key: 'Enter' })
    },
  },
  'selection moved': {
    given: (s) => s.select([0, 0], [10, 10]),
    act: (s) => s.drag([5, 5], [20, 20]),
  },
  'selection resized by a handle': {
    given: (s) => s.select([2, 2], [10, 10]),
    act: (s) => s.drag([10, 10], [20, 20]),
  },
  'selection scaled': { given: (s) => s.select([0, 0], [10, 10]), act: (s) => s.call((h) => h.scale(20, 6)) },
  'selection rotated': { given: (s) => s.select([10, 4], [20, 10]), act: (s) => s.call((h) => h.rotate(90)) },
  'selection flipped': { given: (s) => s.select([10, 0], [25, 10]), act: (s) => s.call((h) => h.flip('horizontal')) },
  'selection inverted': { given: (s) => s.select([0, 0], [10, 10]), act: (s) => s.call((h) => h.invertColors()) },
  'lifted selection inverted': {
    given: (s) => s.select([0, 0], [10, 10]),
    act: (s) => {
      s.drag([5, 5], [8, 8])
      s.call((h) => h.invertColors())
    },
    reports: 2,
  },
  'selection blurred': { given: (s) => s.select([10, 0], [20, 10]), act: (s) => s.call((h) => h.blur(2)) },
  'selection deleted': { given: (s) => s.select([0, 0], [10, 10]), act: (s) => s.call((h) => h.deleteSelection()) },
  'selection cut': { given: (s) => s.select([0, 0], [10, 10]), act: (s) => s.call((h) => h.cutSelection()) },
  paste: { act: (s) => s.call((h) => h.pasteBitmap(new Bitmap(6, 6, BLACK))) },
  'paste that grows the canvas': { act: (s) => s.call((h) => h.pasteBitmap(new Bitmap(40, 10, BLACK))) },
  clear: { act: (s) => s.call((h) => h.clear()) },
  'flip image': { act: (s) => s.call((h) => h.flip('horizontal')) },
  'rotate image': { act: (s) => s.call((h) => h.rotate(90)) },
  'rotate image by an angle': { act: (s) => s.call((h) => h.rotate(30)) },
  'resize image': { act: (s) => s.call((h) => h.resize(40, 20)) },
  'scale image': { act: (s) => s.call((h) => h.scale(20, 40)) },
  'canvas size dialog': { act: (s) => s.call((h) => h.resizeCanvas({ x: -4, y: 0, width: 40, height: 25 })) },
  'canvas resize drag': { act: (s) => s.resizeByHandle(8, -6) },
  'crop to selection': { given: (s) => s.select([5, 5], [20, 15]), act: (s) => s.call((h) => h.cropToSelection()) },
  'invert image': { act: (s) => s.call((h) => h.invertColors()) },
  'blur image': { act: (s) => s.call((h) => h.blur(2)) },
  'add layer': { act: (s) => s.call((h) => h.addLayer()) },
  'delete the active layer': {
    given: (s) => {
      s.call((h) => h.addLayer())
      s.drag([2, 2], [25, 20])
    },
    act: (s) => s.call((h) => h.deleteLayer(1)),
  },
  'delete a layer below the active one': {
    given: (s) => s.call((h) => h.addLayer()),
    act: (s) => s.call((h) => h.deleteLayer(0)),
  },
  'move layer': {
    given: (s) => {
      s.call((h) => h.addLayer())
      s.drag([2, 2], [25, 20])
    },
    act: (s) => s.call((h) => h.moveLayer(1, 0)),
  },
  'stroke on an upper layer': {
    given: (s) => {
      s.call((h) => h.addLayer())
      s.call((h) => h.addLayer())
      s.call((h) => h.selectLayer(1))
    },
    act: (s) => s.drag([2, 2], [25, 20]),
  },
  'translucent brush stroke': {
    given: (s) => s.setProps({ tool: 'brush', brush: 'round', opacity: 50 }),
    act: (s) => s.drag([2, 2], [25, 20]),
  },
  'spray held still over several ticks': {
    given: (s) => s.setProps({ tool: 'brush', brush: 'spray' }),
    act: (s) => s.hold([15, 15], 6),
  },
  'pixelate brush stroke': {
    given: (s) => s.setProps({ tool: 'brush', brush: 'pixelate' }),
    act: (s) => s.drag([10, 10], [20, 12]),
  },
  'right-button fill': { given: (s) => s.setProps({ tool: 'fill' }), act: (s) => s.click(3, 3, 2) },
  'right-button eraser stroke': {
    given: (s) => s.setProps({ tool: 'eraser' }),
    act: (s) => s.drag([2, 2], [25, 20], 2),
  },
  'right-button pencil stroke': {
    given: (s) => s.setProps({ tool: 'pencil' }),
    act: (s) => s.drag([2, 2], [25, 20], 2),
  },
  'line with its end handle dragged, then placed': {
    given: (s) => s.setProps({ tool: 'shape', shapeKind: 'line' }),
    act: (s) => {
      s.drag([3, 15], [20, 15])
      s.drag([20, 15], [25, 25])
      s.enter()
    },
  },
  'selection rotated by its handle': {
    given: (s) => s.select([10, 4], [20, 10]),
    act: (s) => s.rotateByHandle([15, 0], [22, 7]),
  },
  'moved selection deleted': {
    given: (s) => s.select([0, 0], [10, 10]),
    act: (s) => {
      s.drag([5, 5], [20, 20])
      s.call((h) => h.deleteSelection())
    },
    reports: 2,
  },
  'paste dragged into place': {
    given: (s) => s.setProps({ tool: 'select' }),
    act: (s) => {
      s.call((h) => h.pasteBitmap(new Bitmap(6, 6, BLACK)))
      s.drag([3, 3], [15, 15])
    },
    reports: 2,
  },
}

describe('PaintCanvas undo matrix', () => {
  it.each(Object.entries(rows))('%s is one undo step, undone and redone in full', (_name, row) => {
    const s = setup()
    row.given?.(s)
    const before = s.state()
    const historyBefore = s.history()
    s.onDocumentChange.mockClear()

    row.act(s)
    const after = s.state()
    expect(after).not.toEqual(before)
    expect(s.history()).toEqual([true, false])
    const reports = row.reports ?? 1
    expect(s.onDocumentChange).toHaveBeenCalledTimes(reports)

    s.call((h) => h.undo())
    expect(s.state()).toEqual(before)
    expect(s.history()).toEqual([historyBefore?.[0] ?? false, true])
    expect(s.onDocumentChange).toHaveBeenCalledTimes(reports + 1)

    s.call((h) => h.redo())
    expect(s.state()).toEqual(after)
    expect(s.history()).toEqual([true, false])
    expect(s.onDocumentChange).toHaveBeenCalledTimes(reports + 2)

    // Doing the action again, from its own starting point, is a new edit: the redo
    // stack is gone. An undo may keep the selection, so it is dropped first.
    const props = s.props()
    s.call((h) => h.undo())
    s.call((h) => h.clearSelection())
    s.setProps(props)
    row.given?.(s)
    row.act(s)
    expect(s.history()).toEqual([true, false])
    const again = s.state()
    s.call((h) => h.redo())
    expect(s.state()).toEqual(again)
  })

  // A stroke straight after the action paints the live surface in place; if an undo
  // step still shared that bitmap, undoing the stroke and then the action would not
  // bring back what was there before.
  it.each(Object.entries(rows))('%s leaves no undo step sharing the surface painted next', (_name, row) => {
    const s = setup()
    row.given?.(s)
    const before = s.state()
    row.act(s)
    const after = s.state()
    s.setProps({ tool: 'pencil', opacity: 100 })
    s.drag([1, 28], [28, 1])
    s.call((h) => h.undo())
    expect(s.state()).toEqual(after)
    s.call((h) => h.undo())
    expect(s.state()).toEqual(before)
  })
})

describe('PaintCanvas history without an edit', () => {
  it('does not count selecting a layer as an undo step', () => {
    const s = setup()
    s.call((h) => h.addLayer())
    s.onDocumentChange.mockClear()
    s.onHistoryChange.mockClear()
    s.call((h) => h.selectLayer(0))
    expect(s.state().active).toBe(0)
    expect(s.onDocumentChange).not.toHaveBeenCalled()
    expect(s.onHistoryChange).not.toHaveBeenCalledWith(true, true)
    // The one undo step there is takes back adding the layer.
    s.call((h) => h.undo())
    expect(s.state().layers).toEqual(['1:Background'])
    expect(s.history()).toEqual([false, true])
  })

  it('brings back the layer that was active when the undone step was made', () => {
    const s = setup()
    s.call((h) => h.addLayer())
    s.drag([2, 2], [25, 20])
    const drawn = s.state()
    s.call((h) => h.selectLayer(0))
    s.call((h) => h.undo())
    expect(s.state().active).toBe(1)
    s.call((h) => h.redo())
    // Redo returns to how things were before the undo, the background active.
    expect(s.state()).toEqual({ ...drawn, active: 0 })
    // Painting the background after that leaves the layer above as it was drawn.
    s.drag([0, 28], [29, 28])
    s.call((h) => h.undo())
    expect(s.state()).toEqual({ ...drawn, active: 0 })
  })

  it.each<[string, (s: Setup) => void]>([
    ['a new document', (s) => s.call((h) => h.newDocument(20, 20))],
    ['a loaded image', (s) => s.call((h) => h.loadBitmap(new Bitmap(12, 12, RED)))],
  ])('clears the history for %s without reporting an edit', (_name, open) => {
    const s = setup()
    s.drag([2, 2], [25, 20])
    s.call((h) => h.undo())
    s.drag([2, 20], [25, 2])
    s.call((h) => h.addLayer())
    s.onDocumentChange.mockClear()
    open(s)
    expect(s.history()).toEqual([false, false])
    expect(s.onDocumentChange).not.toHaveBeenCalled()
    expect(s.state().layers).toEqual(['1:Background'])
    const opened = s.state()
    s.call((h) => h.undo())
    s.call((h) => h.redo())
    expect(s.state()).toEqual(opened)
    expect(s.onDocumentChange).not.toHaveBeenCalled()
  })

  it('reports nothing for an undo or redo with nothing to take back', () => {
    const s = setup()
    s.onDocumentChange.mockClear()
    s.call((h) => h.undo())
    s.call((h) => h.redo())
    expect(s.onDocumentChange).not.toHaveBeenCalled()
  })

  it('records nothing for a selection that is only drawn and dropped', () => {
    const s = setup()
    s.select([2, 2], [10, 10])
    s.call((h) => h.clearSelection())
    s.call((h) => h.selectAll())
    s.call((h) => h.invertSelection())
    expect(s.history()).toEqual([false, false])
  })
})

describe('PaintCanvas edits of a floating selection', () => {
  // The lift is the one step of the whole floating session, yet each later change to
  // the floating pixels is a change to the image, reported once per gesture.
  it.each<[string, (s: Setup) => void]>([
    ['moved again', (s) => s.drag([16, 8], [20, 10])],
    [
      'resized by a handle',
      (s) => {
        const rect = s.ref.current?.getSelection()
        if (!rect) throw new Error('nothing selected')
        s.drag([rect.x + rect.width, rect.y + rect.height], [rect.x + rect.width + 4, rect.y + rect.height + 3])
      },
    ],
    ['flipped', (s) => s.call((h) => h.flip('horizontal'))],
    ['rotated', (s) => s.call((h) => h.rotate(90))],
    ['scaled', (s) => s.call((h) => h.scale(14, 6))],
    ['inverted', (s) => s.call((h) => h.invertColors())],
    ['blurred', (s) => s.call((h) => h.blur(2))],
    ['deleted', (s) => s.call((h) => h.deleteSelection())],
    ['made transparent', (s) => s.setProps({ transparentSelection: true, secondary: RED })],
  ])('reports a lifted selection %s as one document change without a new step', (_name, change) => {
    const s = setup()
    // Across the red and green halves, so every edit visibly changes the lifted pixels.
    s.select([10, 0], [20, 10])
    const before = s.state()
    s.drag([15, 5], [17, 8])
    const lifted = s.state()
    s.onDocumentChange.mockClear()
    change(s)
    expect(s.state()).not.toEqual(lifted)
    expect(s.onDocumentChange).toHaveBeenCalledTimes(1)
    s.call((h) => h.undo())
    expect(s.state()).toEqual(before)
    expect(s.history()).toEqual([false, true])
  })
})
