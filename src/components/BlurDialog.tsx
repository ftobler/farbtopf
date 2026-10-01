import { useEffect, useState } from 'react'
import { BLUR_RADIUS_MAX, BLUR_RADIUS_MIN, blurSigma } from '../core/blur'

export interface BlurDialogProps {
  open: boolean
  /** "Blur selection" or "Blur image", depending on what will be blurred. */
  title: string
  initialRadius: number
  onCancel: () => void
  onApply: (radius: number) => void
}

function parseRadius(text: string): number | null {
  if (text.trim() === '') return null
  const value = Number(text)
  if (!Number.isFinite(value) || value < BLUR_RADIUS_MIN || value > BLUR_RADIUS_MAX) return null
  return value
}

/** Asks for a Gaussian blur radius in pixels. */
export function BlurDialog({ open, title, initialRadius, onCancel, onApply }: BlurDialogProps) {
  const [text, setText] = useState(String(initialRadius))
  const [wasOpen, setWasOpen] = useState(open)

  if (open && !wasOpen) {
    setWasOpen(true)
    setText(String(initialRadius))
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

  const radius = parseRadius(text)
  const submit = () => {
    if (radius !== null) onApply(radius)
  }

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="modal-title">{title}</h2>

        <form
          className="size-form"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <label>
            Radius (px)
            <input
              type="number"
              min={BLUR_RADIUS_MIN}
              max={BLUR_RADIUS_MAX}
              step="any"
              value={text}
              aria-invalid={radius === null}
              autoFocus
              onChange={(event) => setText(event.target.value)}
            />
          </label>
        </form>
        <p className="scale-result blur-range">
          {radius === null
            ? `Enter a radius from ${BLUR_RADIUS_MIN} to ${BLUR_RADIUS_MAX} px`
            : `Gaussian blur, σ = ${blurSigma(radius)} px`}
        </p>

        <div className="modal-actions">
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="button primary" disabled={radius === null} onClick={submit}>
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
