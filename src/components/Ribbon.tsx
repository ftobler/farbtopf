import type { ComponentType } from 'react'
import type { Rgba } from '../core/color'
import type { SelectionShape } from '../core/selection'
import { BRUSH_SIZES, TOOLS, toolById } from '../core/tools'
import type { ShapeKind } from '../core/shapes'
import type { ShapeFill, ToolId } from '../core/tools'
import { ColorPalette } from './ColorPalette'
import { Dropdown, MenuDivider, MenuItem } from './Dropdown'
import { ShapeGallery } from './ShapeGallery'
import type { IconProps } from './icons'
import {
  AirbrushIcon,
  BrushIcon,
  CopyIcon,
  CropIcon,
  CutIcon,
  EraserIcon,
  FillIcon,
  FlipIcon,
  MagnifierIcon,
  PasteIcon,
  PencilIcon,
  PickerIcon,
  RectangleIcon,
  RotateIcon,
  ScaleIcon,
  SelectIcon,
  TextIcon,
} from './icons'

const TOOL_ICONS: Record<ToolId, ComponentType<IconProps>> = {
  select: SelectIcon,
  pencil: PencilIcon,
  brush: BrushIcon,
  airbrush: AirbrushIcon,
  eraser: EraserIcon,
  fill: FillIcon,
  picker: PickerIcon,
  text: TextIcon,
  shape: RectangleIcon,
  zoom: MagnifierIcon,
}

/** Tools group, in reading order: two rows of three. */
const TOOL_GRID: ToolId[] = ['pencil', 'fill', 'text', 'eraser', 'picker', 'zoom']
const BRUSH_TOOLS: ToolId[] = ['brush', 'airbrush']

const SHAPE_FILL_LABELS: Record<ShapeFill, string> = {
  outline: 'Outline',
  filled: 'Filled',
  'outline-filled': 'Outline + fill',
}

export interface RibbonProps {
  tool: ToolId
  onToolChange: (tool: ToolId) => void
  brushSize: number
  onBrushSizeChange: (size: number) => void
  shapeFill: ShapeFill
  onShapeFillChange: (fill: ShapeFill) => void
  shapeKind: ShapeKind
  onShapeKindChange: (kind: ShapeKind) => void
  hasSelection: boolean
  onCrop: () => void
  onScale: () => void
  onFlip: (axis: 'horizontal' | 'vertical') => void
  onRotate: (degrees: number) => void
  onCustomRotate: () => void
  onPaste: () => void
  onCut: () => void
  onCopy: () => void
  primary: Rgba
  secondary: Rgba
  palette: readonly string[]
  onPrimaryChange: (color: Rgba) => void
  onSecondaryChange: (color: Rgba) => void
  onSwap: () => void
  transparentSelection: boolean
  onTransparentSelectionChange: (value: boolean) => void
  selectionShape: SelectionShape
  onSelectionShapeChange: (shape: SelectionShape) => void
  onSelectAll: () => void
  onInvertSelection: () => void
  onDeleteSelection: () => void
}

