import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { Bitmap } from '../core/bitmap'
import {
  HIGHLIGHTER_ALPHA,
  compositeHighlighter,
  createCoverageMask,
  SPRAY_TICK_MS,
  paintBrushStroke,
  sprayCanDots,
  sprayDab,
  stampHighlighter,
} from '../core/brushes'
import type { BrushId, CoverageMask } from '../core/brushes'
import type { Rgba } from '../core/color'
import { TRANSPARENT, WHITE, colorsEqual, toCss } from '../core/color'
import type { Point, Rect } from '../core/geometry'
import { clamp, clampPoint, distance, normalizeRect, pointInRect, pointsEqual } from '../core/geometry'
import { History } from '../core/history'
import { compositeLayers, drawOver, moveItem, thumbnail } from '../core/layers'
import type { Layer, LayerInfo } from '../core/layers'
import {
  blit,
  blitAlpha,
  crop,
  drawLine,
  extractRegion,
  flipHorizontal,
  flipVertical,
  floodFill,
  invertColors as invertBitmap,
  rotateBy,
  scale,
  stamp,
} from '../core/raster'
import { MAX_CANVAS } from '../core/palette'
import { eraserPreviewRect } from '../core/cursorPreview'
import { blendToward } from '../core/opacity'
import type { Random } from '../core/random'
import type { BrushShape } from '../core/raster'
import {
  applyMask,
  fillSelection,
  invertSelectedColors,
  invertSelection,
  isSelected,
  polygonSelection,
} from '../core/selection'
import type { SelectionMask, SelectionShape } from '../core/selection'
import { renderShape as drawShape, shapeById } from '../core/shapes'
import type { ShapeKind } from '../core/shapes'
import type { ShapeFill, ToolId } from '../core/tools'
import { isShapeTool, strokeColorFor, strokeWidthFor } from '../core/tools'
import { backingScale } from '../core/zoom'
import { useDevicePixelRatio } from '../hooks/useDevicePixelRatio'
import { bitmapFromDataUrl } from '../render/image'
import { DEFAULT_TEXT_OPTIONS, FONT_FAMILIES, TEXT_LINE_HEIGHT, renderText } from '../render/text'
import type { TextOptions } from '../render/text'
import { Dropdown, MenuItem } from './Dropdown'

export interface PaintCanvasHandle {
  newDocument: (width: number, height: number) => void
  loadBitmap: (bitmap: Bitmap) => void
  loadDataUrl: (src: string) => Promise<void>
  /**
   * Pastes `bitmap` as a floating selection at the top-left of the visible part of
   * the image. The canvas only grows, just enough, when the paste does not fit.
   */
  pasteBitmap: (bitmap: Bitmap) => void
  pasteDataUrl: (src: string) => Promise<void>
  clear: () => void
  undo: () => void
  redo: () => void
  toDataUrl: () => string
  getSize: () => { width: number; height: number }
  /** Mirrors the selection, or the whole image when nothing is selected. */
  flip: (axis: 'horizontal' | 'vertical') => void
  /**
   * Rotates the selection clockwise about its centre, or the whole image when nothing
   * is selected; the canvas then grows to fit and new corners take the secondary colour.
   */
  rotate: (degrees: number) => void
  resize: (width: number, height: number) => void
  /** Scales the selection to `width`×`height` in place, or the whole image when nothing is selected. */
  scale: (width: number, height: number) => void
  /**
   * Re-sizes the document to `rect` without scaling its pixels. Content is kept
   * at its image position; new area is white and anything outside is cropped.
   */
  resizeCanvas: (rect: Rect) => void
  /** Inverts the colours of the selection, or of the whole document without one. */
  invertColors: () => void
  cropToSelection: () => void
  getSelection: () => Rect | null
  clearSelection: () => void
  /**
   * A primary press on the workspace outside the image, at client coordinates:
   * commits an open text box and a floating selection, then deselects. Presses
   * on a selection handle that reaches past the image edge are ignored.
   */
  clickOutside: (clientX: number, clientY: number) => void
  selectAll: () => void
  invertSelection: () => void
  deleteSelection: () => void
  getSelectionDataUrl: () => string | null
  /** The selection, or the whole image, with every layer flattened, as a PNG data URL. */
  getVisibleDataUrl: () => string
  cutSelection: () => void
  /** Adds a transparent layer above the active one and makes it active. */
  addLayer: () => void
  /** Removes a layer; the last remaining layer is kept. */
  deleteLayer: (index: number) => void
  /** Moves a layer within the stack; index 0 is the bottom-most layer. */
  moveLayer: (from: number, to: number) => void
  /** Makes a layer the one the tools draw on. */
  selectLayer: (index: number) => void
}

export interface PaintCanvasProps {
  initialWidth: number
  initialHeight: number
  tool: ToolId
  primary: Rgba
  secondary: Rgba
  brushSize: number
  /**
   * Stroke opacity (strength) of the current tool in percent, 1..100. A stroke is
   * painted at full strength and blended once, so it never builds up over itself.
   */
  opacity?: number
  shapeFill: ShapeFill
  shapeKind?: ShapeKind
  zoom: number
  pan?: { x: number; y: number }
  showGrid: boolean
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void
  onCursorMove: (point: Point | null) => void
  onPickColor: (color: Rgba, slot: 'primary' | 'secondary') => void
  onSizeChange: (width: number, height: number) => void
  onSelectionChange?: (hasSelection: boolean) => void
  /**
   * Size of what is being selected, for the status bar: the selection (a free-form
   * one's bounding box), one being dragged out, or a text box. Null without any.
   */
  onSelectionSizeChange?: (size: { width: number; height: number } | null) => void
  /** Zoom tool click: 1 to zoom in (left button), -1 to zoom out (right button). */
  onZoomClick?: (direction: 1 | -1) => void
  transparentSelection: boolean
  selectionShape?: SelectionShape
  /** Freehand brush style used by the brush tool. */
  brush?: BrushId
  /** Random source for the airbrush and spray can; Math.random by default (seeded in tests). */
  random?: Random
  /** Font, size and style used by the text tool. */
  text?: TextOptions
  /** Called by the floating text toolbar when a text option changes. */
  onTextChange?: (patch: Partial<TextOptions>) => void
  /** Shows a small overview of the whole image in the corner of the workspace. */
  showMiniature?: boolean
  /** Called when the miniature view is dragged to move the visible area. */
  onPanChange?: (pan: Point) => void
  /** Reports the layer stack (bottom first) and the index of the active layer. */
  onLayersChange?: (layers: LayerInfo[], active: number) => void
}

/** An undo step: the whole layer stack and which layer was active. */
interface DocSnapshot {
  layers: Layer[]
  active: number
}

interface StrokeState {
  pointerId: number
  slot: 'primary' | 'secondary'
  tool: ToolId
  kind: ShapeKind
  start: Point
  last: Point
  base: Bitmap
  recorded: boolean
  /** Every pointer position of a freehand shape. */
  points: Point[]
  /** Stroke-scoped coverage for the highlighter so overlaps stay one flat alpha. */
  highlighter?: CoverageMask
  /** Below 1, the stroke is painted at full strength into `work` and blended onto `base` at this strength. */
  strength: number
  /** The full-strength stroke over `base`, when painting at less than 100 % opacity. */
  work?: Bitmap
}

/**
 * A polyline being built click by click. The document stays untouched until it is
 * finished; only then is it drawn onto `base` and recorded as a single history entry.
 */
interface PolylineState {
  kind: ShapeKind
  slot: 'primary' | 'secondary'
  base: Bitmap
  points: Point[]
  /** The loose end that follows the pointer while dragging or hovering. */
  pending: Point | null
  /** The pointer held down to place the next vertex, if any. */
  pointerId: number | null
  lastDown: { time: number; point: Point }
}

/**
 * A cubic bezier being placed and bent. A drag sets the straight chord p0→p3 and
 * its two control handles at the thirds; dragging a handle then bends the curve.
 * The document stays untouched until the curve is committed.
 */
interface CurveState {
  kind: ShapeKind
  slot: 'primary' | 'secondary'
  base: Bitmap
  p0: Point
  p3: Point
  c1: Point
  c2: Point
  phase: 'line' | 'bend'
  /** The pointer that started the line or is dragging a handle, if any. */
  pointerId: number | null
  /** The endpoint dot or control handle being dragged in the bend phase. */
  active: 'p0' | 'p3' | 'c1' | 'c2' | null
}

/** The part of a pending curve the overlay and dialog redraw from. */
interface CurveMirror {
  phase: 'line' | 'bend'
  p0: Point
  p3: Point
  c1: Point
  c2: Point
}

interface TextEditorState {
  x: number
  y: number
  width: number
  height: number
  value: string
  slot: 'primary' | 'secondary'
}

interface TextResizeState {
  pointerId: number
  handle: SelectionHandle
}

/** A text box being dragged out on the canvas, before the editor opens. */
interface TextPlaceState {
  pointerId: number
  start: Point
}

type SelectionHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

interface FloatingSelection {
  source: Bitmap
  bitmap: Bitmap
  x: number
  y: number
  base: Bitmap
}

interface RotationStart {
  bitmap: Bitmap
  shape: Bitmap
  center: Point
}

interface SelectDrag {
  pointerId: number
  mode: 'marquee' | 'lasso' | 'move' | 'resize' | 'rotate'
  start: Point
  points?: Point[]
  handle?: SelectionHandle
  origin?: Rect
  rotation?: RotationStart
}

interface CanvasResizeDrag {
  pointerId: number
  handle: SelectionHandle
  /** The layers as they were when the drag started; every preview rebuilds from them. */
  source: DocSnapshot
  /** Screen position of the frame's top-left when the drag started. */
  frameLeft: number
  frameTop: number
  startWidth: number
  startHeight: number
  startPan: Point
  /** The pre-resize snapshot is pushed once, on the first move. */
  recorded: boolean
}

const HISTORY_LIMIT = 80

const SELECTION_HANDLES: SelectionHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const HANDLE_HIT = 4
/** Grab radius, in screen pixels, for the curve's endpoints and control handles. */
const CURVE_DOT_HIT = 8
/** A curve drag shorter than this many screen pixels counts as a click, not a new curve. */
const CURVE_CLICK_SLOP = 5
const DOUBLE_CLICK_MS = 300
/** How far apart, in screen pixels, the two presses of a double-click may be. */
const DOUBLE_CLICK_SLOP = 4

const MIN_TEXT_SIZE = 24
const DEFAULT_TEXT_WIDTH = 200
/** How far, in screen pixels, the pointer may wander before a text click becomes a drag. */
const TEXT_DRAG_SLOP = 4
const TEXT_TOOLBAR_WIDTH = 300
const TEXT_TOOLBAR_HEIGHT = 40
const TEXT_TOOLBAR_GAP = 8
/** Roughly the height of the font menu; used to decide if it fits below. */
const TEXT_MENU_HEIGHT = 240

