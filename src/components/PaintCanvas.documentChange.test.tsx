import { createRef } from 'react'
import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bitmap } from '../core/bitmap'
import { BLACK, WHITE } from '../core/color'
import { PaintCanvas } from './PaintCanvas'
import type { PaintCanvasHandle } from './PaintCanvas'

function setup() {
  const ref = createRef<PaintCanvasHandle>()
  const onDocumentChange = vi.fn()
  render(
    <PaintCanvas
      ref={ref}
      initialWidth={20}
      initialHeight={20}
      tool="brush"
      primary={BLACK}
      secondary={WHITE}
      brushSize={1}
      shapeFill="outline"
      shapeKind="rectangle"
      zoom={1}
      showGrid={false}
      onHistoryChange={vi.fn()}
      onCursorMove={vi.fn()}
      onPickColor={vi.fn()}
      onSizeChange={vi.fn()}
      onSelectionChange={vi.fn()}
      onZoomClick={vi.fn()}
      transparentSelection={false}
      selectionShape="rectangle"
      brush="round"
      onTextChange={vi.fn()}
      onDocumentChange={onDocumentChange}
    />,
  )
  return { ref, onDocumentChange }
}

describe('PaintCanvas document changes', () => {
  it('reports edits that create a history entry', () => {
    const { ref, onDocumentChange } = setup()
    act(() => ref.current?.clear())
    expect(onDocumentChange).toHaveBeenCalledTimes(1)
  })

  it('reports undo and redo that change the image', () => {
    const { ref, onDocumentChange } = setup()
    act(() => ref.current?.undo())
    expect(onDocumentChange).not.toHaveBeenCalled()
    act(() => ref.current?.clear())
    act(() => ref.current?.undo())
    act(() => ref.current?.redo())
    expect(onDocumentChange).toHaveBeenCalledTimes(3)
  })

  it('does not report a new or loaded document', () => {
    const { ref, onDocumentChange } = setup()
    act(() => ref.current?.newDocument(30, 30))
    act(() => ref.current?.loadBitmap(new Bitmap(10, 10, WHITE)))
    expect(onDocumentChange).not.toHaveBeenCalled()
  })
})
