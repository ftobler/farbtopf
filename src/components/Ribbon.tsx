import type { ComponentType } from 'react'
import { BRUSHES } from '../core/brushes'
import type { BrushId } from '../core/brushes'
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
  BlurIcon,
  CalligraphyIcon,
  SprayCanIcon,
  PixelateIcon,
  BrushIcon,
  CopyIcon,
  CropIcon,
  CutIcon,
  EraserIcon,
  FillIcon,
  FilledShapeIcon,
  FlipIcon,
  FlipVerticalIcon,
  InvertSelectionIcon,
  LayersIcon,
  MagnifierIcon,
  OutlineFilledIcon,
  OutlineShapeIcon,
  PasteIcon,
  PencilIcon,
  PickerIcon,
  RectangleIcon,
  Rotate180Icon,
  RotateIcon,
  RotateLeftIcon,
  RotateRightIcon,
  RoundBrushIcon,
  ScaleIcon,
  SelectAllIcon,
  SelectIcon,
  SmudgeIcon,
  SoftBrushIcon,
  StrokeSizeIcon,
  StrokeSizePreview,
  FreeformSelectIcon,
  HighlighterIcon,
  LiquifyIcon,
  TextIcon,
  TransparentSelectionIcon,
  TrashIcon,
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
/** Icons for every brush in the brushes menu. */
const BRUSH_ICONS: Record<BrushId, ComponentType<IconProps>> = {
  round: RoundBrushIcon,
  soft: SoftBrushIcon,
  natural: BrushIcon,
  calligraphy: CalligraphyIcon,
  highlighter: HighlighterIcon,
  spray: SprayCanIcon,
  pixelate: PixelateIcon,
  blur: BlurIcon,
  smudge: SmudgeIcon,
  liquify: LiquifyIcon,
}

const TOOL_GRID: ToolId[] = ['pencil', 'fill', 'text', 'eraser', 'picker', 'zoom']

const SHAPE_FILL_LABELS: Record<ShapeFill, string> = {
  outline: 'Outline',
  filled: 'Filled',
  'outline-filled': 'Outline + fill',
}

