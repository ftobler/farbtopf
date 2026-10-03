import type { ComponentType, ReactNode } from 'react'
import { BRUSHES } from '../core/brushes'
import type { BrushId } from '../core/brushes'
import { toCss } from '../core/color'
import type { Rgba } from '../core/color'
import type { SelectionShape } from '../core/selection'
import { BRUSH_SIZES, TOOLS, toolById } from '../core/tools'
import { shapeIconPath } from '../core/shapes'
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
  ImageIcon,
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

/** Tools group, in reading order: two rows of three. */
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

export type RibbonLayout = 'full' | 'compact' | 'phone'

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
  /**
   * `full` (default) is the labelled desktop ribbon. `compact` is a single row where groups
   * collapse into buttons that open their controls in a popup; `phone` also collapses the
   * tools into one button and leaves cut, copy and paste to the Edit menu.
   */
  layout?: RibbonLayout
}

/** The current shape's outline, drawn like the shape gallery's icons. */
function ShapeKindIcon({ kind, size }: { kind: ShapeKind; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={shapeIconPath(kind, 24)} />
    </svg>
  )
}

/** The primary colour over the secondary one: the face of the collapsed Colors group. */
function ColorPair({ primary, secondary }: { primary: Rgba; secondary: Rgba }) {
  return (
    <span className="color-pair" aria-hidden="true">
      <span className="color-pair-secondary" style={{ background: toCss(secondary) }} />
      <span className="color-pair-primary" style={{ background: toCss(primary) }} />
    </span>
  )
}