export function Ribbon({
  tool,
  onToolChange,
  brushSize,
  onBrushSizeChange,
  shapeFill,
  onShapeFillChange,
  shapeKind,
  onShapeKindChange,
  hasSelection,
  onCrop,
  onScale,
  onFlip,
  onRotate,
  onCustomRotate,
  onPaste,
  onCut,
  onCopy,
  primary,
  secondary,
  palette,
  onPrimaryChange,
  onSecondaryChange,
  onSwap,
  transparentSelection,
  onTransparentSelectionChange,
  selectionShape,
  onSelectionShapeChange,
  onSelectAll,
  onInvertSelection,
  onDeleteSelection,
}: RibbonProps) {
  const utilityTools = TOOL_GRID.map(toolById)
  const brushTools = BRUSH_TOOLS.map(toolById)

  const renderTool = (definition: (typeof TOOLS)[number]) => {
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
  }

  return (
    <div className="ribbon">
      <section className="ribbon-group">
        <div className="ribbon-group-items">
          <button
            type="button"
            className="icon-button icon-button-large"
            title="Copy"
            aria-label="Copy"
            onClick={onCopy}
          >
            <CopyIcon size={28} />
          </button>
          <div className="button-stack">
            <button
              type="button"
              className="icon-button"
              title="Cut"
              aria-label="Cut"
              onClick={onCut}
            >
              <CutIcon size={18} />
            </button>
            <button
              type="button"
              className="icon-button"
              title="Paste from clipboard"
              aria-label="Paste"
              onClick={onPaste}
            >
              <PasteIcon size={18} />
            </button>
          </div>
        </div>
        <div className="ribbon-group-label">Clipboard</div>
      </section>

      <div className="ribbon-separator" />

      <section className="ribbon-group">
        <div className="ribbon-group-items">
          <Dropdown
            title="Select"
            ariaLabel="Select"
            active={tool === 'select'}
            triggerClassName="dropdown-trigger dropdown-trigger-large"
            trigger={<SelectIcon size={28} />}
          >
            {(close) => (
              <>
                <MenuItem
                  checked={tool === 'select' && selectionShape === 'rectangle'}
                  onClick={() => {
                    onSelectionShapeChange('rectangle')
                    onToolChange('select')
                    close()
                  }}
                >
                  Rectangular selection
                </MenuItem>
                <MenuItem
                  checked={tool === 'select' && selectionShape === 'freeform'}
                  onClick={() => {
                    onSelectionShapeChange('freeform')
                    onToolChange('select')
                    close()
                  }}
                >
                  Free-form selection
                </MenuItem>
                <MenuDivider />
                <MenuItem
                  shortcut="Ctrl+A"
                  onClick={() => {
                    onSelectAll()
                    close()
                  }}
                >
                  Select all
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    onInvertSelection()
                    close()
                  }}
                >
                  Invert selection
                </MenuItem>
                <MenuItem
                  checked={transparentSelection}
                  onClick={() => {
                    onTransparentSelectionChange(!transparentSelection)
                    close()
                  }}
                >
                  Transparent selection
                </MenuItem>
                <MenuItem
                  shortcut="Del"
                  disabled={!hasSelection}
                  onClick={() => {
                    onDeleteSelection()
                    close()
                  }}
                >
                  Clear selection
                </MenuItem>
              </>
            )}
          </Dropdown>
        </div>
        <div className="ribbon-group-label">Selection</div>
      </section>

      <div className="ribbon-separator" />

      <section className="ribbon-group">
        <div className="ribbon-group-items button-grid">
          <button
            type="button"
            className="icon-button"
            title="Crop to selection"
            aria-label="Crop"
            disabled={!hasSelection}
            onClick={onCrop}
          >
            <CropIcon size={18} />
          </button>
          <Dropdown title="Rotate" ariaLabel="Rotate" trigger={<RotateIcon size={18} />}>
            {(close) => (
              <>
                <MenuItem
                  onClick={() => {
                    onRotate(90)
                    close()
                  }}
                >
                  Rotate right 90°
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    onRotate(270)
                    close()
                  }}
                >
                  Rotate left 90°
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    onRotate(180)
                    close()
                  }}
                >
                  Rotate 180°
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    onCustomRotate()
                    close()
                  }}
                >
                  Custom rotation…
                </MenuItem>
              </>
            )}
          </Dropdown>
          <button
            type="button"
            className="icon-button"
            title="Scale image"
            aria-label="Scale"
            onClick={onScale}
          >
            <ScaleIcon size={18} />
          </button>
          <Dropdown title="Flip" ariaLabel="Flip" trigger={<FlipIcon size={18} />}>
            {(close) => (
              <>
                <MenuItem
                  onClick={() => {
                    onFlip('horizontal')
                    close()
                  }}
                >
                  Flip horizontal
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    onFlip('vertical')
                    close()
                  }}
                >
                  Flip vertical
                </MenuItem>
              </>
            )}
          </Dropdown>
        </div>
        <div className="ribbon-group-label">Image</div>
      </section>

      <div className="ribbon-separator" />

      <section className="ribbon-group">
        <div className="ribbon-group-items button-grid tool-grid">{utilityTools.map(renderTool)}</div>
        <div className="ribbon-group-label">Tools</div>
      </section>

      <div className="ribbon-separator" />

      <section className="ribbon-group">
        <div className="ribbon-group-items">
          <div className="button-stack">{brushTools.map(renderTool)}</div>
        </div>
        <div className="ribbon-group-label">Brushes</div>
      </section>

      <div className="ribbon-separator" />

      <section className="ribbon-group">
        <div className="ribbon-group-items">
          <ShapeGallery
            active={tool === 'shape' ? shapeKind : null}
            onSelect={(kind) => {
              onShapeKindChange(kind)
              onToolChange('shape')
            }}
          />
          <div className="shape-options">
            <Dropdown
              title="Outline size"
              ariaLabel="Size"
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
            <Dropdown
              title="Fill"
              ariaLabel="Fill"
              trigger={<span>{SHAPE_FILL_LABELS[shapeFill]}</span>}
            >
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
          </div>
        </div>
        <div className="ribbon-group-label">Shapes</div>
      </section>

      <div className="ribbon-separator" />

      <section className="ribbon-group">
        <div className="ribbon-group-items">
          <ColorPalette
            primary={primary}
            secondary={secondary}
            palette={palette}
            onPrimaryChange={onPrimaryChange}
            onSecondaryChange={onSecondaryChange}
            onSwap={onSwap}
          />
        </div>
        <div className="ribbon-group-label">Colors</div>
      </section>
    </div>
  )
}
