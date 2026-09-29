import { useEffect, useState } from 'react'
import { CANVAS_PRESETS, MAX_CANVAS, MIN_CANVAS } from '../core/palette'

export interface NewCanvasDialogProps {
  open: boolean
  initialWidth: number
  initialHeight: number
  onCancel: () => void
  onCreate: (width: number, height: number) => void
}

function clampSize(value: number): number {
  if (!Number.isFinite(value)) return MIN_CANVAS
  return Math.min(MAX_CANVAS, Math.max(MIN_CANVAS, Math.round(value)))
}

export function NewCanvasDialog({
  open,
  initialWidth,
  initialHeight,
  onCancel,
  onCreate,
}: NewCanvasDialogProps) {
  const [width, setWidth] = useState(initialWidth)
  const [height, setHeight] = useState(initialHeight)

  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onCancel])

  if (!open) return null

  const submit = () => onCreate(clampSize(width), clampSize(height))

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="New image"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="modal-title">New image</h2>

        <div className="preset-list">
          {CANVAS_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="preset-button"
              aria-pressed={width === preset.width && height === preset.height}
              onClick={() => {
                setWidth(preset.width)
                setHeight(preset.height)
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <form
          className="size-form"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
          onKeyDown={(event) => {
            // A form with several fields and no submit button does not submit on
            // Enter, so wire it up explicitly.
            if (event.key === 'Enter') {
              event.preventDefault()
              submit()
            }
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
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