/** One labelled group of the full ribbon. */
function RibbonGroup({ label, itemsClassName, children }: { label: string; itemsClassName?: string; children: ReactNode }) {
  return (
    <section className="ribbon-group">
      <div className={`ribbon-group-items${itemsClassName ? ` ${itemsClassName}` : ''}`}>{children}</div>
      <div className="ribbon-group-label">{label}</div>
    </section>
  )
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
  layout = 'full',
}: RibbonProps) {
  const full = layout === 'full'
  const utilityTools = TOOL_GRID.map(toolById)
  const ShapeFillIcon = SHAPE_FILL_ICONS[shapeFill]
  /** Big ribbon buttons on the desktop, row-height ones when collapsed. */
  const bigIcon = full ? 28 : 18
  const bigTrigger = full ? 'dropdown-trigger dropdown-trigger-large' : 'dropdown-trigger'

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

  const selectDropdown = (
    <Dropdown
      title="Select"
      ariaLabel="Select"
      active={tool === 'select'}
      triggerClassName={bigTrigger}
      trigger={selectionShape === 'freeform' ? <FreeformSelectIcon size={bigIcon} /> : <SelectIcon size={bigIcon} />}
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
  )

  const rotateItems = (close: () => void) => (
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
  )

  const flipItems = (close: () => void) => (
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
  )

  const brushDropdown = (
    <Dropdown
      title="Brush"
      ariaLabel="Brush"
      active={tool === 'brush'}
      triggerClassName={bigTrigger}
      trigger={<BrushIcon size={bigIcon} />}
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
  )

  /** Shape gallery plus the stroke size and fill options; `onPicked` runs after a shape is chosen. */
  const shapeControls = (onPicked?: () => void) => (
    <>
      <ShapeGallery
        active={tool === 'shape' ? shapeKind : null}
        onSelect={(kind) => {
          onShapeKindChange(kind)
          onToolChange('shape')
          onPicked?.()
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
    </>
  )

  const colorPalette = (
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
  )

  const layersButton = (
    <button
      type="button"
      className={full ? 'icon-button icon-button-large' : 'icon-button'}
      title="Show or hide the layers panel"
      aria-label="Layers"
      aria-pressed={showLayers}
      onClick={onToggleLayers}
    >
      <LayersIcon size={bigIcon} />
    </button>
  )

  if (!full) {
    const phone = layout === 'phone'
    // On a phone the tools fold into one split button showing the current (or last) tool.
    const shownTool = TOOL_GRID.includes(tool) ? tool : 'pencil'
    const ShownToolIcon = TOOL_ICONS[shownTool]
    return (
      <div className={`ribbon ribbon-compact${phone ? ' ribbon-phone' : ''}`}>
        {phone ? null : (
          <>
            <Dropdown title="Clipboard" ariaLabel="Clipboard" triggerClassName="dropdown-trigger" trigger={<PasteIcon size={18} />}>
              {(close) => (
                <>
                  <MenuItem
                    icon={<CutIcon size={16} />}
                    shortcut="Ctrl+X"
                    onClick={() => {
                      onCut()
                      close()
                    }}
                  >
                    Cut
                  </MenuItem>
                  <MenuItem
                    icon={<CopyIcon size={16} />}
                    shortcut="Ctrl+C"
                    onClick={() => {
                      onCopy()
                      close()
                    }}
                  >
                    Copy
                  </MenuItem>
                  <MenuItem
                    icon={<PasteIcon size={16} />}
                    shortcut="Ctrl+V"
                    onClick={() => {
                      onPaste()
                      close()
                    }}
                  >
                    Paste
                  </MenuItem>
                </>
              )}
            </Dropdown>
            <div className="ribbon-separator" />
          </>
        )}
        {selectDropdown}
        <Dropdown
          title="Image"
          ariaLabel="Image"
          triggerClassName="dropdown-trigger"
          showChevron={!phone}
          trigger={<ImageIcon size={18} />}
        >
          {(close) => (
            <>
              <MenuItem
                icon={<CropIcon size={16} />}
                disabled={!hasSelection}
                onClick={() => {
                  onCrop()
                  close()
                }}
              >
                Crop to selection
              </MenuItem>
              <MenuItem
                icon={<ScaleIcon size={16} />}
                onClick={() => {
                  onScale()
                  close()
                }}
              >
                Scale image…
              </MenuItem>
              <MenuDivider />
              {rotateItems(close)}
              <MenuDivider />
              {flipItems(close)}
            </>
          )}
        </Dropdown>
        {phone ? null : <div className="ribbon-separator" />}
        {phone ? (
          <Dropdown
            title="Tools"
            ariaLabel="Tools"
            active={tool === shownTool}
            triggerClassName="dropdown-trigger"
            trigger={<ShownToolIcon size={18} />}
            onAction={() => onToolChange(shownTool)}
          >
            {(close) => (
              <>
                {utilityTools.map((definition) => {
                  const Icon = TOOL_ICONS[definition.id]
                  return (
                    <MenuItem
                      key={definition.id}
                      icon={<Icon size={16} />}
                      checked={tool === definition.id}
                      onClick={() => {
                        onToolChange(definition.id)
                        close()
                      }}
                    >
                      {definition.label}
                    </MenuItem>
                  )
                })}
              </>
            )}
          </Dropdown>
        ) : (
          <div className="ribbon-tools">{utilityTools.map(renderTool)}</div>
        )}
        {brushDropdown}
        <Dropdown
          title="Shapes"
          ariaLabel="Shapes"
          popup="dialog"
          active={tool === 'shape'}
          triggerClassName="dropdown-trigger"
          menuClassName="ribbon-popover ribbon-popover-shapes"
          showChevron={!phone}
          trigger={<ShapeKindIcon kind={shapeKind} size={18} />}
        >
          {(close) => shapeControls(close)}
        </Dropdown>
        {phone ? null : <div className="ribbon-separator" />}
        <Dropdown
          title="Colors"
          ariaLabel="Colors"
          popup="dialog"
          triggerClassName="dropdown-trigger color-pair-trigger"
          menuClassName="ribbon-popover ribbon-popover-colors"
          showChevron={!phone}
          trigger={<ColorPair primary={primary} secondary={secondary} />}
        >
          {() => colorPalette}
        </Dropdown>
        {layersButton}
      </div>
    )
  }

  return (
    <div className="ribbon">
      <RibbonGroup label="Clipboard">
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
          <button type="button" className="icon-button" title="Cut" aria-label="Cut" onClick={onCut}>
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
      </RibbonGroup>

      <div className="ribbon-separator" />

      <RibbonGroup label="Selection">{selectDropdown}</RibbonGroup>

      <div className="ribbon-separator" />

      <RibbonGroup label="Image" itemsClassName="button-grid">
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
        <Dropdown title="Rotate" ariaLabel="Rotate" trigger={<RotateIcon size={18} />} onAction={() => onRotate(lastRotation)}>
          {rotateItems}
        </Dropdown>
        <button type="button" className="icon-button" title="Scale image" aria-label="Scale" onClick={onScale}>
          <ScaleIcon size={18} />
        </button>
        <Dropdown title="Flip" ariaLabel="Flip" trigger={<FlipIcon size={18} />} onAction={() => onFlip(lastFlip)}>
          {flipItems}
        </Dropdown>
      </RibbonGroup>

      <div className="ribbon-separator" />

      <RibbonGroup label="Tools" itemsClassName="button-grid tool-grid">
        {utilityTools.map(renderTool)}
      </RibbonGroup>

      <div className="ribbon-separator" />

      <RibbonGroup label="Brushes">{brushDropdown}</RibbonGroup>

      <div className="ribbon-separator" />

      <RibbonGroup label="Shapes">{shapeControls()}</RibbonGroup>

      <div className="ribbon-separator" />

      <RibbonGroup label="Colors">{colorPalette}</RibbonGroup>

      <div className="ribbon-separator" />

      <RibbonGroup label="Layers">{layersButton}</RibbonGroup>
    </div>
  )
}