/** The points handed to `renderShape` for a dragged shape: the start and current end. */
function shapePoints(stroke: StrokeState, end: Point): Point[] {
  return [stroke.start, end]
}

/** The pixels a freehand segment of `width` can touch, with room for every brush's reach. */
function segmentBounds(from: Point, to: Point, width: number): Rect {
  const pad = Math.ceil(width) + 2
  const x = Math.floor(Math.min(from.x, to.x)) - pad
  const y = Math.floor(Math.min(from.y, to.y)) - pad
  return {
    x,
    y,
    width: Math.ceil(Math.max(from.x, to.x)) + pad + 1 - x,
    height: Math.ceil(Math.max(from.y, to.y)) + pad + 1 - y,
  }
}

function strokeShape(tool: ToolId): BrushShape {
  return tool === 'pencil' || tool === 'eraser' ? 'square' : 'round'
}

function clampRect(rect: Rect, width: number, height: number): Rect {
  const x = Math.max(0, Math.min(rect.x, width - 1))
  const y = Math.max(0, Math.min(rect.y, height - 1))
  return {
    x,
    y,
    width: Math.min(Math.max(1, rect.width), width - x),
    height: Math.min(Math.max(1, rect.height), height - y),
  }
}

function handlePoint(rect: Rect, handle: SelectionHandle): Point {
  const left = rect.x
  const top = rect.y
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  const midX = rect.x + rect.width / 2
  const midY = rect.y + rect.height / 2
  switch (handle) {
    case 'nw': return { x: left, y: top }
    case 'n': return { x: midX, y: top }
    case 'ne': return { x: right, y: top }
    case 'e': return { x: right, y: midY }
    case 'se': return { x: right, y: bottom }
    case 's': return { x: midX, y: bottom }
    case 'sw': return { x: left, y: bottom }
    case 'w': return { x: left, y: midY }
  }
}

function hitHandle(rect: Rect, point: Point, tolerance: number): SelectionHandle | null {
  let best: SelectionHandle | null = null
  let bestDistance = Infinity
  for (const handle of SELECTION_HANDLES) {
    const candidate = distance(point, handlePoint(rect, handle))
    if (candidate < bestDistance) {
      bestDistance = candidate
      best = handle
    }
  }
  return bestDistance <= tolerance ? best : null
}

function handleCursor(handle: SelectionHandle): string {
  if (handle === 'n' || handle === 's') return 'ns-resize'
  if (handle === 'e' || handle === 'w') return 'ew-resize'
  if (handle === 'nw' || handle === 'se') return 'nwse-resize'
  return 'nesw-resize'
}

function resizeRect(origin: Rect, handle: SelectionHandle, point: Point, width: number, height: number): Rect {
  let left = origin.x
  let top = origin.y
  let right = origin.x + origin.width
  let bottom = origin.y + origin.height
  if (handle.includes('w')) left = clamp(Math.round(point.x), 0, width - 1)
  if (handle.includes('e')) right = clamp(Math.round(point.x), 1, width)
  if (handle.includes('n')) top = clamp(Math.round(point.y), 0, height - 1)
  if (handle.includes('s')) bottom = clamp(Math.round(point.y), 1, height)
  if (right <= left) {
    if (handle.includes('w')) left = right - 1
    else right = left + 1
  }
  if (bottom <= top) {
    if (handle.includes('n')) top = bottom - 1
    else bottom = top + 1
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

const fontLabel = (value: string): string =>
  FONT_FAMILIES.find((font) => font.value === value)?.label ?? 'Segoe UI'

function resizeTextBox(
  origin: Rect,
  handle: SelectionHandle,
  point: Point,
  width: number,
  height: number,
): Rect {
  let left = origin.x
  let top = origin.y
  let right = origin.x + origin.width
  let bottom = origin.y + origin.height
  if (handle.includes('w')) left = clamp(Math.round(point.x), 0, right - MIN_TEXT_SIZE)
  if (handle.includes('e')) right = clamp(Math.round(point.x), left + MIN_TEXT_SIZE, width)
  if (handle.includes('n')) top = clamp(Math.round(point.y), 0, bottom - MIN_TEXT_SIZE)
  if (handle.includes('s')) bottom = clamp(Math.round(point.y), top + MIN_TEXT_SIZE, height)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** Grows `rect` to the minimum text box size and slides it back inside the canvas. */
function fitTextBox(rect: Rect, width: number, height: number): Rect {
  const w = Math.max(MIN_TEXT_SIZE, rect.width)
  const h = Math.max(MIN_TEXT_SIZE, rect.height)
  return {
    x: clamp(rect.x, 0, Math.max(0, width - w)),
    y: clamp(rect.y, 0, Math.max(0, height - h)),
    width: w,
    height: h,
  }
}

/**
 * The text box placed by a press at `start` and release at `end`. A drag spans the
 * dragged rectangle, like a marquee selection; a plain click (within `slop` canvas
 * pixels) opens a default-sized, one-line box at `start`.
 */
function placeTextBox(
  start: Point,
  end: Point,
  slop: number,
  lineHeight: number,
  width: number,
  height: number,
): Rect {
  if (Math.abs(end.x - start.x) <= slop && Math.abs(end.y - start.y) <= slop) {
    const defaultWidth = Math.min(DEFAULT_TEXT_WIDTH, width - start.x)
    return fitTextBox({ x: start.x, y: start.y, width: defaultWidth, height: lineHeight }, width, height)
  }
  return fitTextBox(clampRect(normalizeRect(start, end), width, height), width, height)
}

/** Pixels spanned along one axis by a free-form outline being traced. */
function lassoExtent(points: readonly Point[], axis: 'x' | 'y'): number {
  const values = points.map((point) => point[axis])
  return Math.max(...values) - Math.min(...values) + 1
}

/** An opaque bitmap of the selected pixels, used to rotate a selection's shape. */
function shapeBitmap(width: number, height: number, mask: SelectionMask | null): Bitmap {
  const shape = new Bitmap(width, height)
  const local = { x: 0, y: 0, width, height }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isSelected(local, mask, x, y)) shape.set(x, y, WHITE)
    }
  }
  return shape
}

function maskFromShape(shape: Bitmap): SelectionMask | null {
  const data = new Uint8Array(shape.width * shape.height)
  let full = true
  for (let i = 0; i < data.length; i += 1) {
    data[i] = shape.data[i * 4 + 3] >= 128 ? 1 : 0
    if (!data[i]) full = false
  }
  return full ? null : { width: shape.width, height: shape.height, data }
}

function flipMask(mask: SelectionMask, axis: 'horizontal' | 'vertical'): SelectionMask {
  const { width, height } = mask
  const data = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = axis === 'horizontal' ? width - 1 - x : x
      const sy = axis === 'vertical' ? height - 1 - y : y
      data[y * width + x] = mask.data[sy * width + sx]
    }
  }
  return { width, height, data }
}

function pointerAngle(center: Point, point: Point): number {
  return Math.atan2(point.y - center.y, point.x - center.x)
}

/**
 * The eraser's footprint in the colour it erases to, like MS Paint's eraser cursor.
 * It is only an overlay: nothing here touches the image or the history.
 */
function EraserPreview({ rect, color }: { rect: Rect; color: Rgba }) {
  return (
    <div
      className="eraser-preview"
      aria-hidden="true"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, backgroundColor: toCss(color) }}
    />
  )
}

function MaskOutline({ mask }: { mask: SelectionMask }) {
  const outlineRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = outlineRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const { width, height, data } = mask
    const at = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && data[y * width + x] === 1
    const outline = new Bitmap(width, height)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!at(x, y)) continue
        if (at(x - 1, y) && at(x + 1, y) && at(x, y - 1) && at(x, y + 1)) continue
        outline.set(x, y, (x + y) % 4 < 2 ? { r: 0, g: 0, b: 0, a: 220 } : { r: 255, g: 255, b: 255, a: 220 })
      }
    }
    context.putImageData(outline.toImageData(), 0, 0)
  }, [mask])

  return <canvas ref={outlineRef} className="selection-mask" width={mask.width} height={mask.height} />
}

function bitmapToDataUrl(bitmap: Bitmap): string {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  if (!context) return ''
  context.putImageData(bitmap.toImageData(), 0, 0)
  return canvas.toDataURL('image/png')
}

