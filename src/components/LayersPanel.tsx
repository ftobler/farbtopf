import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Bitmap } from '../core/bitmap'
import { THUMBNAIL_SIZE } from '../core/layers'
import type { LayerInfo } from '../core/layers'
import { ContextMenu } from './ContextMenu'
import { MenuItem } from './Dropdown'
import { PlusIcon, TrashIcon } from './icons'

export interface LayersPanelProps {
  /** The layer stack, bottom first. */
  layers: LayerInfo[]
  active: number
  onSelect: (index: number) => void
  onAdd: () => void
  onDelete: (index: number) => void
  onMove: (from: number, to: number) => void
}

/** The on-screen size of a layer tile: its longer edge at the thumbnail size. */
function tileSize(bitmap: Bitmap | undefined): { width: number; height: number } {
  if (!bitmap) return { width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE }
  const factor = THUMBNAIL_SIZE / Math.max(bitmap.width, bitmap.height)
  return { width: bitmap.width * factor, height: bitmap.height * factor }
}

function Thumbnail({ bitmap }: { bitmap: Bitmap }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    canvasRef.current?.getContext('2d')?.putImageData(bitmap.toImageData(), 0, 0)
  }, [bitmap])

  return (
    <canvas
      ref={canvasRef}
      className="layers-thumbnail"
      width={bitmap.width}
      height={bitmap.height}
      style={tileSize(bitmap)}
      aria-hidden="true"
    />
  )
}

/**
 * A translucent sidebar over the workspace listing the layers, top-most first. Layers are
 * re-ordered by dragging and deleted with the Delete key or from their right-click menu.
 */
export function LayersPanel({ layers, active, onSelect, onAdd, onDelete, onMove }: LayersPanelProps) {
  const [dragging, setDragging] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; index: number } | null>(null)
  const canDelete = layers.length > 1

  return (
    <aside
      className="layers-panel"
      aria-label="Layers panel"
      onContextMenu={(event) => {
        // The panel sits inside the workspace; keep the canvas context menu from opening too.
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <ul className="layers-list" role="listbox" aria-label="Layers">
        <li className="layers-add-item" role="presentation">
          <button
            type="button"
            className="layers-add"
            title="New layer"
            aria-label="New layer"
            style={tileSize(layers[0]?.thumbnail)}
            onClick={onAdd}
          >
            <PlusIcon size={22} />
          </button>
        </li>
        {layers
          .map((layer, index) => ({ layer, index }))
          .reverse()
          .map(({ layer, index }) => (
            <li
              key={layer.id}
              role="option"
              tabIndex={0}
              aria-selected={index === active}
              aria-label={layer.name}
              title={layer.name}
              className={`layers-item${index === active ? ' active' : ''}${index === dragging ? ' dragging' : ''}`}
              draggable
              onClick={() => onSelect(index)}
              onKeyDown={(event) => {
                if (event.key !== 'Delete' && event.key !== 'Backspace') return
                // Keeps the workspace's own Delete shortcut from also clearing the image selection.
                event.preventDefault()
                event.stopPropagation()
                if (canDelete) onDelete(index)
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                onSelect(index)
                setMenu({ x: event.clientX, y: event.clientY, index })
              }}
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
      {menu
        ? // Portalled: the panel's transform would otherwise become the fixed menu's frame.
          createPortal(
            <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
              {(close) => (
                <MenuItem
                  icon={<TrashIcon size={16} />}
                  shortcut="Del"
                  disabled={!canDelete}
                  onClick={() => {
                    onDelete(menu.index)
                    close()
                  }}
                >
                  Delete layer
                </MenuItem>
              )}
            </ContextMenu>,
            document.body,
          )
        : null}
    </aside>
  )
}
