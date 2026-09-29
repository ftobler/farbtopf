import { useEffect, useRef, useState } from 'react'
import type { Bitmap } from '../core/bitmap'
import { THUMBNAIL_SIZE } from '../core/layers'
import type { LayerInfo } from '../core/layers'
import { ChevronIcon, PlusIcon, TrashIcon } from './icons'

export interface LayersPanelProps {
  /** The layer stack, bottom first. */
  layers: LayerInfo[]
  active: number
  onSelect: (index: number) => void
  onAdd: () => void
  onDelete: (index: number) => void
  onMove: (from: number, to: number) => void
}

function Thumbnail({ bitmap }: { bitmap: Bitmap }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    canvasRef.current?.getContext('2d')?.putImageData(bitmap.toImageData(), 0, 0)
  }, [bitmap])

  // Shown with its longer edge at the thumbnail size, however small the document is.
  const factor = THUMBNAIL_SIZE / Math.max(bitmap.width, bitmap.height)
  return (
    <canvas
      ref={canvasRef}
      className="layers-thumbnail"
      width={bitmap.width}
      height={bitmap.height}
      style={{ width: bitmap.width * factor, height: bitmap.height * factor }}
      aria-hidden="true"
    />
  )
}

/** A translucent sidebar over the workspace listing the layers, top-most first. */
export function LayersPanel({ layers, active, onSelect, onAdd, onDelete, onMove }: LayersPanelProps) {
  const [dragging, setDragging] = useState<number | null>(null)
  const top = layers.length - 1

  return (
    <aside className="layers-panel" aria-label="Layers panel">
      <ul className="layers-list" role="listbox" aria-label="Layers">
        {layers
          .map((layer, index) => ({ layer, index }))
          .reverse()
          .map(({ layer, index }) => (
            <li
              key={layer.id}
              role="option"
              aria-selected={index === active}
              aria-label={layer.name}
              title={layer.name}
              className={`layers-item${index === active ? ' active' : ''}${index === dragging ? ' dragging' : ''}`}
              draggable
              onClick={() => onSelect(index)}
              onDragStart={(event) => {
                event.dataTransfer?.setData('text/plain', layer.name)
                setDragging(index)
              }}
              onDragOver={(event) => {
                if (dragging !== null) event.preventDefault()
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (dragging !== null && dragging !== index) onMove(dragging, index)
                setDragging(null)
              }}
              onDragEnd={() => setDragging(null)}
            >
              <Thumbnail bitmap={layer.thumbnail} />
            </li>
          ))}
      </ul>
      <div className="layers-actions">
        <button type="button" className="icon-button" title="New layer" aria-label="New layer" onClick={onAdd}>
          <PlusIcon size={16} />
        </button>
        <button
          type="button"
          className="icon-button"
          title="Move layer up"
          aria-label="Move layer up"
          disabled={active >= top}
          onClick={() => onMove(active, active + 1)}
        >
          <ChevronIcon size={16} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <button
          type="button"
          className="icon-button"
          title="Move layer down"
          aria-label="Move layer down"
          disabled={active <= 0}
          onClick={() => onMove(active, active - 1)}
        >
          <ChevronIcon size={16} />
        </button>
        <button
          type="button"
          className="icon-button"
          title="Delete layer"
          aria-label="Delete layer"
          disabled={layers.length < 2}
          onClick={() => onDelete(active)}
        >
          <TrashIcon size={16} />
        </button>
      </div>
    </aside>
  )
}
