import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NewCanvasDialog } from './NewCanvasDialog'
import { ScaleImageDialog } from './ScaleImageDialog'

describe('NewCanvasDialog', () => {
  it('creates the canvas when Enter is pressed in a field', () => {
    const onCreate = vi.fn()
    render(
      <NewCanvasDialog
        open
        initialWidth={800}
        initialHeight={600}
        onCancel={vi.fn()}
        onCreate={onCreate}
      />,
    )
    const width = screen.getByLabelText('Width')
    fireEvent.change(width, { target: { value: '320' } })
    fireEvent.keyDown(width, { key: 'Enter' })
    expect(onCreate).toHaveBeenCalledWith(320, 600)
  })
})

describe('ScaleImageDialog', () => {
  it('applies the scale when Enter is pressed in a field', () => {
    const onApply = vi.fn()
    render(
      <ScaleImageDialog
        open
        initialWidth={800}
        initialHeight={600}
        onCancel={vi.fn()}
        onApply={onApply}
      />,
    )
    fireEvent.keyDown(screen.getByLabelText('Horizontal'), { key: 'Enter' })
    expect(onApply).toHaveBeenCalledWith(800, 600)
  })

  it('does not apply an invalid size on Enter', () => {
    const onApply = vi.fn()
    render(
      <ScaleImageDialog
        open
        initialWidth={800}
        initialHeight={600}
        onCancel={vi.fn()}
        onApply={onApply}
      />,
    )
    const horizontal = screen.getByLabelText('Horizontal')
    fireEvent.change(horizontal, { target: { value: '' } })
    fireEvent.keyDown(horizontal, { key: 'Enter' })
    expect(onApply).not.toHaveBeenCalled()
  })
})
