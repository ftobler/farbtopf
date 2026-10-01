import { useEffect, useRef, useState } from 'react'
import { MAX_CANVAS } from '../core/palette'
import { useModalFocus } from '../hooks/useModalFocus'

export interface CanvasSizeDialogProps {
  open: boolean
  initialWidth: number
  initialHeight: number
  onCancel: () => void
  onApply: (width: number, height: number) => void
}

/** Like scaling, a resized canvas may be as small as one pixel. */
const MIN_SIZE = 1

/** The whole-pixel size typed into a field, or null when it is out of range. */
function parseSize(text: string): number | null {
  if (text.trim() === '') return null
  const value = Math.round(Number(text))
  return Number.isFinite(value) && value >= MIN_SIZE && value <= MAX_CANVAS ? value : null
}

/** Sets the canvas size in pixels without scaling; content stays anchored top-left. */
export function CanvasSizeDialog({ open, initialWidth, initialHeight, onCancel, onApply }: CanvasSizeDialogProps) {
  const [widthText, setWidthText] = useState(String(initialWidth))
  const [heightText, setHeightText] = useState(String(initialHeight))
  const modalRef = useRef<HTMLDivElement>(null)

  useModalFocus(open, modalRef)

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

  const width = parseSize(widthText)
  const height = parseSize(heightText)
  const valid = width !== null && height !== null

  const submit = () => {
    if (width !== null && height !== null) onApply(width, height)
  }

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Canvas size"
        ref={modalRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="modal-title">Canvas size</h2>

        <form
          className="size-form stacked"
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
            <span className="unit-input">
              <input
                type="number"
                min={MIN_SIZE}
                max={MAX_CANVAS}
                aria-label="Width"
                value={widthText}
                autoFocus
                onChange={(event) => setWidthText(event.target.value)}
              />
              <span aria-hidden="true">px</span>
            </span>
          </label>
          <label>
            Height
            <span className="unit-input">
              <input
                type="number"
                min={MIN_SIZE}
                max={MAX_CANVAS}
                aria-label="Height"
                value={heightText}
                onChange={(event) => setHeightText(event.target.value)}
              />
              <span aria-hidden="true">px</span>
            </span>
          </label>
        </form>

        <div className="scale-options">
          <span className="scale-result">
            {valid ? 'Content stays anchored top-left' : `Enter ${MIN_SIZE}–${MAX_CANVAS} px`}
          </span>
        </div>

        <div className="modal-actions">
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="button primary" disabled={!valid} onClick={submit}>
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
