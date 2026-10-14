import { createRef } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bitmap } from '../core/bitmap'
import type { Rgba } from '../core/color'
import { BLACK, WHITE } from '../core/color'
import type { BrushId } from '../core/brushes'
import type { LayerInfo } from '../core/layers'
import { seededRandom } from '../core/random'
import type { ShapeKind } from '../core/shapes'
import type { ToolId } from '../core/tools'
import { DEFAULT_TEXT_OPTIONS } from '../render/text'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

// The test canvas cannot draw glyphs; stand in a solid block so placed text changes pixels.
vi.mock('../render/text', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../render/text')>()
  return {
    ...actual,
    renderText: vi.fn(() => new Bitmap(10, 4, BLACK)),
    renderTextSubpixel: vi.fn(() => ({ width: 10, height: 4, data: new Float32Array(10 * 4 * 3).fill(1) })),
  }
})

/**
 * One deliberate behavioural matrix for undo and redo: every document-editing
 * action is exactly one undo step that restores pixels, canvas size, layer stack
 * and active layer; redo re-applies it; and a new edit clears the redo stack.
 */

const SIZE = 30
const RED: Rgba = { r: 255, g: 0, b: 0, a: 255 }
const GREEN: Rgba = { r: 0, g: 255, b: 0, a: 255 }

/** Left half red, right half green: blurring, filling and inverting all visibly change it. */
function baseImage(): Bitmap {
  const bitmap = new Bitmap(SIZE, SIZE, RED)
  for (let y = 0; y < SIZE; y += 1) for (let x = SIZE / 2; x < SIZE; x += 1) bitmap.set(x, y, GREEN)
  return bitmap
}

interface Props {
  tool: ToolId
  brush: BrushId
  shapeKind: ShapeKind
}

function setup(initial: Partial<Props> = {}) {
  const ref = createRef<PaintCanvasHandle>()
  const onHistoryChange = vi.fn<(canUndo: boolean, canRedo: boolean) => void>()
  const onDocumentChange = vi.fn()
  const onLayersChange = vi.fn<(layers: LayerInfo[], active: number) => void>()
  let props: Props = { tool: 'pencil', brush: 'round', shapeKind: 'rectangle', ...initial }
  const element = () => (
    <PaintCanvas
      ref={ref}
      initialWidth={SIZE}
      initialHeight={SIZE}
      tool={props.tool}
      brush={props.brush}
      shapeKind={props.shapeKind}
      random={seededRandom(7)}
      primary={BLACK}
      secondary={WHITE}
      brushSize={3}
      opacity={100}
      shapeFill="outline"
      zoom={1}
      showGrid={false}
      onHistoryChange={onHistoryChange}
      onDocumentChange={onDocumentChange}
      onLayersChange={onLayersChange}
      onCursorMove={vi.fn()}
      onPickColor={vi.fn()}
      onSizeChange={vi.fn()}
      transparentSelection={false}
      selectionShape="rectangle"
      text={DEFAULT_TEXT_OPTIONS}
    />
  )
  const { container, rerender } = render(element())
  const setProps = (next: Partial<Props>) => {
    props = { ...props, ...next }
    rerender(element())
  }
  const canvas = container.querySelector('canvas')
  if (!canvas) throw new Error('canvas not rendered')
  canvas.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, toJSON: () => ({}) }) as DOMRect
  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  const context = { putImageData: vi.fn() }
  canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext
  act(() => ref.current?.loadBitmap(baseImage()))

  const drag = (from: [number, number], to: [number, number], pointerId = 1) => {
    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, pointerId, clientX: from[0], clientY: from[1] })
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId, clientX: (from[0] + to[0]) / 2, clientY: (from[1] + to[1]) / 2 })
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId, clientX: to[0], clientY: to[1] })
    fireEvent.pointerUp(canvas, { button: 0, pointerId, clientX: to[0], clientY: to[1] })
  }
  const click = (x: number, y: number) => {
    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, pointerId: 1, clientX: x, clientY: y })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: x, clientY: y })
  }
  const enter = () => act(() => fireEvent.keyDown(window, { key: 'Enter' }))
  const editor = () => container.querySelector<HTMLTextAreaElement>('.text-editor')
  /** Opens a text box with a click and types into it. */
  const typeText = (value: string, at: [number, number] = [4, 4]) => {
    click(at[0], at[1])
    const textarea = editor()
    if (!textarea) throw new Error('text box did not open')
    fireEvent.change(textarea, { target: { value } })
    return textarea
  }
  /** Selects a rectangle with the Select tool. */
  const select = (from: [number, number], to: [number, number]) => {
    setProps({ tool: 'select' })
    drag(from, to)
  }
  const resizeByHandle = (dx: number, dy = 0) => {
    const frame = container.querySelector<HTMLElement>('.canvas-frame')
    const handle = container.querySelector<HTMLElement>('.canvas-resize-handle-se')
    if (!frame || !handle) throw new Error('resize handle not rendered')
    frame.getBoundingClientRect = () =>
      ({ x: 0, y: 0, left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, toJSON: () => ({}) }) as DOMRect
    handle.setPointerCapture = vi.fn()
    fireEvent.pointerDown(handle, { button: 0, pointerId: 9, clientX: SIZE, clientY: SIZE })
    fireEvent.pointerMove(handle, { pointerId: 9, clientX: SIZE + dx / 2, clientY: SIZE + dy / 2 })
    fireEvent.pointerMove(handle, { pointerId: 9, clientX: SIZE + dx, clientY: SIZE + dy })
    fireEvent.pointerUp(handle, { pointerId: 9, clientX: SIZE + dx, clientY: SIZE + dy })
  }

  /** Everything an undo step must bring back: the shown pixels, the size and the layer stack. */
  const state = () => {
    const image = context.putImageData.mock.calls.at(-1)?.[0] as { data: Uint8ClampedArray; width: number; height: number }
    const layers = onLayersChange.mock.calls.at(-1)
    return {
      size: ref.current?.getSize(),
      shown: { width: image.width, height: image.height, data: Array.from(image.data) },
      layers: layers?.[0].map((layer) => `${layer.id}:${layer.name}`),
      active: layers?.[1],
    }
  }
  /** Runs a handle method as its own React update. */
  const call = (run: (handle: PaintCanvasHandle) => void) =>
    act(() => {
      if (ref.current) run(ref.current)
    })
  const history = () => onHistoryChange.mock.calls.at(-1)
  return {
    ref,
    call,
    container,
    canvas,
    setProps,
    drag,
    click,
    enter,
    editor,
    typeText,
    select,
    resizeByHandle,
    state,
    history,
    onHistoryChange,
    onDocumentChange,
    onLayersChange,
  }
}

type Setup = ReturnType<typeof setup>

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

    // Undo again, then a new edit: the redo stack is gone.
    s.call((h) => h.undo())
    s.call((h) => h.clear())
    expect(s.history()).toEqual([true, false])
    const cleared = s.state()
    s.call((h) => h.redo())
    expect(s.state()).toEqual(cleared)
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
