import { useEffect, useState } from 'react'
import { MAX_CANVAS } from '../core/palette'

export interface ScaleImageDialogProps {
  open: boolean
  initialWidth: number
  initialHeight: number
  /** Dialog heading; "Scale selection" when only the selection is scaled. */
  title?: string
  onCancel: () => void
  onApply: (width: number, height: number) => void
}

type ScaleUnit = 'percent' | 'pixels'

/** Scaling may go as small as one pixel, unlike a brand-new canvas. */
const MIN_SCALE = 1

function clampSize(value: number): number {
  if (!Number.isFinite(value)) return MIN_SCALE
  return Math.min(MAX_CANVAS, Math.max(MIN_SCALE, Math.round(value)))
}

function parsePositive(text: string): number | null {
  if (text.trim() === '') return null
  const value = Number(text)
  return Number.isFinite(value) && value > 0 ? value : null
}

function formatPercent(value: number): string {
  return String(Math.round(value * 100) / 100)
}

function toPixels(text: string, unit: ScaleUnit, original: number): number | null {
  const value = parsePositive(text)
  if (value === null) return null
  return clampSize(unit === 'percent' ? (original * value) / 100 : value)
}

export function ScaleImageDialog({
  open,
  initialWidth,
  initialHeight,
  title = 'Scale image',
  onCancel,
  onApply,
}: ScaleImageDialogProps) {
  const [unit, setUnit] = useState<ScaleUnit>('percent')
  const [keepRatio, setKeepRatio] = useState(true)
  const [horizontal, setHorizontal] = useState('100')
  const [vertical, setVertical] = useState('100')
  const [wasOpen, setWasOpen] = useState(open)

  if (open && !wasOpen) {
    setWasOpen(true)
    setUnit('percent')
    setKeepRatio(true)
    setHorizontal('100')
    setVertical('100')
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

  const width = toPixels(horizontal, unit, initialWidth)
  const height = toPixels(vertical, unit, initialHeight)
  const valid = width !== null && height !== null

  const submit = () => {
    if (width !== null && height !== null) onApply(width, height)
  }

  // With the ratio locked, percentages move together and pixel sizes follow
  // the original image's proportions.
  const linked = (value: number, text: string, from: number, to: number, target: ScaleUnit = unit): string =>
    target === 'percent' ? text : String(Math.max(1, Math.round((value * to) / from)))

  const changeHorizontal = (text: string) => {
    setHorizontal(text)
    const value = parsePositive(text)
    if (keepRatio && value !== null) setVertical(linked(value, text, initialWidth, initialHeight))
  }

  const changeVertical = (text: string) => {
    setVertical(text)
    const value = parsePositive(text)
    if (keepRatio && value !== null) setHorizontal(linked(value, text, initialHeight, initialWidth))
  }

  const switchUnit = (next: ScaleUnit) => {
    if (next === unit) return
    const convert = (text: string, original: number): string => {
      const value = parsePositive(text)
      if (value === null) return ''
      return next === 'pixels'
        ? String(Math.max(1, Math.round((original * value) / 100)))
        : formatPercent((value / original) * 100)
    }
    const nextHorizontal = convert(horizontal, initialWidth)
    setHorizontal(nextHorizontal)
    const value = parsePositive(nextHorizontal)
    // Re-derive the locked axis in the new unit so rounding doesn't let the
    // two fields drift apart.
    if (keepRatio && value !== null) {
      setVertical(linked(value, nextHorizontal, initialWidth, initialHeight, next))
    } else {
      setVertical(convert(vertical, initialHeight))
    }
    setUnit(next)
  }

  const suffix = unit === 'percent' ? '%' : 'px'

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

        <div className="preset-list" role="group" aria-label="Scale by">
          <button
            type="button"
            className="preset-button"
            aria-pressed={unit === 'percent'}
            onClick={() => switchUnit('percent')}
          >
            Percentage
          </button>
          <button
            type="button"
            className="preset-button"
            aria-pressed={unit === 'pixels'}
            onClick={() => switchUnit('pixels')}
          >
            Pixels
          </button>
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
            Horizontal
            <span className="unit-input">
              <input
                type="number"
                min={1}
                step="any"
                aria-label="Horizontal"
                value={horizontal}
                autoFocus
                onChange={(event) => changeHorizontal(event.target.value)}
              />
              <span aria-hidden="true">{suffix}</span>
            </span>
          </label>
          <label>
            Vertical
            <span className="unit-input">
              <input
                type="number"
                min={1}
                step="any"
                aria-label="Vertical"
                value={vertical}
                onChange={(event) => changeVertical(event.target.value)}
              />
              <span aria-hidden="true">{suffix}</span>
            </span>
          </label>
        </form>

        <div className="scale-options">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={keepRatio}
              onChange={(event) => setKeepRatio(event.target.checked)}
            />
            Maintain aspect ratio
          </label>
          <span className="scale-result">{valid ? `${width} × ${height} px` : 'Invalid size'}</span>
        </div>

        <div className="modal-actions">
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="button primary" disabled={!valid} onClick={submit}>
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
