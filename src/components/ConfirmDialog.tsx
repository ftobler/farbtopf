import { useEffect } from 'react'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({ open, title, message, confirmLabel, onCancel, onConfirm }: ConfirmDialogProps) {
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
        <p className="confirm-message">{message}</p>

        <div className="modal-actions">
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="button primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
