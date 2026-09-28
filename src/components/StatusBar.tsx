import type { Point } from '../core/geometry'
import { ZOOM_LEVELS, nearestZoomIndex, nextZoom } from '../core/zoom'
import { GridIcon, ZoomInIcon, ZoomOutIcon } from './icons'

export interface StatusBarProps {
  cursor: Point | null
  width: number
  height: number
  zoom: number
  toolLabel: string
  showGrid: boolean
  onToggleGrid: () => void
  onZoomChange: (zoom: number) => void
}

export function StatusBar({
  cursor,
  width,
  height,
  zoom,
  toolLabel,
  showGrid,
  onToggleGrid,
  onZoomChange,
}: StatusBarProps) {
  return (
    <footer className="statusbar">
      <span className="status-item status-coords">
        {cursor ? `${cursor.x}, ${cursor.y} px` : '—'}
      </span>
      <span className="status-item">
        {width} × {height} px
      </span>
      <button
        type="button"
        className="icon-button"
        title="Pixel grid (G)"
        aria-label="Toggle pixel grid"
        aria-pressed={showGrid}
        onClick={onToggleGrid}
      >
        <GridIcon size={16} />
      </button>
      <span className="status-spacer" />
      <span className="status-item">{toolLabel}</span>
      <div className="zoom-control">
        <button
          type="button"
          className="icon-button"
          title="Zoom out (-)"
          aria-label="Zoom out"
          onClick={() => onZoomChange(nextZoom(zoom, -1))}
        >
          <ZoomOutIcon size={16} />
        </button>
        <input
          type="range"
          className="zoom-slider"
          aria-label="Zoom"
          min={0}
          max={ZOOM_LEVELS.length - 1}
          step={1}
          value={nearestZoomIndex(zoom)}
          onChange={(event) => onZoomChange(ZOOM_LEVELS[Number(event.target.value)])}
        />
        <button
          type="button"
          className="icon-button"
          title="Zoom in (+)"
          aria-label="Zoom in"
          onClick={() => onZoomChange(nextZoom(zoom, 1))}
        >
          <ZoomInIcon size={16} />
        </button>
        <button
          type="button"
          className="zoom-label"
          title="Reset zoom to 100%"
          onClick={() => onZoomChange(1)}
        >
          {Math.round(zoom * 100)}%
        </button>
      </div>
    </footer>
  )
}
