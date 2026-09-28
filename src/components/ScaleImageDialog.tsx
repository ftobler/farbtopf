import { useEffect, useState } from 'react'
import { MAX_CANVAS, MIN_CANVAS } from '../core/palette'

export interface ScaleImageDialogProps {
  open: boolean
  initialWidth: number
  initialHeight: number
  onCancel: () => void
  onApply: (width: number, height: number) => void
}

function clampSize(value: number): number {
  if (!Number.isFinite(value)) return MIN_CANVAS
  return Math.min(MAX_CANVAS, Math.max(MIN_CANVAS, Math.round(value)))
}

export function ScaleImageDialog({
  open,
  initialWidth,
  initialHeight,
  onCancel,
  onApply,
}: ScaleImageDialogProps) {
  const [width, setWidth] = useState(initialWidth)
  const [height, setHeight] = useState(initialHeight)
  const [wasOpen, setWasOpen] = useState(open)

  if (open && !wasOpen) {
    setWasOpen(true)
    setWidth(initialWidth)
    setHeight(initialHeight)
  } else if (!open && wasOpen) {
    setWasOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onCancel])

  if (!open) return null

  const submit = () => onApply(clampSize(width), clampSize(height))

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Scale image"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="modal-title">Scale image</h2>

        <form
          className="size-form"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <label>
            Width
            <input
              type="number"
              min={MIN_CANVAS}
              max={MAX_CANVAS}
              value={width}
              onChange={(event) => setWidth(Number(event.target.value))}
            />
          </label>
          <label>
            Height
            <input
              type="number"
              min={MIN_CANVAS}
              max={MAX_CANVAS}
              value={height}
              onChange={(event) => setHeight(Number(event.target.value))}
            />
          </label>
        </form>

        <div className="modal-actions">
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="button primary" onClick={submit}>
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