export const PaintCanvas = forwardRef<PaintCanvasHandle, PaintCanvasProps>(function PaintCanvas(
  {
    initialWidth,
    initialHeight,
    tool,
    primary,
    secondary,
    brushSize,
    opacity = 100,
    shapeFill,
    shapeKind = 'rectangle',
    zoom,
    pan = { x: 0, y: 0 },
    showGrid,
    onHistoryChange,
    onCursorMove,
    onPickColor,
    onSizeChange,
    onSelectionChange = () => {},
    onSelectionSizeChange,
    onZoomClick = () => {},
    transparentSelection,
    selectionShape = 'rectangle',
    brush = 'round',
    random = Math.random,
    text = DEFAULT_TEXT_OPTIONS,
    onTextChange = () => {},
    showMiniature = false,
    onPanChange,
    onLayersChange,
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const miniatureRef = useRef<HTMLCanvasElement | null>(null)
  const bitmapRef = useRef<Bitmap | null>(null)
  const historyRef = useRef(new History<DocSnapshot>(HISTORY_LIMIT))
  /** The layer stack, bottom first. The active entry's bitmap may be stale: `bitmapRef` holds the live one. */
  const layersRef = useRef<Layer[]>([])
  const activeRef = useRef(0)
  const layerCountRef = useRef(1)
  /** The layers below and above the active one, pre-flattened so painting only blends three bitmaps. */
  const stackRef = useRef<{ below: Bitmap | null; above: Bitmap | null }>({ below: null, above: null })
  const strokeRef = useRef<StrokeState | null>(null)
  /** Keeps the spray can spraying while the pointer is held down, even without moving. */
  const sprayTimerRef = useRef<number | null>(null)
  const stopSpraying = useCallback(() => {
    if (sprayTimerRef.current !== null) window.clearInterval(sprayTimerRef.current)
    sprayTimerRef.current = null
  }, [])
  useEffect(() => stopSpraying, [stopSpraying])
  const editorRef = useRef<TextEditorState | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const textToolbarRef = useRef<HTMLDivElement | null>(null)
  const textOverlayRef = useRef<HTMLDivElement | null>(null)
  const textResizeRef = useRef<TextResizeState | null>(null)
  const textPlaceRef = useRef<TextPlaceState | null>(null)
  const selectionRef = useRef<Rect | null>(null)
  const maskRef = useRef<SelectionMask | null>(null)
  const selectRef = useRef<SelectDrag | null>(null)
  const canvasResizeRef = useRef<CanvasResizeDrag | null>(null)
  const floatingRef = useRef<FloatingSelection | null>(null)
  const polylineRef = useRef<PolylineState | null>(null)
  const curveRef = useRef<CurveState | null>(null)
  // The handle is built before the pointer helpers it needs, so it calls through this.
  const clickOutsideRef = useRef<(clientX: number, clientY: number) => void>(() => {})
  const [polylineActive, setPolylineActive] = useState(false)
  const [curve, setCurve] = useState<CurveMirror | null>(null)
  const [size, setSize] = useState({ width: initialWidth, height: initialHeight })
  const [editor, setEditor] = useState<TextEditorState | null>(null)
  const [selection, setSelection] = useState<Rect | null>(null)
  const [mask, setMask] = useState<SelectionMask | null>(null)
  const [lasso, setLasso] = useState<Point[] | null>(null)
  /** The dashed outline of a text box being dragged out. */
  const [textDraft, setTextDraft] = useState<Rect | null>(null)
  const [hoverCursor, setHoverCursor] = useState<string | null>(null)
  /** The image pixel under the pointer while the eraser is active, for its footprint preview. */
  const [eraserHover, setEraserHover] = useState<Point | null>(null)
  const pixelRatio = useDevicePixelRatio()
  /** The current tool's opacity as a 0.01..1 blend factor. */
  const strength = Math.min(100, Math.max(1, Number.isFinite(opacity) ? opacity : 100)) / 100
  const [viewport, setViewport] = useState<Rect | null>(null)

  const doc = useCallback((): Bitmap => {
    if (!bitmapRef.current) {
      bitmapRef.current = new Bitmap(initialWidth, initialHeight, WHITE)
    }
    return bitmapRef.current
  }, [initialWidth, initialHeight])

  const paint = useCallback((bitmap: Bitmap) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    // Scale the backing store with a whole-number device pixel ratio so strokes
    // stay crisp on high-density displays; the CSS size (and therefore the
    // shown zoom) is untouched.
    const ratio = backingScale(window.devicePixelRatio || 1)
    const backingWidth = Math.max(1, Math.round(bitmap.width * ratio))
    const backingHeight = Math.max(1, Math.round(bitmap.height * ratio))
    if (canvas.width !== backingWidth) canvas.width = backingWidth
    if (canvas.height !== backingHeight) canvas.height = backingHeight

    const { below, above } = stackRef.current
    let shown = bitmap
    if (below || above) {
      shown = below ? below.clone() : new Bitmap(bitmap.width, bitmap.height)
      drawOver(shown, bitmap)
      if (above) drawOver(shown, above)
    }
    const image = shown.toImageData()

    const miniature = miniatureRef.current
    if (miniature) {
      if (miniature.width !== bitmap.width) miniature.width = bitmap.width
      if (miniature.height !== bitmap.height) miniature.height = bitmap.height
      miniature.getContext('2d')?.putImageData(image, 0, 0)
    }

    if (ratio === 1 || typeof context.drawImage !== 'function') {
      context.putImageData(image, 0, 0)
      return
    }

    let offscreen = offscreenRef.current
    if (!offscreen) {
      offscreen = document.createElement('canvas')
      offscreenRef.current = offscreen
    }
    if (offscreen.width !== bitmap.width) offscreen.width = bitmap.width
    if (offscreen.height !== bitmap.height) offscreen.height = bitmap.height
    const offscreenContext = offscreen.getContext('2d')
    if (!offscreenContext) {
      context.putImageData(image, 0, 0)
      return
    }
    offscreenContext.putImageData(image, 0, 0)
    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, backingWidth, backingHeight)
    context.drawImage(offscreen, 0, 0, backingWidth, backingHeight)
  }, [])

  const layers = useCallback((): Layer[] => {
    if (layersRef.current.length === 0) layersRef.current = [{ id: 1, name: 'Background', bitmap: doc() }]
    return layersRef.current
  }, [doc])

  /** The layer stack with the live bitmap of the active layer. */
  const currentLayers = useCallback(
    (): Layer[] => layers().map((layer, index) => (index === activeRef.current ? { ...layer, bitmap: doc() } : layer)),
    [doc, layers],
  )

  /** Records an undo step; `before` is the active layer's bitmap as it was before the change. */
  const recordHistory = useCallback(
    (before: Bitmap) => {
      const stack = layers().map((layer, index) => (index === activeRef.current ? { ...layer, bitmap: before } : layer))
      historyRef.current.record({ layers: stack, active: activeRef.current })
    },
    [layers],
  )

  /** What erasing leaves behind: the secondary colour on the bottom layer, transparency above it. */
  const eraseColor = useCallback(() => (activeRef.current === 0 ? secondary : TRANSPARENT), [secondary])

  const publishLayers = useCallback(() => {
    if (!onLayersChange) return
    const stack = currentLayers().map(({ id, name, bitmap }) => ({ id, name, thumbnail: thumbnail(bitmap) }))
    onLayersChange(stack, activeRef.current)
  }, [currentLayers, onLayersChange])

  /** Replaces the layer stack; the active layer's bitmap becomes the live paint surface. */
  const setLayers = useCallback(
    (next: Layer[], active: number) => {
      layersRef.current = next
      activeRef.current = active
      bitmapRef.current = next[active].bitmap
      const flatten = (stack: Layer[]) => compositeLayers(stack.map((layer) => layer.bitmap))
      stackRef.current = { below: flatten(next.slice(0, active)), above: flatten(next.slice(active + 1)) }
      paint(next[active].bitmap)
      publishLayers()
    },
    [paint, publishLayers],
  )

  useEffect(() => {
    publishLayers()
  }, [publishLayers])

  const syncHistory = useCallback(() => {
    const history = historyRef.current
    onHistoryChange(history.canUndo, history.canRedo)
    publishLayers()
  }, [onHistoryChange, publishLayers])

  const updateSelection = useCallback(
    (rect: Rect | null, nextMask: SelectionMask | null = null) => {
      selectionRef.current = rect
      maskRef.current = rect ? nextMask : null
      setSelection(rect)
      setMask(rect ? nextMask : null)
      onSelectionChange(rect !== null)
    },
    [onSelectionChange],
  )

  const selectionWidth = textDraft?.width ?? editor?.width ?? (lasso ? lassoExtent(lasso, 'x') : selection?.width)
  const selectionHeight = textDraft?.height ?? editor?.height ?? (lasso ? lassoExtent(lasso, 'y') : selection?.height)
  useEffect(() => {
    onSelectionSizeChange?.(
      selectionWidth !== undefined && selectionHeight !== undefined
        ? { width: selectionWidth, height: selectionHeight }
        : null,
    )
  }, [onSelectionSizeChange, selectionWidth, selectionHeight])

  const currentRect = useCallback((): Rect | null => {
    const floating = floatingRef.current
    if (floating) {
      return { x: floating.x, y: floating.y, width: floating.bitmap.width, height: floating.bitmap.height }
    }
    return selectionRef.current
  }, [])

  const renderPreview = useCallback(() => {
    const floating = floatingRef.current
    if (!floating) return
    const preview = floating.base.clone()
    blitAlpha(preview, floating.bitmap, floating.x, floating.y)
    paint(preview)
  }, [paint])

  const ensureFloating = useCallback(
    (rect: Rect): FloatingSelection => {
      if (floatingRef.current) return floatingRef.current
      const original = doc()
      const base = original.clone()
      const selectionMask = maskRef.current
      const region = extractRegion(original, rect, transparentSelection ? secondary : null)
      const bitmap = selectionMask ? applyMask(region, selectionMask) : region
      recordHistory(original.clone())
      fillSelection(base, rect, selectionMask, eraseColor())
      bitmapRef.current = base
      const floating: FloatingSelection = { source: bitmap, bitmap, x: rect.x, y: rect.y, base }
      floatingRef.current = floating
      syncHistory()
      return floating
    },
    [doc, eraseColor, recordHistory, secondary, syncHistory, transparentSelection],
  )

  const beginRotation = useCallback((): RotationStart | null => {
    const rect = currentRect()
    if (!rect) return null
    const floating = ensureFloating(rect)
    const { width, height } = floating.bitmap
    return {
      bitmap: floating.bitmap,
      shape: shapeBitmap(width, height, maskRef.current),
      center: { x: floating.x + width / 2, y: floating.y + height / 2 },
    }
  }, [currentRect, ensureFloating])

  const applyRotation = useCallback(
    (start: RotationStart, degrees: number) => {
      const floating = floatingRef.current
      if (!floating) return
      const angle = Math.round(degrees * 1e6) / 1e6
      const bitmap = rotateBy(start.bitmap, angle, null)
      floating.bitmap = bitmap
      floating.x = Math.round(start.center.x - bitmap.width / 2)
      floating.y = Math.round(start.center.y - bitmap.height / 2)
      renderPreview()
      updateSelection(
        { x: floating.x, y: floating.y, width: bitmap.width, height: bitmap.height },
        maskFromShape(rotateBy(start.shape, angle, null)),
      )
    },
    [renderPreview, updateSelection],
  )

  const commitFloating = useCallback(() => {
    const floating = floatingRef.current
    if (!floating) return
    const result = floating.base.clone()
    blitAlpha(result, floating.bitmap, floating.x, floating.y)
    bitmapRef.current = result
    floatingRef.current = null
    paint(result)
    syncHistory()
  }, [paint, syncHistory])

  useEffect(() => {
    if (tool === 'select') return
    if (floatingRef.current) commitFloating()
    if (selectionRef.current) updateSelection(null)
  }, [tool, commitFloating, updateSelection])

  useEffect(() => {
    paint(doc())
  }, [size, paint, doc])

  useEffect(() => {
    if (showMiniature) paint(doc())
  }, [showMiniature, paint, doc])

  // The part of the image currently visible in the workspace, in image pixels.
  useEffect(() => {
    if (!showMiniature) return
    const update = () => {
      const canvas = canvasRef.current
      const workspace = canvas?.closest('.workspace')
      if (!canvas || !(workspace instanceof HTMLElement)) return
      const canvasRect = canvas.getBoundingClientRect()
      const workspaceRect = workspace.getBoundingClientRect()
      if (canvasRect.width === 0 || canvasRect.height === 0) return
      const left = (workspaceRect.left - canvasRect.left) / zoom
      const top = (workspaceRect.top - canvasRect.top) / zoom
      const width = workspaceRect.width / zoom
      const height = workspaceRect.height / zoom
      const x = Math.max(0, Math.min(size.width, left))
      const y = Math.max(0, Math.min(size.height, top))
      setViewport({
        x,
        y,
        width: Math.max(0, Math.min(size.width - x, width - (x - left))),
        height: Math.max(0, Math.min(size.height - y, height - (y - top))),
      })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [showMiniature, pan.x, pan.y, zoom, size.width, size.height])

  const miniatureImagePoint = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const miniature = miniatureRef.current
      if (!miniature) return null
      const rect = miniature.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return null
      return {
        x: ((clientX - rect.left) / rect.width) * size.width,
        y: ((clientY - rect.top) / rect.height) * size.height,
      }
    },
    [size.width, size.height],
  )

  const centerOn = useCallback(
    (clientX: number, clientY: number) => {
      if (!onPanChange) return
      const point = miniatureImagePoint(clientX, clientY)
      if (!point) return
      onPanChange({
        x: (size.width / 2 - point.x) * zoom,
        y: (size.height / 2 - point.y) * zoom,
      })
    },
    [miniatureImagePoint, onPanChange, size.width, size.height, zoom],
  )

  const handleMiniatureDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      centerOn(event.clientX, event.clientY)
    },
    [centerOn],
  )

  const handleMiniatureMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.buttons === 0) return
      centerOn(event.clientX, event.clientY)
    },
    [centerOn],
  )

  const colorFor = useCallback(
    (slot: 'primary' | 'secondary') => (slot === 'secondary' ? secondary : primary),
    [primary, secondary],
  )

  const renderShape = useCallback(
    (target: Bitmap, kind: ShapeKind, points: readonly Point[], slot: 'primary' | 'secondary') => {
      const color = colorFor(slot)
      const fillColor = slot === 'secondary' ? primary : secondary
      // Below 100 %, outline and fill are drawn at full strength and faded in together,
      // so where they overlap the shape is not any more opaque.
      const before = strength < 1 ? target.clone() : null
      drawShape(target, kind, points, {
        width: strokeWidthFor('shape', brushSize),
        // Open paths have no interior, so they are always stroked however the fill is set.
        stroke: shapeById(kind).closed && shapeFill === 'filled' ? null : color,
        fill: shapeFill === 'filled' ? color : shapeFill === 'outline-filled' ? fillColor : null,
      })
      if (before) blendToward(target, before, target, strength)
    },
    [brushSize, colorFor, primary, secondary, shapeFill, strength],
  )

  const cancelCurveRef = useRef<() => void>(() => {})

  /** Draws the pending curve onto a copy of the base; the live bitmap is left untouched. */
  const previewCurve = useCallback(() => {
    const curve = curveRef.current
    if (!curve) return
    const preview = curve.base.clone()
    renderShape(preview, curve.kind, [curve.p0, curve.c1, curve.c2, curve.p3], curve.slot)
    paint(preview)
    setCurve({ phase: curve.phase, p0: curve.p0, p3: curve.p3, c1: curve.c1, c2: curve.c2 })
  }, [paint, renderShape])

  /** Draws the bent curve onto the active layer as one undo step. */
  const commitCurve = useCallback(() => {
    const curve = curveRef.current
    if (!curve) return
    curveRef.current = null
    setCurve(null)
    if (pointsEqual(curve.p0, curve.p3)) {
      bitmapRef.current = curve.base
      paint(curve.base)
      return
    }
    recordHistory(curve.base)
    const final = curve.base.clone()
    renderShape(final, curve.kind, [curve.p0, curve.c1, curve.c2, curve.p3], curve.slot)
    bitmapRef.current = final
    paint(final)
    syncHistory()
  }, [paint, recordHistory, renderShape, syncHistory])

  /** Drops the pending curve, restoring the untouched base and recording no history. */
  const cancelCurve = useCallback(() => {
    const curve = curveRef.current
    if (!curve) return
    curveRef.current = null
    setCurve(null)
    bitmapRef.current = curve.base
    paint(curve.base)
  }, [paint])

  const commitCurveRef = useRef(commitCurve)
  useEffect(() => {
    commitCurveRef.current = commitCurve
  }, [commitCurve])
  useEffect(() => {
    cancelCurveRef.current = cancelCurve
  }, [cancelCurve])

  const previewPolyline = useCallback(() => {
    const polyline = polylineRef.current
    if (!polyline) return
    const points = polyline.pending ? [...polyline.points, polyline.pending] : polyline.points
    const preview = polyline.base.clone()
    if (points.length > 1) renderShape(preview, polyline.kind, points, polyline.slot)
    paint(preview)
  }, [paint, renderShape])

  /** Draws the vertices placed so far as one undo step; a lone vertex is dropped. */
  const finishPolyline = useCallback(() => {
    // A pending curve is dropped whenever a polyline is settled, so any edit action
    // that flushes one also clears the other.
    cancelCurveRef.current()
    const polyline = polylineRef.current
    if (!polyline) return
    polylineRef.current = null
    setPolylineActive(false)
    if (polyline.points.length < 2) {
      paint(doc())
      return
    }
    recordHistory(polyline.base)
    const final = polyline.base.clone()
    renderShape(final, polyline.kind, polyline.points, polyline.slot)
    bitmapRef.current = final
    paint(final)
    syncHistory()
  }, [doc, paint, recordHistory, renderShape, syncHistory])

  const finishPolylineRef = useRef(finishPolyline)
  useEffect(() => {
    finishPolylineRef.current = finishPolyline
  }, [finishPolyline])

  useEffect(() => {
    finishPolylineRef.current()
    cancelCurveRef.current()
  }, [tool, shapeKind])

  useEffect(() => {
    if (!polylineActive) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== 'Escape') return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) return
      // Escape keeps what has been drawn, like Enter: MS Paint has no way to take back a vertex either.
      event.preventDefault()
      finishPolylineRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [polylineActive])

  useEffect(() => {
    if (!curve) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== 'Escape') return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) return
      event.preventDefault()
      if (event.key === 'Escape') {
        // Escape cancels the curve and must not reach the app's select-tool shortcut.
        event.stopImmediatePropagation()
        cancelCurveRef.current()
      } else {
        commitCurveRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [curve])

  const resetDocument = useCallback(
    (bitmap: Bitmap) => {
      polylineRef.current = null
      setPolylineActive(false)
      curveRef.current = null
      setCurve(null)
      historyRef.current = new History<DocSnapshot>(HISTORY_LIMIT)
      editorRef.current = null
      floatingRef.current = null
      setEditor(null)
      setSize({ width: bitmap.width, height: bitmap.height })
      onSizeChange(bitmap.width, bitmap.height)
      layerCountRef.current = 1
      setLayers([{ id: 1, name: 'Background', bitmap }], 0)
      updateSelection(null)
      syncHistory()
    },
    [onSizeChange, setLayers, syncHistory, updateSelection],
  )

  const restore = useCallback(
    (snapshot: DocSnapshot) => {
      const { width, height } = snapshot.layers[0].bitmap
      setSize({ width, height })
      onSizeChange(width, height)
      setLayers([...snapshot.layers], snapshot.active)
      syncHistory()
    },
    [onSizeChange, setLayers, syncHistory],
  )

  /** Applies a whole-image operation to every layer as one undo step. */
  const applyToLayers = useCallback(
    (transform: (bitmap: Bitmap, bottom: boolean) => Bitmap) => {
      recordHistory(doc().clone())
      const next = currentLayers().map((layer, index) => ({ ...layer, bitmap: transform(layer.bitmap, index === 0) }))
      const { width, height } = next[0].bitmap
      setSize({ width, height })
      onSizeChange(width, height)
      setLayers(next, activeRef.current)
      syncHistory()
    },
    [currentLayers, doc, onSizeChange, recordHistory, setLayers, syncHistory],
  )

  /** Settles pending edits before the layer stack changes. */
  const settle = useCallback(() => {
    finishPolyline()
    commitFloating()
    updateSelection(null)
  }, [commitFloating, finishPolyline, updateSelection])

  /** Changes the layer stack as one undo step. */
  const changeLayers = useCallback(
    (next: Layer[], active: number) => {
      recordHistory(doc().clone())
      // `next` reuses layer objects that the snapshot just recorded by
      // reference; give the live active surface its own copy so painting it
      // later cannot reach back into the undo history.
      const isolated = next.map((layer, index) =>
        index === active ? { ...layer, bitmap: layer.bitmap.clone() } : layer,
      )
      setLayers(isolated, active)
    },
    [doc, recordHistory, setLayers],
  )

  /** Builds the document described by `rect`, keeping content at its image position. */
  const resizeTo = useCallback((source: Bitmap, rect: Rect, fill?: Rgba): Bitmap => {
    const width = Math.max(1, Math.round(rect.width))
    const height = Math.max(1, Math.round(rect.height))
    const next = new Bitmap(width, height, fill)
    blit(next, source, -Math.round(rect.x), -Math.round(rect.y))
    return next
  }, [])

  const applyCanvasResize = useCallback(
    (rect: Rect) => {
      finishPolyline()
      commitFloating()
      // The old selection/mask no longer matches the resized document.
      updateSelection(null)
      setLasso(null)
      // New area is white on the bottom layer and transparent above it.
      applyToLayers((bitmap, bottom) => resizeTo(bitmap, rect, bottom ? WHITE : undefined))
    },
    [applyToLayers, commitFloating, finishPolyline, resizeTo, updateSelection],
  )

  /** The image pixel at the top-left corner of the workspace, clamped into the image. */
  const visibleOrigin = useCallback((): Point => {
    const canvas = canvasRef.current
    const workspace = canvas?.closest('.workspace')
    if (!canvas || !(workspace instanceof HTMLElement)) return { x: 0, y: 0 }
    const canvasRect = canvas.getBoundingClientRect()
    const workspaceRect = workspace.getBoundingClientRect()
    const { width, height } = doc()
    if (canvasRect.width === 0 || canvasRect.height === 0) return { x: 0, y: 0 }
    const x = Math.ceil(((workspaceRect.left - canvasRect.left) * width) / canvasRect.width)
    const y = Math.ceil(((workspaceRect.top - canvasRect.top) * height) / canvasRect.height)
    return { x: Math.max(0, x), y: Math.max(0, y) }
  }, [doc])

  const pasteImage = useCallback(
    (pasted: Bitmap) => {
      finishPolyline()
      commitFloating()
      setLasso(null)
      const origin = visibleOrigin()
      const current = doc()
      const width = Math.max(current.width, pasted.width)
      const height = Math.max(current.height, pasted.height)
      if (width !== current.width || height !== current.height) {
        // Grow the canvas and lift the paste as a single undo step: the snapshot
        // taken by applyToLayers is the only one recorded.
        applyToLayers((bitmap, bottom) => resizeTo(bitmap, { x: 0, y: 0, width, height }, bottom ? WHITE : undefined))
      } else {
        recordHistory(current.clone())
      }
      const base = doc()
      const bitmap = transparentSelection
        ? extractRegion(pasted, { x: 0, y: 0, width: pasted.width, height: pasted.height }, secondary)
        : pasted.clone()
      const x = clamp(origin.x, 0, width - bitmap.width)
      const y = clamp(origin.y, 0, height - bitmap.height)
      floatingRef.current = { source: bitmap, bitmap, x, y, base }
      renderPreview()
      updateSelection({ x, y, width: bitmap.width, height: bitmap.height })
      syncHistory()
    },
    [
      applyToLayers,
      commitFloating,
      doc,
      finishPolyline,
      recordHistory,
      renderPreview,
      resizeTo,
      secondary,
      syncHistory,
      transparentSelection,
      updateSelection,
      visibleOrigin,
    ],
  )

  useImperativeHandle(
    ref,
    () => ({
      newDocument(width, height) {
        resetDocument(new Bitmap(width, height, WHITE))
      },
      loadBitmap(bitmap) {
        resetDocument(bitmap)
      },
      async loadDataUrl(src) {
        resetDocument(await bitmapFromDataUrl(src))
      },
      pasteBitmap(bitmap) {
        pasteImage(bitmap)
      },
      async pasteDataUrl(src) {
        pasteImage(await bitmapFromDataUrl(src))
      },
      clear() {
        finishPolyline()
        commitFloating()
        recordHistory(doc().clone())
        doc().fill(activeRef.current === 0 ? WHITE : TRANSPARENT)
        paint(doc())
        // The cleared canvas no longer matches any selection mask.
        updateSelection(null)
        syncHistory()
      },
      undo() {
        finishPolyline()
        if (floatingRef.current) {
          commitFloating()
          updateSelection(null)
        }
        const previous = historyRef.current.undo({ layers: currentLayers(), active: activeRef.current })
        if (previous) restore(previous)
      },
      redo() {
        finishPolyline()
        if (floatingRef.current) {
          commitFloating()
          updateSelection(null)
        }
        const next = historyRef.current.redo({ layers: currentLayers(), active: activeRef.current })
        if (next) restore(next)
      },
      toDataUrl() {
        finishPolyline()
        const offscreen = offscreenRef.current
        if (offscreen) return offscreen.toDataURL('image/png')
        return canvasRef.current?.toDataURL('image/png') ?? ''
      },
      getSize() {
        return { width: size.width, height: size.height }
      },
      flip(axis) {
        finishPolyline()
        const mirror = axis === 'horizontal' ? flipHorizontal : flipVertical
        const rect = currentRect()
        if (rect) {
          const floating = ensureFloating(rect)
          floating.bitmap = mirror(floating.bitmap)
          floating.source = mirror(floating.source)
          renderPreview()
          const selectionMask = maskRef.current
          updateSelection(
            { x: floating.x, y: floating.y, width: floating.bitmap.width, height: floating.bitmap.height },
            selectionMask ? flipMask(selectionMask, axis) : null,
          )
          return
        }
        applyToLayers((bitmap) => mirror(bitmap))
      },
      rotate(degrees) {
        finishPolyline()
        const start = beginRotation()
        if (start) {
          applyRotation(start, degrees)
          const floating = floatingRef.current
          if (floating) floating.source = floating.bitmap
          return
        }
        applyToLayers((bitmap, bottom) => rotateBy(bitmap, degrees, bottom ? secondary : null))
      },
      resize(width, height) {
        finishPolyline()
        commitFloating()
        // Scaling moves every pixel, so the old selection coordinates are stale.
        updateSelection(null)
        applyToLayers((bitmap) => scale(bitmap, width, height))
      },
      scale(width, height) {
        finishPolyline()
        const rect = currentRect()
        if (!rect) {
          this.resize(width, height)
          return
        }
        const floating = ensureFloating(rect)
        floating.bitmap = scale(floating.source, width, height)
        renderPreview()
        updateSelection({ x: floating.x, y: floating.y, width, height }, maskRef.current)
      },
      resizeCanvas(rect) {
        applyCanvasResize(rect)
      },
      invertColors() {
        finishPolyline()
        const floating = floatingRef.current
        if (floating) {
          floating.bitmap = invertBitmap(floating.bitmap)
          floating.source = invertBitmap(floating.source)
          renderPreview()
          return
        }
        const rect = selectionRef.current
        if (rect) {
          recordHistory(doc().clone())
          invertSelectedColors(doc(), rect, maskRef.current)
          paint(doc())
          syncHistory()
          return
        }
        applyToLayers((bitmap) => invertBitmap(bitmap))
      },
      cropToSelection() {
        finishPolyline()
        commitFloating()
        const rect = selectionRef.current
        if (!rect) return
        const selectionMask = maskRef.current
        applyToLayers((bitmap, bottom) => {
          const cropped = crop(bitmap, rect)
          if (!selectionMask) return cropped
          const local = { x: 0, y: 0, width: rect.width, height: rect.height }
          for (let y = 0; y < rect.height; y += 1) {
            for (let x = 0; x < rect.width; x += 1) {
              if (!isSelected(local, selectionMask, x, y)) cropped.set(x, y, bottom ? secondary : TRANSPARENT)
            }
          }
          return cropped
        })
        updateSelection(null)
      },
      getSelection() {
        return selectionRef.current
      },
      clearSelection() {
        commitFloating()
        updateSelection(null)
      },
      clickOutside(clientX, clientY) {
        clickOutsideRef.current(clientX, clientY)
      },
      selectAll() {
        finishPolyline()
        commitFloating()
        updateSelection({ x: 0, y: 0, width: doc().width, height: doc().height })
      },
      invertSelection() {
        finishPolyline()
        commitFloating()
        const inverted = invertSelection(selectionRef.current, maskRef.current, doc().width, doc().height)
        updateSelection(inverted?.rect ?? null, inverted?.mask ?? null)
      },
      deleteSelection() {
        finishPolyline()
        const floating = floatingRef.current
        if (floating) {
          floatingRef.current = null
          bitmapRef.current = floating.base
          paint(floating.base)
          syncHistory()
          updateSelection(null)
          return
        }
        const rect = selectionRef.current
        if (!rect) return
        recordHistory(doc().clone())
        fillSelection(doc(), rect, maskRef.current, eraseColor())
        paint(doc())
        syncHistory()
        updateSelection(null)
      },
      getSelectionDataUrl() {
        finishPolyline()
        const floating = floatingRef.current
        if (floating) {
          const composite = floating.base.clone()
          blitAlpha(composite, floating.bitmap, floating.x, floating.y)
          const region = crop(composite, {
            x: floating.x,
            y: floating.y,
            width: floating.bitmap.width,
            height: floating.bitmap.height,
          })
          return bitmapToDataUrl(maskRef.current ? applyMask(region, maskRef.current) : region)
        }
        const rect = selectionRef.current
        if (!rect) return null
        const region = crop(doc(), rect)
        return bitmapToDataUrl(maskRef.current ? applyMask(region, maskRef.current) : region)
      },
      getVisibleDataUrl() {
        finishPolyline()
        const floating = floatingRef.current
        let active = doc()
        if (floating) {
          active = floating.base.clone()
          blitAlpha(active, floating.bitmap, floating.x, floating.y)
        }
        const stack = currentLayers().map((layer, index) => (index === activeRef.current ? active : layer.bitmap))
        const flat = compositeLayers(stack) ?? active
        const rect = currentRect()
        if (!rect) return bitmapToDataUrl(flat)
        const region = crop(flat, rect)
        return bitmapToDataUrl(maskRef.current ? applyMask(region, maskRef.current) : region)
      },
      cutSelection() {
        finishPolyline()
        commitFloating()
        const rect = selectionRef.current
        if (!rect) return
        recordHistory(doc().clone())
        fillSelection(doc(), rect, maskRef.current, eraseColor())
        paint(doc())
        syncHistory()
      },
      addLayer() {
        settle()
        layerCountRef.current += 1
        const { width, height } = doc()
        const layer = { id: layerCountRef.current, name: `Layer ${layerCountRef.current}`, bitmap: new Bitmap(width, height) }
        const next = [...currentLayers()]
        next.splice(activeRef.current + 1, 0, layer)
        changeLayers(next, activeRef.current + 1)
      },
      deleteLayer(index) {
        // Settle first: a pending floating selection replaces the live bitmap,
        // so capturing the stack before that would drop the moved pixels.
        settle()
        const stack = currentLayers()
        if (stack.length < 2 || !stack[index]) return
        const active = activeRef.current
        const next = stack.filter((_, i) => i !== index)
        changeLayers(next, index < active || (index === active && active > 0) ? active - 1 : active)
      },
      moveLayer(from, to) {
        settle()
        const stack = currentLayers()
        if (!stack[from] || from === to) return
        const activeId = stack[activeRef.current].id
        const next = moveItem(stack, from, to)
        changeLayers(next, next.findIndex((layer) => layer.id === activeId))
      },
      selectLayer(index) {
        settle()
        const stack = currentLayers()
        if (!stack[index] || index === activeRef.current) return
        // The newly active bitmap is painted in place, so it must not be shared with any undo step.
        stack[index] = { ...stack[index], bitmap: stack[index].bitmap.clone() }
        setLayers(stack, index)
      },
    }),
    [
      applyCanvasResize,
      applyToLayers,
      changeLayers,
      currentLayers,
      restore,
      settle,
      setLayers,
      recordHistory,
      applyRotation,
      beginRotation,
      commitFloating,
      currentRect,
      doc,
      ensureFloating,
      eraseColor,
      finishPolyline,
      paint,
      pasteImage,
      renderPreview,
      resetDocument,
      secondary,
      size.width,
      size.height,
      syncHistory,
      updateSelection,
    ],
  )

  const toPoint = useCallback((event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = rect.width === 0 ? 1 : size.width / rect.width
    const scaleY = rect.height === 0 ? 1 : size.height / rect.height
    return clampPoint(
      { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY },
      size.width,
      size.height,
    )
  }, [size.width, size.height])

  // Resize handles sit on the far edges, so their pointer may reach x=width or
  // y=height; clampPoint would cap it one pixel short and shrink the selection.
  const toEdgePoint = useCallback((event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = rect.width === 0 ? 1 : size.width / rect.width
    const scaleY = rect.height === 0 ? 1 : size.height / rect.height
    return {
      x: clamp((event.clientX - rect.left) * scaleX, 0, size.width),
      y: clamp((event.clientY - rect.top) * scaleY, 0, size.height),
    }
  }, [size.width, size.height])

  const commitText = useCallback(() => {
    const current = editorRef.current
    if (!current) return
    editorRef.current = null
    setEditor(null)
    if (current.value.trim().length === 0) return
    const rendered = renderText(current.value, {
      ...text,
      color: colorFor(current.slot),
      maxWidth: current.width,
    })
    if (!rendered) return
    recordHistory(doc().clone())
    blitAlpha(doc(), rendered, current.x, current.y)
    paint(doc())
    syncHistory()
  }, [colorFor, doc, recordHistory, paint, syncHistory, text])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0 && event.button !== 2) return
      // A right-click always opens the workspace context menu and no tool acts on
      // it: no secondary-colour paint, no zoom-out, no colour pick. The canvas
      // `onContextMenu` swallows the native menu.
      if (event.button === 2) return
      if (tool === 'eraser') setEraserHover(toPoint(event))
      if (editorRef.current) {
        commitText()
        return
      }
      event.preventDefault()
      const point = toPoint(event)
      const slot: 'primary' | 'secondary' = 'primary'

      if (tool === 'select') {
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        const rect = currentRect()
        const handle = rect ? hitHandle(rect, point, HANDLE_HIT / zoom) : null
        if (rect && handle) {
          selectRef.current = { pointerId: event.pointerId, mode: 'resize', start: point, handle, origin: rect }
          return
        }
        if (rect && pointInRect(point, rect)) {
          selectRef.current = { pointerId: event.pointerId, mode: 'move', start: point, origin: rect }
          return
        }
        commitFloating()
        if (selectionShape === 'freeform') {
          selectRef.current = { pointerId: event.pointerId, mode: 'lasso', start: point, points: [point] }
          updateSelection(null)
          setLasso([point])
          return
        }
        selectRef.current = { pointerId: event.pointerId, mode: 'marquee', start: point }
        updateSelection(clampRect(normalizeRect(point, point), size.width, size.height))
        return
      }
      if (tool === 'zoom') {
        onZoomClick(1)
        return
      }
      if (tool === 'picker') {
        const flat = compositeLayers(currentLayers().map((layer) => layer.bitmap)) ?? doc()
        onPickColor(flat.get(point.x, point.y), slot)
        return
      }
      if (tool === 'fill') {
        const color = colorFor(slot)
        if (colorsEqual(doc().get(point.x, point.y), color)) return
        recordHistory(doc().clone())
        floodFill(doc(), point, color)
        paint(doc())
        syncHistory()
        return
      }
      if (tool === 'text') {
        // The box opens on release, sized by the drag (or at the default size for a click).
        event.currentTarget.setPointerCapture?.(event.pointerId)
        textPlaceRef.current = { pointerId: event.pointerId, start: point }
        return
      }

      event.currentTarget.setPointerCapture(event.pointerId)
      if (isShapeTool(tool) && shapeById(shapeKind).interaction === 'polyline') {
        const now = performance.now()
        const polyline = polylineRef.current
        if (!polyline) {
          polylineRef.current = {
            kind: shapeKind,
            slot,
            base: doc().clone(),
            points: [point],
            pending: point,
            pointerId: event.pointerId,
            lastDown: { time: now, point },
          }
          setPolylineActive(true)
          previewPolyline()
          return
        }
        const { lastDown } = polyline
        if (now - lastDown.time <= DOUBLE_CLICK_MS && distance(lastDown.point, point) <= DOUBLE_CLICK_SLOP / zoom) {
          finishPolyline()
          return
        }
        polyline.lastDown = { time: now, point }
        polyline.pointerId = event.pointerId
        polyline.pending = point
        previewPolyline()
        return
      }
      if (isShapeTool(tool) && shapeById(shapeKind).interaction === 'curve') {
        const curve = curveRef.current
        if (curve) {
          // A pending curve is only retargeted by grabbing one of its four dots.
          if (curve.phase !== 'bend') return
          const tolerance = CURVE_DOT_HIT / zoom
          const candidates: { handle: 'p0' | 'p3' | 'c1' | 'c2'; dot: Point }[] = [
            { handle: 'p0', dot: curve.p0 },
            { handle: 'p3', dot: curve.p3 },
            { handle: 'c1', dot: curve.c1 },
            { handle: 'c2', dot: curve.c2 },
          ]
          // The nearest dot wins, so a press exactly on an endpoint never grabs the
          // adjacent control handle that overlaps it.
          let active: 'p0' | 'p3' | 'c1' | 'c2' | null = null
          let best = Infinity
          for (const candidate of candidates) {
            const reach = distance(point, candidate.dot)
            if (reach <= tolerance && reach < best) {
              best = reach
              active = candidate.handle
            }
          }
          if (active) {
            curve.pointerId = event.pointerId
            curve.active = active
            return
          }
          // A press outside the dots places the pending curve, then starts the next.
          commitCurve()
        }
        curveRef.current = {
          kind: shapeKind,
          slot,
          base: doc().clone(),
          p0: point,
          p3: point,
          c1: point,
          c2: point,
          phase: 'line',
          pointerId: event.pointerId,
          active: null,
        }
        setCurve({ phase: 'line', p0: point, p3: point, c1: point, c2: point })
        return
      }
      const base = doc().clone()
      const stroke: StrokeState = {
        pointerId: event.pointerId,
        slot,
        tool,
        kind: shapeKind,
        start: point,
        last: point,
        base,
        recorded: false,
        points: [point],
        strength,
      }
      strokeRef.current = stroke

      if (isShapeTool(tool)) {
        paint(base)
      } else {
        recordHistory(base)
        stroke.recorded = true
        if (strength < 1) stroke.work = base.clone()
        const target = stroke.work ?? doc()
        const color = tool === 'eraser' ? eraseColor() : strokeColorFor(tool, slot, primary, secondary)
        const width = strokeWidthFor(tool, brushSize)
        if (tool === 'airbrush') {
          sprayDab(target, point, width, color, random)
        } else if (tool === 'brush' && brush === 'highlighter') {
          const mask = createCoverageMask(base.width, base.height)
          stampHighlighter(mask, point, point, width)
          stroke.highlighter = mask
          const result = compositeHighlighter(base, mask, color, HIGHLIGHTER_ALPHA)
          if (stroke.work) stroke.work = result
          else bitmapRef.current = result
        } else if (tool === 'brush') {
          paintBrushStroke(target, point, point, { size: width, color, brush, random, source: base })
          if (brush === 'spray') {
            stopSpraying()
            sprayTimerRef.current = window.setInterval(() => {
              const current = strokeRef.current
              if (current !== stroke) {
                stopSpraying()
                return
              }
              const surface = stroke.work ?? doc()
              sprayDab(surface, stroke.last, width, color, random, sprayCanDots(width))
              if (stroke.work) {
                blendToward(doc(), stroke.base, stroke.work, stroke.strength, segmentBounds(stroke.last, stroke.last, width))
              }
              paint(doc())
            }, SPRAY_TICK_MS)
          }
        } else {
          stamp(target, point.x, point.y, width, color, strokeShape(tool))
        }
        if (stroke.work) blendToward(doc(), base, stroke.work, strength, segmentBounds(point, point, width))
        paint(doc())
        syncHistory()
      }
    },
    [brush, brushSize, colorFor, commitCurve, commitFloating, commitText, currentLayers, currentRect, doc, eraseColor, finishPolyline, onPickColor, onZoomClick, paint, previewPolyline, primary, random, recordHistory, secondary, selectionShape, shapeKind, size.height, size.width, stopSpraying, strength, syncHistory, toPoint, tool, updateSelection, zoom],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const point = toPoint(event)
      onCursorMove(point)
      if (tool === 'eraser') setEraserHover((last) => (last && pointsEqual(last, point) ? last : point))
      if (tool === 'select' && !selectRef.current) {
        const rect = currentRect()
        const handle = rect ? hitHandle(rect, point, HANDLE_HIT / zoom) : null
        setHoverCursor(
          handle ? handleCursor(handle) : rect && pointInRect(point, rect) ? 'move' : null,
        )
      }
      const place = textPlaceRef.current
      if (place && place.pointerId === event.pointerId) {
        setTextDraft(clampRect(normalizeRect(place.start, point), size.width, size.height))
        return
      }
      const drag = selectRef.current
      if (drag && drag.pointerId === event.pointerId) {
        if (drag.mode === 'marquee') {
          updateSelection(clampRect(normalizeRect(drag.start, point), size.width, size.height))
          return
        }
        if (drag.mode === 'lasso') {
          drag.points = [...(drag.points ?? []), point]
          setLasso(drag.points)
          return
        }
        const origin = drag.origin
        if (!origin) return
        const floating = ensureFloating(origin)
        if (drag.mode === 'move') {
          const spareX = size.width - floating.bitmap.width
          const spareY = size.height - floating.bitmap.height
          const x = clamp(
            origin.x + (point.x - drag.start.x),
            Math.min(0, spareX, origin.x),
            Math.max(0, spareX, origin.x),
          )
          const y = clamp(
            origin.y + (point.y - drag.start.y),
            Math.min(0, spareY, origin.y),
            Math.max(0, spareY, origin.y),
          )
          floating.x = x
          floating.y = y
          renderPreview()
          updateSelection({ x, y, width: floating.bitmap.width, height: floating.bitmap.height }, maskRef.current)
          return
        }
        if (drag.mode === 'resize' && drag.handle) {
          const next = resizeRect(origin, drag.handle, toEdgePoint(event), size.width, size.height)
          floating.bitmap = scale(floating.source, next.width, next.height)
          floating.x = next.x
          floating.y = next.y
          renderPreview()
          updateSelection(next, maskRef.current)
          return
        }
        return
      }
      const polyline = polylineRef.current
      if (polyline) {
        if (polyline.pointerId !== null && polyline.pointerId !== event.pointerId) return
        polyline.pending = point
        previewPolyline()
        return
      }
      const curve = curveRef.current
      if (curve) {
        if (curve.pointerId === null || curve.pointerId !== event.pointerId) return
        if (curve.phase === 'line') {
          curve.p3 = point
          const thirdX = (point.x - curve.p0.x) / 3
          const thirdY = (point.y - curve.p0.y) / 3
          curve.c1 = { x: curve.p0.x + thirdX, y: curve.p0.y + thirdY }
          curve.c2 = { x: curve.p0.x + 2 * thirdX, y: curve.p0.y + 2 * thirdY }
        } else if (curve.active === 'c1') {
          curve.c1 = point
        } else if (curve.active === 'c2') {
          curve.c2 = point
        } else if (curve.active === 'p0') {
          // Moving an endpoint carries its adjacent handle along, preserving the tangent.
          const dx = point.x - curve.p0.x
          const dy = point.y - curve.p0.y
          curve.p0 = point
          curve.c1 = { x: curve.c1.x + dx, y: curve.c1.y + dy }
        } else if (curve.active === 'p3') {
          const dx = point.x - curve.p3.x
          const dy = point.y - curve.p3.y
          curve.p3 = point
          curve.c2 = { x: curve.c2.x + dx, y: curve.c2.y + dy }
        } else {
          return
        }
        previewCurve()
        return
      }
      const stroke = strokeRef.current
      if (!stroke || stroke.pointerId !== event.pointerId) return
      if (isShapeTool(stroke.tool)) {
        if (!stroke.recorded) {
          recordHistory(stroke.base.clone())
          stroke.recorded = true
          syncHistory()
        }
        stroke.points.push(point)
        const preview = stroke.base.clone()
        renderShape(preview, stroke.kind, shapePoints(stroke, point), stroke.slot)
        paint(preview)
      } else {
        const color = stroke.tool === 'eraser' ? eraseColor() : strokeColorFor(stroke.tool, stroke.slot, primary, secondary)
        const width = strokeWidthFor(stroke.tool, brushSize)
        const target = stroke.work ?? doc()
        if (stroke.tool === 'airbrush') {
          sprayDab(target, point, width, color, random)
        } else if (stroke.tool === 'brush' && brush === 'highlighter' && stroke.highlighter) {
          stampHighlighter(stroke.highlighter, stroke.last, point, width)
          const result = compositeHighlighter(stroke.base, stroke.highlighter, color, HIGHLIGHTER_ALPHA)
          if (stroke.work) stroke.work = result
          else bitmapRef.current = result
        } else if (stroke.tool === 'brush') {
          paintBrushStroke(target, stroke.last, point, { size: width, color, brush, random, source: stroke.base })
        } else {
          drawLine(target, stroke.last, point, width, color, strokeShape(stroke.tool))
        }
        if (stroke.work) {
          blendToward(doc(), stroke.base, stroke.work, stroke.strength, segmentBounds(stroke.last, point, width))
        }
        paint(doc())
      }
      stroke.last = point
    },
    [brush, brushSize, currentRect, doc, ensureFloating, eraseColor, onCursorMove, paint, previewCurve, previewPolyline, primary, random, recordHistory, renderPreview, renderShape, secondary, size.height, size.width, syncHistory, toEdgePoint, toPoint, tool, updateSelection, zoom],
  )

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const place = textPlaceRef.current
      if (place && place.pointerId === event.pointerId) {
        textPlaceRef.current = null
        setTextDraft(null)
        if (event.type === 'pointercancel') return
        const lineHeight = Math.round(text.fontSize * TEXT_LINE_HEIGHT) + 4
        const rect = placeTextBox(place.start, toPoint(event), TEXT_DRAG_SLOP / zoom, lineHeight, size.width, size.height)
        const next: TextEditorState = { ...rect, value: '', slot: 'primary' }
        editorRef.current = next
        setEditor(next)
        return
      }
      const drag = selectRef.current
      if (drag && drag.pointerId === event.pointerId) {
        if (drag.mode === 'marquee') {
          const rect = clampRect(normalizeRect(drag.start, toPoint(event)), size.width, size.height)
          if (rect.width < 2 && rect.height < 2) updateSelection(null)
          else updateSelection(rect)
        }
        if (drag.mode === 'lasso') {
          const traced = polygonSelection(drag.points ?? [], size.width, size.height)
          updateSelection(traced?.rect ?? null, traced?.mask ?? null)
          setLasso(null)
        }
        selectRef.current = null
        return
      }
      const polyline = polylineRef.current
      if (polyline) {
        if (polyline.pointerId !== event.pointerId) return
        const end = toPoint(event)
        if (!pointsEqual(end, polyline.points[polyline.points.length - 1])) polyline.points.push(end)
        polyline.pointerId = null
        polyline.pending = end
        previewPolyline()
        return
      }
      const curve = curveRef.current
      if (curve) {
        if (curve.pointerId !== event.pointerId) return
        if (curve.phase === 'line') {
          const end = toPoint(event)
          if (distance(end, curve.p0) * zoom < CURVE_CLICK_SLOP) {
            cancelCurve()
            return
          }
          curve.p3 = end
          const thirdX = (end.x - curve.p0.x) / 3
          const thirdY = (end.y - curve.p0.y) / 3
          curve.c1 = { x: curve.p0.x + thirdX, y: curve.p0.y + thirdY }
          curve.c2 = { x: curve.p0.x + 2 * thirdX, y: curve.p0.y + 2 * thirdY }
          curve.phase = 'bend'
        }
        curve.active = null
        curve.pointerId = null
        previewCurve()
        return
      }
      const stroke = strokeRef.current
      if (!stroke || stroke.pointerId !== event.pointerId) return
      stopSpraying()
      if (isShapeTool(stroke.tool) && stroke.recorded) {
        const end = toPoint(event)
        if (!pointsEqual(end, stroke.points[stroke.points.length - 1])) stroke.points.push(end)
        const final = stroke.base.clone()
        renderShape(final, stroke.kind, shapePoints(stroke, end), stroke.slot)
        bitmapRef.current = final
        paint(final)
        syncHistory()
      } else if (stroke.recorded) {
        // Freehand strokes paint in place; refresh the layer thumbnails once they are done.
        publishLayers()
      }
      strokeRef.current = null
    },
    [cancelCurve, paint, previewCurve, previewPolyline, publishLayers, renderShape, size.height, size.width, stopSpraying, syncHistory, text.fontSize, toPoint, updateSelection, zoom],
  )

  const clientToCanvas = useCallback((clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: rect.width === 0 ? 0 : ((clientX - rect.left) * size.width) / rect.width,
      y: rect.height === 0 ? 0 : ((clientY - rect.top) * size.height) / rect.height,
    }
  }, [size.width, size.height])

  // Clicking the workspace background settles pending edits and deselects, but
  // never while a canvas drag is running or on a handle poking past the image.
  const handleClickOutside = useCallback(
    (clientX: number, clientY: number) => {
      if (selectRef.current) return
      const rect = currentRect()
      if (rect && hitHandle(rect, clientToCanvas(clientX, clientY), HANDLE_HIT / zoom)) return
      commitCurve()
      commitText()
      commitFloating()
      updateSelection(null)
    },
    [clientToCanvas, commitCurve, commitFloating, commitText, currentRect, updateSelection, zoom],
  )
  useEffect(() => {
    clickOutsideRef.current = handleClickOutside
  }, [handleClickOutside])

  const handleRotateDown = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      const rotation = beginRotation()
      if (!rotation) return
      event.currentTarget.setPointerCapture?.(event.pointerId)
      const start = clientToCanvas(event.clientX, event.clientY)
      selectRef.current = { pointerId: event.pointerId, mode: 'rotate', start, rotation }
    },
    [beginRotation, clientToCanvas],
  )

  const handleRotateMove = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      const drag = selectRef.current
      if (!drag || drag.mode !== 'rotate' || drag.pointerId !== event.pointerId || !drag.rotation) return
      event.stopPropagation()
      const { center } = drag.rotation
      const point = clientToCanvas(event.clientX, event.clientY)
      const radians = pointerAngle(center, point) - pointerAngle(center, drag.start)
      applyRotation(drag.rotation, (radians * 180) / Math.PI)
    },
    [applyRotation, clientToCanvas],
  )

  const handleRotateUp = useCallback((event: ReactPointerEvent<HTMLSpanElement>) => {
    const drag = selectRef.current
    if (!drag || drag.mode !== 'rotate' || drag.pointerId !== event.pointerId) return
    event.stopPropagation()
    const floating = floatingRef.current
    if (floating) floating.source = floating.bitmap
    selectRef.current = null
  }, [])

  const handleCanvasResizeDown = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>, handle: SelectionHandle) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      const frame = event.currentTarget.closest('.canvas-frame')
      if (!(frame instanceof HTMLElement)) return
      const rect = frame.getBoundingClientRect()
      finishPolyline()
      commitFloating()
      const { width, height } = doc()
      const source = { layers: currentLayers(), active: activeRef.current }
      source.layers[source.active] = { ...source.layers[source.active], bitmap: doc().clone() }
      event.currentTarget.setPointerCapture?.(event.pointerId)
      canvasResizeRef.current = {
        pointerId: event.pointerId,
        handle,
        source,
        frameLeft: rect.left,
        frameTop: rect.top,
        startWidth: width,
        startHeight: height,
        startPan: pan,
        recorded: false,
      }
    },
    [commitFloating, currentLayers, doc, finishPolyline, pan],
  )

  const handleCanvasResizeMove = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      const drag = canvasResizeRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      event.stopPropagation()
      const scale = zoom || 1
      let left = 0
      let top = 0
      let right = drag.startWidth
      let bottom = drag.startHeight
      if (drag.handle.includes('w')) left = Math.round((event.clientX - drag.frameLeft) / scale)
      if (drag.handle.includes('e')) right = Math.round((event.clientX - drag.frameLeft) / scale)
      if (drag.handle.includes('n')) top = Math.round((event.clientY - drag.frameTop) / scale)
      if (drag.handle.includes('s')) bottom = Math.round((event.clientY - drag.frameTop) / scale)
      if (drag.handle.includes('w')) left = clamp(left, right - MAX_CANVAS, right - 1)
      else if (drag.handle.includes('e')) right = clamp(right, left + 1, left + MAX_CANVAS)
      if (drag.handle.includes('n')) top = clamp(top, bottom - MAX_CANVAS, bottom - 1)
      else if (drag.handle.includes('s')) bottom = clamp(bottom, top + 1, top + MAX_CANVAS)

      if (!drag.recorded) {
        historyRef.current.record(drag.source)
        drag.recorded = true
        syncHistory()
      }

      const rect = { x: left, y: top, width: right - left, height: bottom - top }
      const next = drag.source.layers.map((layer, index) => ({
        ...layer,
        bitmap: resizeTo(layer.bitmap, rect, index === 0 ? WHITE : undefined),
      }))
      setSize({ width: next[0].bitmap.width, height: next[0].bitmap.height })
      onSizeChange(next[0].bitmap.width, next[0].bitmap.height)
      setLayers(next, drag.source.active)

      // Keep the edge opposite the dragged handle pinned on screen.
      if (onPanChange) {
        let px = drag.startPan.x
        let py = drag.startPan.y
        if (drag.handle.includes('w')) px = drag.startPan.x + (left * scale) / 2
        else if (drag.handle.includes('e')) px = drag.startPan.x + ((right - drag.startWidth) * scale) / 2
        if (drag.handle.includes('n')) py = drag.startPan.y + (top * scale) / 2
        else if (drag.handle.includes('s')) py = drag.startPan.y + ((bottom - drag.startHeight) * scale) / 2
        onPanChange({ x: px, y: py })
      }
    },
    [onPanChange, onSizeChange, resizeTo, setLayers, syncHistory, zoom],
  )

  const handleCanvasResizeUp = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      const drag = canvasResizeRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      event.stopPropagation()
      canvasResizeRef.current = null
      syncHistory()
    },
    [syncHistory],
  )

  const handlePointerLeave = useCallback(() => {
    onCursorMove(null)
    setEraserHover(null)
    const polyline = polylineRef.current
    if (polyline && polyline.pointerId === null) {
      polyline.pending = null
      previewPolyline()
    }
  }, [onCursorMove, previewPolyline])

  const keepTextFocus = useCallback(
    (event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>) => {
      if ((event.target as HTMLElement).tagName === 'INPUT') return
      event.preventDefault()
      event.stopPropagation()
    },
    [],
  )

  const handleTextHandleDown = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>, handle: SelectionHandle) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      if (!editorRef.current) return
      event.currentTarget.setPointerCapture?.(event.pointerId)
      textResizeRef.current = { pointerId: event.pointerId, handle }
    },
    [],
  )

  const handleTextHandleMove = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      const drag = textResizeRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const current = editorRef.current
      if (!current) return
      const point = clientToCanvas(event.clientX, event.clientY)
      const next = resizeTextBox(current, drag.handle, point, size.width, size.height)
      const updated = { ...current, ...next }
      editorRef.current = updated
      setEditor(updated)
    },
    [clientToCanvas, size.width, size.height],
  )

  const handleTextHandleUp = useCallback((event: ReactPointerEvent<HTMLSpanElement>) => {
    const drag = textResizeRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    textResizeRef.current = null
  }, [])

  const editorOpen = editor !== null

  useEffect(() => {
    if (!editorOpen) return
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (textareaRef.current?.contains(target)) return
      if (textToolbarRef.current?.contains(target)) return
      if (textOverlayRef.current?.contains(target)) return
      commitText()
    }
    // Attach one tick later so the browser's compatibility `mousedown` for the
    // pointerdown that opened the editor cannot immediately commit it.
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', handleOutside)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mousedown', handleOutside)
    }
  }, [editorOpen, commitText])

  const textToolbarPosition = editor
    ? (() => {
        const frameWidth = size.width * zoom
        const frameHeight = size.height * zoom
        const left = clamp(editor.x * zoom, 0, Math.max(0, frameWidth - TEXT_TOOLBAR_WIDTH))
        const above = editor.y * zoom - TEXT_TOOLBAR_HEIGHT - TEXT_TOOLBAR_GAP
        const top =
          above >= 0
            ? above
            : Math.min(
                Math.max(0, frameHeight - TEXT_TOOLBAR_HEIGHT),
                (editor.y + editor.height) * zoom + TEXT_TOOLBAR_GAP,
              )
        return { left, top }
      })()
    : null

  // Open the font menu upward when it would otherwise be clipped by the
  // workspace bottom, preferring whichever side has more room.
  const textMenuPlacement: 'up' | 'down' =
    editor && textToolbarPosition
      ? (() => {
          const frameHeight = size.height * zoom
          const toolbarBottom = textToolbarPosition.top + TEXT_TOOLBAR_HEIGHT
          const roomBelow = frameHeight - toolbarBottom
          const roomAbove = textToolbarPosition.top
          return roomBelow < TEXT_MENU_HEIGHT && roomAbove > roomBelow ? 'up' : 'down'
        })()
      : 'down'

  const cursor =
    tool === 'text' ? 'text' : tool === 'fill' ? 'cell' : tool === 'picker' ? 'copy' : tool === 'zoom' ? 'zoom-in' : tool === 'select' ? (hoverCursor ?? 'crosshair') : 'crosshair'

  return (
    <>
      <div
        className="canvas-frame"
        style={{
          width: size.width * zoom,
          height: size.height * zoom,
          transform: `translate(${pan.x}px, ${pan.y}px)`,
        }}
      >
      <canvas
        ref={canvasRef}
        className="paint-canvas"
        style={{ width: '100%', height: '100%', cursor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onContextMenu={(event) => event.preventDefault()}
      />
      {showGrid && zoom >= 4 ? (
        <div
          className="grid-overlay"
          aria-hidden="true"
          style={{ backgroundSize: `${zoom}px ${zoom}px` }}
        />
      ) : null}
      {tool === 'eraser' && eraserHover ? (
        <EraserPreview
          rect={eraserPreviewRect(eraserHover, strokeWidthFor('eraser', brushSize), zoom, pixelRatio, size.width, size.height)}
          color={secondary}
        />
      ) : null}
      {selection ? (
        <div
          className="selection-overlay"
          aria-hidden="true"
          style={{
            left: selection.x * zoom,
            top: selection.y * zoom,
            width: selection.width * zoom,
            height: selection.height * zoom,
          }}
        >
          {mask ? <MaskOutline mask={mask} /> : null}
          {SELECTION_HANDLES.map((handle) => (
            <span key={handle} className={`selection-handle selection-handle-${handle}`} />
          ))}
          <span className="selection-rotate-line" />
          <span
            className="selection-rotate-handle"
            title="Rotate"
            onPointerDown={handleRotateDown}
            onPointerMove={handleRotateMove}
            onPointerUp={handleRotateUp}
            onPointerCancel={handleRotateUp}
          />
        </div>
      ) : null}
      {textDraft ? (
        <div
          className="selection-overlay text-draft"
          aria-hidden="true"
          style={{
            left: textDraft.x * zoom,
            top: textDraft.y * zoom,
            width: textDraft.width * zoom,
            height: textDraft.height * zoom,
          }}
        />
      ) : null}
      {lasso ? (
        <svg
          className="lasso-overlay"
          aria-hidden="true"
          width={size.width * zoom}
          height={size.height * zoom}
        >
          <polyline
            points={lasso.map((point) => `${(point.x + 0.5) * zoom},${(point.y + 0.5) * zoom}`).join(' ')}
          />
        </svg>
      ) : null}
      {curve && curve.phase === 'bend' ? (
        <svg
          className="curve-overlay"
          aria-hidden="true"
          width={size.width * zoom}
          height={size.height * zoom}
        >
          <line
            className="curve-guide"
            x1={(curve.p0.x + 0.5) * zoom}
            y1={(curve.p0.y + 0.5) * zoom}
            x2={(curve.c1.x + 0.5) * zoom}
            y2={(curve.c1.y + 0.5) * zoom}
          />
          <line
            className="curve-guide"
            x1={(curve.p3.x + 0.5) * zoom}
            y1={(curve.p3.y + 0.5) * zoom}
            x2={(curve.c2.x + 0.5) * zoom}
            y2={(curve.c2.y + 0.5) * zoom}
          />
          <circle className="curve-endpoint" cx={(curve.p0.x + 0.5) * zoom} cy={(curve.p0.y + 0.5) * zoom} r={4.5} />
          <circle className="curve-endpoint" cx={(curve.p3.x + 0.5) * zoom} cy={(curve.p3.y + 0.5) * zoom} r={4.5} />
          <circle className="curve-handle" cx={(curve.c1.x + 0.5) * zoom} cy={(curve.c1.y + 0.5) * zoom} r={4.5} />
          <circle className="curve-handle" cx={(curve.c2.x + 0.5) * zoom} cy={(curve.c2.y + 0.5) * zoom} r={4.5} />
        </svg>
      ) : null}
      {editor && textToolbarPosition ? (
        <div
          ref={textToolbarRef}
          className="text-toolbar"
          role="toolbar"
          aria-label="Text options"
          style={{ left: textToolbarPosition.left, top: textToolbarPosition.top }}
          onPointerDown={keepTextFocus}
          onMouseDown={keepTextFocus}
        >
          <Dropdown
            title="Font"
            ariaLabel="Font"
            placement={textMenuPlacement}
            trigger={<span className="text-option-value">{fontLabel(text.fontFamily)}</span>}
          >
            {(close) => (
              <>
                {FONT_FAMILIES.map((font) => (
                  <MenuItem
                    key={font.label}
                    checked={text.fontFamily === font.value}
                    onClick={() => {
                      onTextChange({ fontFamily: font.value })
                      close()
                    }}
                  >
                    {font.label}
                  </MenuItem>
                ))}
              </>
            )}
          </Dropdown>
          <input
            type="number"
            className="text-size-input"
            min={8}
            max={200}
            value={text.fontSize}
            aria-label="Text size"
            onChange={(event) => {
              const value = Number(event.target.value)
              if (Number.isFinite(value) && value > 0) onTextChange({ fontSize: Math.min(200, Math.round(value)) })
            }}
          />
          <button
            type="button"
            className="icon-button text-format-button"
            aria-label="Bold"
            aria-pressed={text.bold}
            onClick={() => onTextChange({ bold: !text.bold })}
          >
            <span className="text-format-glyph glyph-bold">B</span>
          </button>
          <button
            type="button"
            className="icon-button text-format-button"
            aria-label="Italic"
            aria-pressed={text.italic}
            onClick={() => onTextChange({ italic: !text.italic })}
          >
            <span className="text-format-glyph glyph-italic">I</span>
          </button>
          <button
            type="button"
            className="icon-button text-format-button"
            aria-label="Underline"
            aria-pressed={text.underline}
            onClick={() => onTextChange({ underline: !text.underline })}
          >
            <span className="text-format-glyph glyph-underline">U</span>
          </button>
        </div>
      ) : null}
      {editor ? (
        <textarea
          ref={textareaRef}
          className="text-editor"
          autoFocus
          spellCheck={false}
          value={editor.value}
          style={{
            left: editor.x * zoom,
            top: editor.y * zoom,
            width: editor.width * zoom,
            height: editor.height * zoom,
            fontFamily: text.fontFamily,
            fontSize: text.fontSize * zoom,
            fontWeight: text.bold ? 700 : 400,
            fontStyle: text.italic ? 'italic' : 'normal',
            textDecoration: text.underline ? 'underline' : 'none',
            lineHeight: TEXT_LINE_HEIGHT,
            color: toCss(colorFor(editor.slot)),
          }}
          onChange={(event) => {
            const next = { ...editor, value: event.target.value }
            editorRef.current = next
            setEditor(next)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              editorRef.current = null
              setEditor(null)
            } else if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              commitText()
            }
          }}
        />
      ) : null}
      {editor ? (
        <div
          ref={textOverlayRef}
          className="text-overlay"
          aria-hidden="true"
          style={{
            left: editor.x * zoom,
            top: editor.y * zoom,
            width: editor.width * zoom,
            height: editor.height * zoom,
          }}
        >
          {SELECTION_HANDLES.map((handle) => (
            <span
              key={handle}
              className={`selection-handle text-handle text-handle-${handle}`}
              style={{ cursor: handleCursor(handle) }}
              onPointerDown={(event) => handleTextHandleDown(event, handle)}
              onPointerMove={handleTextHandleMove}
              onPointerUp={handleTextHandleUp}
              onPointerCancel={handleTextHandleUp}
            />
          ))}
        </div>
      ) : null}
      {selection === null && lasso === null ? (
        <div className="canvas-resize-handles">
          {SELECTION_HANDLES.map((handle) => (
            <span
              key={handle}
              className={`canvas-resize-handle canvas-resize-handle-${handle}`}
              title="Resize canvas"
              onPointerDown={(event) => handleCanvasResizeDown(event, handle)}
              onPointerMove={handleCanvasResizeMove}
              onPointerUp={handleCanvasResizeUp}
              onPointerCancel={handleCanvasResizeUp}
            />
          ))}
        </div>
      ) : null}
      </div>
      {showMiniature ? (
        <div
          className="miniature-view"
          role="group"
          aria-label="Miniature view"
          onPointerDown={handleMiniatureDown}
          onPointerMove={handleMiniatureMove}
        >
          <canvas ref={miniatureRef} className="miniature-canvas" aria-hidden="true" />
          {viewport ? (
            <span
              className="miniature-viewport"
              aria-hidden="true"
              style={{
                left: `${(viewport.x / size.width) * 100}%`,
                top: `${(viewport.y / size.height) * 100}%`,
                width: `${(viewport.width / size.width) * 100}%`,
                height: `${(viewport.height / size.height) * 100}%`,
              }}
            />
          ) : null}
        </div>
      ) : null}
    </>
  )
})
