import { SHAPES, shapeIconPath } from '../core/shapes'
import type { ShapeKind } from '../core/shapes'

export interface ShapeGalleryProps {
  /** The highlighted shape, or null when the shape tool is not active. */
  active: ShapeKind | null
  onSelect: (kind: ShapeKind) => void
}

export function ShapeGallery({ active, onSelect }: ShapeGalleryProps) {
  return (
    <div className="shape-gallery">
      {SHAPES.map((shape) => (
        <button
          key={shape.id}
          type="button"
          className="shape-gallery-button"
          title={shape.label}
          aria-label={shape.label}
          aria-pressed={active === shape.id}
          onClick={() => onSelect(shape.id)}
        >
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={shapeIconPath(shape.id, 24)} />
          </svg>
        </button>
      ))}
    </div>
  )
}
