import type { ComponentType } from 'react'
import { BRUSH_SIZES, TOOLS, isShapeTool } from '../core/tools'
import type { ShapeFill, ToolId } from '../core/tools'
import { Dropdown, MenuItem } from './Dropdown'
import type { IconProps } from './icons'
import {
  AirbrushIcon,
  BrushIcon,
  EllipseIcon,
  EraserIcon,
  FillIcon,
  GridIcon,
  LineIcon,
  PencilIcon,
  PickerIcon,
  RectangleIcon,
  RedoIcon,
  TextIcon,
  TrashIcon,
  UndoIcon,
} from './icons'

const TOOL_ICONS: Record<ToolId, ComponentType<IconProps>> = {
  pencil: PencilIcon,
  brush: BrushIcon,
  airbrush: AirbrushIcon,
  eraser: EraserIcon,
  fill: FillIcon,
  picker: PickerIcon,
  text: TextIcon,
  line: LineIcon,
  rectangle: RectangleIcon,
  ellipse: EllipseIcon,
}

const SHAPE_FILL_LABELS: Record<ShapeFill, string> = {
  outline: 'Outline',
  filled: 'Filled',
  'outline-filled': 'Outline + fill',
}

export interface ToolBarProps {
  tool: ToolId
  onToolChange: (tool: ToolId) => void
  brushSize: number
  onBrushSizeChange: (size: number) => void
  shapeFill: ShapeFill
  onShapeFillChange: (fill: ShapeFill) => void
  showGrid: boolean
  onToggleGrid: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
}

export function ToolBar({
  tool,
  onToolChange,
  brushSize,
  onBrushSizeChange,
  shapeFill,
  onShapeFillChange,
  showGrid,
  onToggleGrid,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
}: ToolBarProps) {
  return (
    <div className="toolbar">
      <div className="tool-group">
        <button
          type="button"
          className="icon-button"
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
          disabled={!canUndo}
          onClick={onUndo}
        >
          <UndoIcon size={18} />
        </button>
        <button
          type="button"
          className="icon-button"
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
          disabled={!canRedo}
          onClick={onRedo}
        >
          <RedoIcon size={18} />
        </button>
        <button
          type="button"
          className="icon-button"
          title="Clear canvas"
          aria-label="Clear canvas"
          onClick={onClear}
        >
          <TrashIcon size={18} />
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="tool-group">
        {TOOLS.map((definition) => {
          const Icon = TOOL_ICONS[definition.id]
          return (
            <button
              key={definition.id}
              type="button"
              className="icon-button"
              title={`${definition.label} (${definition.shortcut})`}
              aria-label={definition.label}
              aria-pressed={tool === definition.id}
              onClick={() => onToolChange(definition.id)}
            >
              <Icon size={18} />
            </button>
          )
        })}
      </div>

      <div className="toolbar-divider" />

      <div className="tool-group">
        <Dropdown
          title="Brush size"
          trigger={
            <span className="size-preview" aria-hidden="true">
              <span
                className="size-dot"
                style={{ width: Math.min(brushSize, 24), height: Math.min(brushSize, 24) }}
              />
            </span>
          }
        >
          {(close) => (
            <div className="size-menu">
              {BRUSH_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  className="size-option"
                  aria-pressed={size === brushSize}
                  onClick={() => {
                    onBrushSizeChange(size)
                    close()
                  }}
                >
                  <span className="size-line" style={{ height: Math.max(1, size) }} />
                </button>
              ))}
            </div>
          )}
        </Dropdown>

        {isShapeTool(tool) ? (
          <Dropdown title="Shape style" trigger={<span>{SHAPE_FILL_LABELS[shapeFill]}</span>}>
            {(close) => (
              <>
                {(Object.keys(SHAPE_FILL_LABELS) as ShapeFill[]).map((fill) => (
                  <MenuItem
                    key={fill}
                    checked={fill === shapeFill}
                    onClick={() => {
                      onShapeFillChange(fill)
                      close()
                    }}
                  >
                    {SHAPE_FILL_LABELS[fill]}
                  </MenuItem>
                ))}
              </>
            )}
          </Dropdown>
        ) : null}
      </div>

      <div className="toolbar-spacer" />

      <div className="tool-group">
        <button
          type="button"
          className="icon-button"
          title="Pixel grid (G)"
          aria-label="Toggle pixel grid"
          aria-pressed={showGrid}
          onClick={onToggleGrid}
        >
          <GridIcon size={18} />
        </button>
      </div>
    </div>
  )
}
