import { useEffect, useState } from 'react'

export interface RotateDialogProps {
  open: boolean
  initialDegrees: number
  onCancel: () => void
  onApply: (degrees: number) => void
}

function parseDegrees(text: string): number | null {
  if (text.trim() === '') return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

export function RotateDialog({ open, initialDegrees, onCancel, onApply }: RotateDialogProps) {
  const [text, setText] = useState(String(initialDegrees))
  const [wasOpen, setWasOpen] = useState(open)

  if (open && !wasOpen) {
    setWasOpen(true)
    setText(String(initialDegrees))
  } else if (!open && wasOpen) {
    setWasOpen(false)
  }

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

  const degrees = parseDegrees(text)
  const submit = () => {
    if (degrees !== null) onApply(degrees)
  }

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Rotate"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="modal-title">Rotate</h2>

        <form
          className="size-form"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <label>
            Degrees (clockwise)
            <input
              type="number"
              step="any"
              value={text}
              autoFocus
              onChange={(event) => setText(event.target.value)}
            />
          </label>
        </form>

        <div className="modal-actions">
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="button primary"
            disabled={degrees === null}
            onClick={submit}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
