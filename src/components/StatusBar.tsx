import type { Point } from '../core/geometry'

export interface StatusBarProps {
  cursor: Point | null
  width: number
  height: number
  zoom: number
  toolLabel: string
}

export function StatusBar({ cursor, width, height, zoom, toolLabel }: StatusBarProps) {
  return (
    <footer className="statusbar">
      <span className="status-item status-coords">
        {cursor ? `${cursor.x}, ${cursor.y} px` : '—'}
      </span>
      <span className="status-item">
        {width} × {height} px
      </span>
      <span className="status-item">{Math.round(zoom * 100)}%</span>
      <span className="status-spacer" />
      <span className="status-item">{toolLabel}</span>
    </footer>
  )
}