const SHAPE_FILL_ICONS: Record<ShapeFill, ComponentType<IconProps>> = {
  outline: OutlineShapeIcon,
  filled: FilledShapeIcon,
  'outline-filled': OutlineFilledIcon,
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
  /** Repeated by the rotate and flip icons; the arrows open the menus. */
  lastRotation: number
  lastFlip: 'horizontal' | 'vertical'
  onCustomRotate: () => void
  onPaste: () => void
  onCut: () => void
  onCopy: () => void
  primary: Rgba
  secondary: Rgba
  palette: readonly string[]
  customColors: readonly string[]
  onPrimaryChange: (color: Rgba) => void
  onSecondaryChange: (color: Rgba) => void
  onSwap: () => void
  onAddCustomColor: (color: Rgba) => void
  onRemoveCustomColor: (hex: string) => void
  showLayers: boolean
  onToggleLayers: () => void
  transparentSelection: boolean
  onTransparentSelectionChange: (value: boolean) => void
  selectionShape: SelectionShape
  onSelectionShapeChange: (shape: SelectionShape) => void
  onSelectAll: () => void
  onInvertSelection: () => void
  onDeleteSelection: () => void
  brush: BrushId
  onBrushChange: (brush: BrushId) => void
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
  lastRotation,
  lastFlip,
  onCustomRotate,
  onPaste,
  onCut,
  onCopy,
  primary,
  secondary,
  palette,
  customColors,
  onPrimaryChange,
  onSecondaryChange,
  onSwap,
  onAddCustomColor,
  onRemoveCustomColor,
  showLayers,
  onToggleLayers,
  transparentSelection,
  onTransparentSelectionChange,
  selectionShape,
  onSelectionShapeChange,
  onSelectAll,
  onInvertSelection,
  onDeleteSelection,
  brush,
  onBrushChange,
}: RibbonProps) {
  const utilityTools = TOOL_GRID.map(toolById)
  const ShapeFillIcon = SHAPE_FILL_ICONS[shapeFill]

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
            trigger={selectionShape === 'freeform' ? <FreeformSelectIcon size={28} /> : <SelectIcon size={28} />}
            onAction={() => onToolChange('select')}
          >
            {(close) => (
              <>
                <MenuItem
                  icon={<SelectIcon size={16} />}
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
                  icon={<FreeformSelectIcon size={16} />}
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
                  icon={<SelectAllIcon size={16} />}
                  shortcut="Ctrl+A"
                  onClick={() => {
                    onSelectAll()
                    close()
                  }}
                >
                  Select all
                </MenuItem>
                <MenuItem
                  icon={<InvertSelectionIcon size={16} />}
                  onClick={() => {
                    onInvertSelection()
                    close()
                  }}
                >
                  Invert selection
                </MenuItem>
                <MenuItem
                  icon={<TransparentSelectionIcon size={16} />}
                  checked={transparentSelection}
                  onClick={() => {
                    onTransparentSelectionChange(!transparentSelection)
                    close()
                  }}
                >
                  Transparent selection
                </MenuItem>
                <MenuItem
                  icon={<TrashIcon size={16} />}
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
          <Dropdown
            title="Rotate"
            ariaLabel="Rotate"
            trigger={<RotateIcon size={18} />}
            onAction={() => onRotate(lastRotation)}
          >
            {(close) => (
              <>
                <MenuItem
                  icon={<RotateRightIcon size={16} />}
                  onClick={() => {
                    onRotate(90)
                    close()
                  }}
                >
                  Rotate right 90°
                </MenuItem>
                <MenuItem
                  icon={<RotateLeftIcon size={16} />}
                  onClick={() => {
                    onRotate(270)
                    close()
                  }}
                >
                  Rotate left 90°
                </MenuItem>
                <MenuItem
                  icon={<Rotate180Icon size={16} />}
                  onClick={() => {
                    onRotate(180)
                    close()
                  }}
                >
                  Rotate 180°
                </MenuItem>
                <MenuItem
                  icon={<RotateIcon size={16} />}
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
          <Dropdown
            title="Flip"
            ariaLabel="Flip"
            trigger={<FlipIcon size={18} />}
            onAction={() => onFlip(lastFlip)}
          >
            {(close) => (
              <>
                <MenuItem
                  icon={<FlipIcon size={16} />}
                  onClick={() => {
                    onFlip('horizontal')
                    close()
                  }}
                >
                  Flip horizontal
                </MenuItem>
                <MenuItem
                  icon={<FlipVerticalIcon size={16} />}
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
          <Dropdown
            title="Brush"
            ariaLabel="Brush"
            active={tool === 'brush'}
            triggerClassName="dropdown-trigger dropdown-trigger-large"
            trigger={<BrushIcon size={28} />}
            onAction={() => onToolChange('brush')}
          >
            {(close) => (
              <>
                {BRUSHES.map((entry) => {
                  const EntryIcon = BRUSH_ICONS[entry.id]
                  return (
                    <MenuItem
                      key={entry.id}
                      icon={<EntryIcon size={16} />}
                      checked={tool === 'brush' && brush === entry.id}
                      onClick={() => {
                        onBrushChange(entry.id)
                        onToolChange('brush')
                        close()
                      }}
                    >
                      {entry.label}
                    </MenuItem>
                  )
                })}
              </>
            )}
          </Dropdown>
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
            {/* The "sine wave button": stroke size dropdown, its icon and every option drawn as a sine wave. */}
            <Dropdown
              title="Stroke size"
              ariaLabel="Size"
              triggerClassName="dropdown-trigger shape-option-trigger"
              trigger={<StrokeSizeIcon size={18} />}
            >
              {(close) => (
                <div className="size-menu" style={{ display: 'flex', flexDirection: 'column' }}>
                  {/* The presets only set the size; any other current size (from the slider) is shown on top. */}
                  {(BRUSH_SIZES as readonly number[]).includes(brushSize) ? null : (
                    <div className="size-current" title="Current size">
                      {brushSize} px
                    </div>
                  )}
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
                      <StrokeSizePreview size={size} />
                      <span className="size-label">{size} px</span>
                    </button>
                  ))}
                </div>
              )}
            </Dropdown>
            <Dropdown
              title="Fill"
              ariaLabel="Fill"
              triggerClassName="dropdown-trigger shape-option-trigger"
              /* A 36px wide slot like the wave icon's, the square glyph centred in it, so both triggers match. */
              trigger={<ShapeFillIcon size={18} width={36} />}
            >
              {(close) => (
                <>
                  {(Object.keys(SHAPE_FILL_LABELS) as ShapeFill[]).map((fill) => {
                    const FillIcon = SHAPE_FILL_ICONS[fill]
                    return (
                      <MenuItem
                        key={fill}
                        icon={<FillIcon size={16} />}
                        checked={fill === shapeFill}
                        onClick={() => {
                          onShapeFillChange(fill)
                          close()
                        }}
                      >
                        {SHAPE_FILL_LABELS[fill]}
                      </MenuItem>
                    )
                  })}
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
            customColors={customColors}
            onPrimaryChange={onPrimaryChange}
            onSecondaryChange={onSecondaryChange}
            onSwap={onSwap}
            onAddCustomColor={onAddCustomColor}
            onRemoveCustomColor={onRemoveCustomColor}
          />
        </div>
        <div className="ribbon-group-label">Colors</div>
      </section>

      <div className="ribbon-separator" />

      <section className="ribbon-group">
        <div className="ribbon-group-items">
          <button
            type="button"
            className="icon-button icon-button-large"
            title="Show or hide the layers panel"
            aria-label="Layers"
            aria-pressed={showLayers}
            onClick={onToggleLayers}
          >
            <LayersIcon size={28} />
          </button>
        </div>
        <div className="ribbon-group-label">Layers</div>
      </section>
    </div>
  )
}
