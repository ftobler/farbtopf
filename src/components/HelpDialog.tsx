export interface HelpDialogProps {
  open: boolean
  onClose: () => void
}

const SHORTCUTS: Array<[string, string]> = [
  ['P', 'Pencil'],
  ['B', 'Brush'],
  ['A', 'Airbrush'],
  ['E', 'Eraser'],
  ['F', 'Fill with color'],
  ['K', 'Color picker'],
  ['T', 'Text'],
  ['L', 'Line'],
  ['R', 'Rectangle'],
  ['O', 'Ellipse'],
  ['[ / ]', 'Decrease / increase brush size'],
  ['X', 'Swap primary and secondary colors'],
  ['G', 'Toggle pixel grid'],
  ['+ / -', 'Zoom in / out'],
  ['Ctrl+Z', 'Undo'],
  ['Ctrl+Y', 'Redo'],
  ['Ctrl+N', 'New image'],
  ['Ctrl+O', 'Open image'],
  ['Ctrl+S', 'Save as PNG'],
  ['Right-click', 'Draw with the secondary color'],
]

export function HelpDialog({ open, onClose }: HelpDialogProps) {
  if (!open) return null
  return (
    <div className="modal-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="modal-title">Keyboard shortcuts</h2>
        <ul className="shortcut-list">
          {SHORTCUTS.map(([keys, description]) => (
            <li key={keys}>
              <kbd>{keys}</kbd>
              <span>{description}</span>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button type="button" className="button primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
