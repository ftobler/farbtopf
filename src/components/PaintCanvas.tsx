import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { Bitmap } from '../core/bitmap'
import { blurSelection, gaussianBlur } from '../core/blur'
import {
  HIGHLIGHTER_ALPHA,
  compositeHighlighterInto,
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
import { clamp, clampPoint, distance, distanceToSegment, floorPoint, normalizeRect, pointInRect, pointsEqual } from '../core/geometry'
import { History } from '../core/history'
import { compositeLayers, drawOver, moveItem, snapshotBytes, stackBytes, thumbnail } from '../core/layers'
import type { Layer, LayerInfo } from '../core/layers'
import {
  blit,
  blitAlpha,
  blitAlphaRotated,
  crop,
  drawLine,
  extractRegion,
  fitWithin,
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
import { canvasCursor } from '../core/toolCursor'
import { blendToward } from '../core/opacity'
import type { Random } from '../core/random'
import type { BrushShape } from '../core/raster'
import { ROTATE_HANDLE_OFFSET, rectCentre, rotationToward, unrotateAround } from '../core/rotation'
import {
  applyMask,
  fillSelection,
  invertSelectedColors,
  invertSelection,
  isSelected,
  polygonSelection,
} from '../core/selection'
import type { SelectionMask, SelectionShape } from '../core/selection'
import { shapeById } from '../core/shapes'
import type { ShapeKind } from '../core/shapes'
import type { ShapeFill, ToolId } from '../core/tools'
import { isShapeTool, rightClickActs, strokeColorFor, strokeWidthFor } from '../core/tools'
import { backingScale } from '../core/zoom'
import { useDevicePixelRatio } from '../hooks/useDevicePixelRatio'
import { bitmapFromDataUrl } from '../render/image'
import { insertShape, moveShapeHandle, renderLiveShape, shapeHandles } from '../core/tweaks'
import type { DragModifiers } from '../core/dragConstraint'
import { constrainDrag, dragLineEnd, dragModeFor, dragModifiers, keepAspect } from '../core/dragConstraint'
import { blendSubpixel, textRenderMode } from '../core/textRaster'
import { DEFAULT_TEXT_OPTIONS, FONT_FAMILIES, TEXT_LINE_HEIGHT, renderText, renderTextSubpixel } from '../render/text'
import type { TextOptions } from '../render/text'
import { Dropdown, MenuItem } from './Dropdown'
import { AntialiasIcon, SubpixelIcon } from './icons'

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
  /** The flattened image, encoded as `type` (PNG by default; browsers fall back to PNG for types they cannot encode). */
  toDataUrl: (type?: string) => string
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
  /**
   * Gaussian-blurs the selection (respecting a free-form mask) by `radius` pixels,
   * or the whole image without one. A placed selection blurs as one undo step.
   */
  blur: (radius: number) => void
  cropToSelection: () => void
  getSelection: () => Rect | null
  /** True while a shape is drawn but not yet placed: one with handles, or an unfinished freeform shape. */
  hasPendingShape: () => boolean
  clearSelection: () => void
  /**
   * A primary press on the workspace outside the image, at client coordinates:
   * commits an open text box and a floating selection, then deselects. Presses
   * on a selection handle that reaches past the image edge are ignored.
   * Given the press's `pointerId` with the Select tool, it also starts a new
   * selection there: the canvas captures the pointer and the rectangle is
   * clamped to the image as the drag goes on.
   */
  clickOutside: (clientX: number, clientY: number, pointerId?: number) => void
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
  /** Called whenever the image is edited, i.e. a change is recorded or undone/redone; not for a new or loaded document. */
  onDocumentChange?: () => void
  /**
   * Reports whether unplaced work is on the canvas: a pending shape or curve, or an
   * open text box with text in it. Placing it is reported by `onDocumentChange`.
   */
  onPendingChange?: (pending: boolean) => void
}

/** An undo step: the whole layer stack and which layer was active. */
interface DocSnapshot {
  layers: Layer[]
  active: number
  /** Set when every layer's bitmap is replaced, so the snapshot retains the whole stack. */
  bytes?: number
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
/**
 * How a pending shape is drawn. It is taken from the toolbar while the shape tool is
 * active and kept with the shape, so committing it after another tool is picked (which
 * brings that tool's own size and opacity) draws it exactly as it was previewed.
 */
interface ShapeStyle {
  width: number
  primary: Rgba
  secondary: Rgba
  fill: ShapeFill
  /** Opacity as a 0.01..1 blend factor. */
  strength: number
}

/** Draws a shape with the given style; `slot` is the colour the outline is drawn in. */
function renderShape(
  target: Bitmap,
  kind: ShapeKind,
  points: readonly Point[],
  slot: 'primary' | 'secondary',
  style: ShapeStyle,
) {
  const color = slot === 'secondary' ? style.secondary : style.primary
  const fillColor = slot === 'secondary' ? style.primary : style.secondary
  // Below 100 %, outline and fill are drawn at full strength and faded in together,
  // so where they overlap the shape is not any more opaque.
  const before = style.strength < 1 ? target.clone() : null
  renderLiveShape(target, kind, points, {
    width: style.width,
    // Open paths have no interior, so they are always stroked however the fill is set.
    stroke: shapeById(kind).closed && style.fill === 'filled' ? null : color,
    fill: style.fill === 'filled' ? color : style.fill === 'outline-filled' ? fillColor : null,
  })
  if (before) blendToward(target, before, target, style.strength)
}

interface PolylineState {
  kind: ShapeKind
  slot: 'primary' | 'secondary'
  style: ShapeStyle
  base: Bitmap
  points: Point[]
  /** The loose end that follows the pointer while dragging or hovering. */
  pending: Point | null
  /** The pointer held down to place the next vertex, if any. */
  pointerId: number | null
  lastDown: { time: number; point: Point }
}

/**
 * A shape being placed and tweaked. A drag inserts it; on release it stays live
 * with its handles so it can be tweaked, and the document stays untouched until
 * it is committed by clicking away.
 */
interface ShapeState {
  kind: ShapeKind
  slot: 'primary' | 'secondary'
  style: ShapeStyle
  base: Bitmap
  /** Kind-specific anchor points, owned by the shape's tweak family. */
  points: Point[]
  mode: 'insert' | 'tweak'
  /** The pointer that is inserting the shape or dragging a handle, if any. */
  pointerId: number | null
  /** The handle being dragged in the tweak phase, if any. */
  activeHandle: string | null
  /** Where the insertion drag started. */
  insertStart: Point
  /** The latest pointer position of the drag, so a modifier key can redo it without a move. */
  dragPoint: Point
  /** The modifier keys held during the drag (Shift constrains, Ctrl draws from the centre). */
  modifiers: DragModifiers
  /**
   * For a corner handle: the fixed opposite corner and where the handle started, to
   * keep the aspect. For a line end: the other end and where the grabbed end started.
   */
  grab: { anchor: Point; corner: Point } | null
  /** While the whole shape is dragged by its body: where the press was and the anchors then. */
  body: { press: Point; points: Point[] } | null
}

const OPPOSITE_CORNER: Record<string, string> = { nw: 'se', se: 'nw', ne: 'sw', sw: 'ne' }
const OTHER_LINE_END: Record<string, string> = { p0: 'p1', p1: 'p0' }

/** The handle id while a shape is dragged by its body rather than a handle. */
const BODY_HANDLE = 'body'

/** The handle whose start position `grab` pins while `handle` is dragged, if any. */
function grabAnchorFor(kind: ShapeKind, handle: string): string | undefined {
  return kind === 'line' ? OTHER_LINE_END[handle] : OPPOSITE_CORNER[handle]
}

/**
 * Recomputes a pending shape's anchors from its drag point and modifier keys:
 * inserting honours Shift (square / 45° line) and Ctrl (from the centre), and a
 * corner handle keeps the aspect ratio while Shift is held.
 */
function applyShapeDrag(shape: ShapeState): void {
  if (shape.mode === 'insert') {
    const { start, end } = constrainDrag(shape.insertStart, shape.dragPoint, dragModeFor(shape.kind), shape.modifiers)
    shape.points = insertShape(shape.kind, start, end)
    return
  }
  if (!shape.activeHandle) return
  if (shape.activeHandle === BODY_HANDLE && shape.body) {
    const { press, points } = shape.body
    const dx = shape.dragPoint.x - press.x
    const dy = shape.dragPoint.y - press.y
    shape.points = points.map((point) => ({ x: point.x + dx, y: point.y + dy }))
    return
  }
  if (shape.kind === 'line' && shape.grab) {
    const { other, grabbed } = dragLineEnd(shape.grab.anchor, shape.grab.corner, shape.dragPoint, shape.modifiers)
    shape.points = shape.activeHandle === 'p0' ? [grabbed, other] : [other, grabbed]
    return
  }
  const target =
    shape.modifiers.constrain && shape.grab
      ? keepAspect(shape.grab.anchor, shape.grab.corner, shape.dragPoint)
      : shape.dragPoint
  shape.points = moveShapeHandle(shape.kind, shape.points, shape.activeHandle, target)
}

/** The part of a pending shape the overlay redraws from. */
interface ShapeMirror {
  kind: ShapeKind
  mode: 'insert' | 'tweak'
  points: Point[]
}

interface TextEditorState {
  x: number
  y: number
  width: number
  height: number
  value: string
  slot: 'primary' | 'secondary'
  /** Turn about the box centre, in radians clockwise, as for a shape. */
  angle: number
}

interface TextResizeState {
  pointerId: number
  handle: SelectionHandle | 'rotate'
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
const HISTORY_MAX_BYTES = 256 * 1024 * 1024

const SELECTION_HANDLES: SelectionHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const HANDLE_HIT = 4
/** Grab radius, in screen pixels, for a live shape's tweak handles. */
const SHAPE_DOT_HIT = 8
/** How far, in screen pixels, past the edge of a pending line's stroke its body can be grabbed. */
const LINE_BODY_HIT = 4
/** An insertion drag shorter than this many screen pixels counts as a click. */
const SHAPE_CLICK_SLOP = 5
const DOUBLE_CLICK_MS = 300
/** How far apart, in screen pixels, the two presses of a double-click may be. */
const DOUBLE_CLICK_SLOP = 4

const MIN_TEXT_SIZE = 24
const DEFAULT_TEXT_WIDTH = 200
/** How far, in screen pixels, the pointer may wander before a text click becomes a drag. */
const TEXT_DRAG_SLOP = 4
const TEXT_TOOLBAR_WIDTH = 384
const TEXT_TOOLBAR_HEIGHT = 40
const TEXT_TOOLBAR_GAP = 8
/** Roughly the height of the font menu; used to decide if it fits below. */
const TEXT_MENU_HEIGHT = 240

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

/**
 * An `ImageData` over the bitmap's live buffer, for surfaces that are consumed
 * immediately (putImageData/drawImage) and so need no defensive copy.
 */
function imageDataFor(bitmap: Bitmap): ImageData {
  if (typeof ImageData !== 'undefined') {
    return new ImageData(bitmap.data as Uint8ClampedArray<ArrayBuffer>, bitmap.width, bitmap.height)
  }
  return { width: bitmap.width, height: bitmap.height, data: bitmap.data } as unknown as ImageData
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

/**
 * The marquee from `start` to `end`, either of which may lie outside the image,
 * clamped to the image; null when the dragged rectangle misses the image.
 */
function marqueeRect(start: Point, end: Point, width: number, height: number): Rect | null {
  const outside = (a: number, b: number, size: number) => (a < 0 && b < 0) || (a >= size && b >= size)
  if (outside(start.x, end.x, width) || outside(start.y, end.y, height)) return null
  return clampRect(normalizeRect(clampPoint(start, width, height), clampPoint(end, width, height)), width, height)
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

/**
 * The id of the live shape handle nearest `point` within `tolerance`, or null. The
 * nearest wins, so a press on an endpoint never grabs an overlapping control handle.
 */
function hitShapeHandle(kind: ShapeKind, points: Point[], point: Point, tolerance: number): string | null {
  let active: string | null = null
  let best = Infinity
  for (const handle of shapeHandles(kind, points)) {
    const reach = distance(point, handle.point)
    if (reach <= tolerance && reach < best) {
      best = reach
      active = handle.id
    }
  }
  return active
}

/**
 * Starts dragging handle `active` of a pending shape. A corner handle remembers
 * its opposite corner so Shift can keep the aspect ratio.
 */
function grabShapeHandle(
  shape: ShapeState,
  active: string,
  pointerId: number,
  point: Point,
  modifiers: DragModifiers,
): void {
  const handles = shapeHandles(shape.kind, shape.points)
  const corner = handles.find((handle) => handle.id === active)
  const anchor = handles.find((handle) => handle.id === grabAnchorFor(shape.kind, active))
  shape.pointerId = pointerId
  shape.activeHandle = active
  shape.dragPoint = point
  shape.modifiers = modifiers
  shape.grab = corner && anchor ? { anchor: anchor.point, corner: corner.point } : null
  shape.body = null
}

function handleCursor(handle: SelectionHandle): string {
  if (handle === 'n' || handle === 's') return 'ns-resize'
  if (handle === 'e' || handle === 'w') return 'ew-resize'
  if (handle === 'nw' || handle === 'se') return 'nwse-resize'
  return 'nesw-resize'
}

/**
 * The selection `origin` with the edges of `handle` moved to `point`. The edges
 * follow the pointer past the image border; whatever lands outside is only cut
 * away once the floating selection is placed.
 */
function resizeRect(origin: Rect, handle: SelectionHandle, point: Point): Rect {
  let left = origin.x
  let top = origin.y
  let right = origin.x + origin.width
  let bottom = origin.y + origin.height
  if (handle.includes('w')) left = Math.round(point.x)
  if (handle.includes('e')) right = Math.round(point.x)
  if (handle.includes('n')) top = Math.round(point.y)
  if (handle.includes('s')) bottom = Math.round(point.y)
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

/**
 * The CSS that turns a text box's editor and outline about the box centre, so the
 * live preview matches what `blitAlphaRotated` stamps. Nothing for an upright box.
 */
function textBoxTurn(box: Rect & { angle: number }, zoom: number): { transform?: string; transformOrigin?: string } {
  if (box.angle === 0) return {}
  return {
    transform: `rotate(${box.angle}rad)`,
    transformOrigin: `${(box.width * zoom) / 2}px ${(box.height * zoom) / 2}px`,
  }
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

/** What erasing leaves behind on a layer: the slot's colour on the bottom, transparency above. */
function eraseColorOn(active: number, slot: 'primary' | 'secondary', primary: Rgba, secondary: Rgba): Rgba {
  return active === 0 ? strokeColorFor('eraser', slot, primary, secondary) : TRANSPARENT
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

/** Where a floating selection hangs past the image edge, and the pixels shown there. */
interface FloatingOverflow {
  bitmap: Bitmap
  x: number
  y: number
}

/**
 * The pixels of `pixels`, placed at (`x`,`y`), that fall outside a `width`×`height`
 * image, or null when it lies wholly inside. In-image pixels are cleared so only the
 * overhang shows; they are kept on the floating selection until it is placed.
 */
function floatingOverflow(pixels: Bitmap, x: number, y: number, width: number, height: number): FloatingOverflow | null {
  if (x >= 0 && y >= 0 && x + pixels.width <= width && y + pixels.height <= height) return null
  const bitmap = pixels.clone()
  for (let row = Math.max(0, -y); row < Math.min(pixels.height, height - y); row += 1) {
    for (let column = Math.max(0, -x); column < Math.min(pixels.width, width - x); column += 1) {
      bitmap.set(column, row, TRANSPARENT)
    }
  }
  return { bitmap, x, y }
}

interface OverflowLayerProps {
  overflow: FloatingOverflow
  zoom: number
  /** Presses on the overhang, so it can be grabbed like the in-image part; null leaves it inert. */
  onPointerDown: ((event: ReactPointerEvent<HTMLElement>) => void) | null
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
}

function OverflowLayer({ overflow, zoom, onPointerDown, onPointerMove }: OverflowLayerProps) {
  const layerRef = useRef<HTMLCanvasElement | null>(null)
  const { bitmap, x, y } = overflow

  useEffect(() => {
    const context = layerRef.current?.getContext('2d')
    if (context) context.putImageData(bitmap.toImageData(), 0, 0)
  }, [bitmap])

  return (
    <canvas
      ref={layerRef}
      className="selection-overflow"
      aria-hidden="true"
      width={bitmap.width}
      height={bitmap.height}
      style={{
        left: x * zoom,
        top: y * zoom,
        width: bitmap.width * zoom,
        height: bitmap.height * zoom,
        ...(onPointerDown ? { pointerEvents: 'auto', cursor: 'move' } : null),
      }}
      onPointerDown={onPointerDown ?? undefined}
      onPointerMove={onPointerDown ? onPointerMove : undefined}
    />
  )
}

/** JPEG has no alpha, so transparent pixels must be flattened onto a solid background. */
function isJpeg(type: string): boolean {
  return type === 'image/jpeg' || type === 'image/jpg'
}

/** Draws `bitmap` over an opaque white surface, matching the app's background. */
function flattenOnWhite(bitmap: Bitmap): Bitmap {
  const background = new Bitmap(bitmap.width, bitmap.height, WHITE)
  drawOver(background, bitmap)
  return background
}

function bitmapToDataUrl(bitmap: Bitmap, type = 'image/png'): string {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  if (!context) return ''
  context.putImageData((isJpeg(type) ? flattenOnWhite(bitmap) : bitmap).toImageData(), 0, 0)
  return canvas.toDataURL(type)
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
    onDocumentChange,
    onPendingChange,
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const miniatureRef = useRef<HTMLCanvasElement | null>(null)
  const bitmapRef = useRef<Bitmap | null>(null)
  const historyRef = useRef(
    new History<DocSnapshot>(HISTORY_LIMIT, { maxBytes: HISTORY_MAX_BYTES, sizeOf: snapshotBytes }),
  )
  /** The layer stack, bottom first. The active entry's bitmap may be stale: `bitmapRef` holds the live one. */
  const layersRef = useRef<Layer[]>([])
  const activeRef = useRef(0)
  const layerCountRef = useRef(1)
  /** The layers below and above the active one, pre-flattened so painting only blends three bitmaps. */
  const stackRef = useRef<{ below: Bitmap | null; above: Bitmap | null }>({ below: null, above: null })
  const strokeRef = useRef<StrokeState | null>(null)
  /** Keeps the spray can spraying while the pointer is held down, even without moving. */
  const sprayTimerRef = useRef<number | null>(null)
  /** The animation frame that lifts the stroke-paint throttle, or null when none is pending. */
  const strokeFrameRef = useRef<number | null>(null)
  /** True while this frame's stroke repaint has already run and further ones are coalesced. */
  const strokePaintPendingRef = useRef(false)
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
  /** The colour a floating selection drops when transparent selection is on, else null. */
  const selectionKeyRef = useRef<Rgba | null>(null)
  const polylineRef = useRef<PolylineState | null>(null)
  const shapeRef = useRef<ShapeState | null>(null)
  // The handle is built before the pointer helpers it needs, so it calls through this.
  const clickOutsideRef = useRef<(clientX: number, clientY: number, pointerId?: number) => void>(() => {})
  const [polylineActive, setPolylineActive] = useState(false)
  const [shape, setShape] = useState<ShapeMirror | null>(null)
  const [size, setSize] = useState({ width: initialWidth, height: initialHeight })
  const [editor, setEditor] = useState<TextEditorState | null>(null)
  const [selection, setSelection] = useState<Rect | null>(null)
  const [mask, setMask] = useState<SelectionMask | null>(null)
  /** The part of a floating selection dragged past the image edge, drawn over the workspace. */
  const [overflow, setOverflow] = useState<FloatingOverflow | null>(null)
  const [lasso, setLasso] = useState<Point[] | null>(null)
  /** The dashed outline of a text box being dragged out. */
  const [textDraft, setTextDraft] = useState<Rect | null>(null)
  const [hoverCursor, setHoverCursor] = useState<string | null>(null)
  /** The image pixel under the pointer while the eraser is active, for its footprint preview. */
  const [eraserHover, setEraserHover] = useState<Point | null>(null)
  /** The colour slot of the eraser stroke in progress, so the preview matches what it erases. */
  const [eraserSlot, setEraserSlot] = useState<'primary' | 'secondary'>('primary')
  /** The index of the active layer, mirrored from the ref so the preview can be derived in render. */
  const [activeIndex, setActiveIndex] = useState(0)
  const pixelRatio = useDevicePixelRatio()
  /** The current tool's opacity as a 0.01..1 blend factor. */
  const strength = Math.min(100, Math.max(1, Number.isFinite(opacity) ? opacity : 100)) / 100
  const [viewport, setViewport] = useState<Rect | null>(null)

  const onHistoryChangeRef = useRef(onHistoryChange)
  const onCursorMoveRef = useRef(onCursorMove)
  const onPickColorRef = useRef(onPickColor)
  const onSizeChangeRef = useRef(onSizeChange)
  const onSelectionChangeRef = useRef(onSelectionChange)
  const onSelectionSizeChangeRef = useRef(onSelectionSizeChange)
  const onZoomClickRef = useRef(onZoomClick)
  const onTextChangeRef = useRef(onTextChange)
  const onPanChangeRef = useRef(onPanChange)
  const onLayersChangeRef = useRef(onLayersChange)
  const onDocumentChangeRef = useRef(onDocumentChange)
  const onPendingChangeRef = useRef(onPendingChange)
  // Callback props are mirrored into refs so that internal callbacks and effects can
  // keep a stable identity while still reading the latest closure.
  useEffect(() => {
    onHistoryChangeRef.current = onHistoryChange
    onCursorMoveRef.current = onCursorMove
    onPickColorRef.current = onPickColor
    onSizeChangeRef.current = onSizeChange
    onSelectionChangeRef.current = onSelectionChange
    onSelectionSizeChangeRef.current = onSelectionSizeChange
    onZoomClickRef.current = onZoomClick
    onTextChangeRef.current = onTextChange
    onPanChangeRef.current = onPanChange
    onLayersChangeRef.current = onLayersChange
    onDocumentChangeRef.current = onDocumentChange
    onPendingChangeRef.current = onPendingChange
  })

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
    let image: ImageData
    if (below || above) {
      // A real composite of the stack is its own buffer; only the plain bitmap can
      // hand its live buffer over, because putImageData reads it before anything
      // paints over it again.
      const shown = below ? below.clone() : new Bitmap(bitmap.width, bitmap.height)
      drawOver(shown, bitmap)
      if (above) drawOver(shown, above)
      image = shown.toImageData()
    } else {
      image = imageDataFor(bitmap)
    }

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

  const cancelStrokeFrame = useCallback(() => {
    if (strokeFrameRef.current === null) return
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(strokeFrameRef.current)
    else window.clearTimeout(strokeFrameRef.current)
    strokeFrameRef.current = null
    strokePaintPendingRef.current = false
  }, [])

  /**
   * Repaints the stroke surface at most once per animation frame. The first call
   * paints synchronously so a stroke is visible without waiting for a frame, while
   * the moves that land in the same frame are coalesced into that one repaint.
   */
  const paintStrokeSurface = useCallback(() => {
    if (strokePaintPendingRef.current) return
    strokePaintPendingRef.current = true
    paint(doc())
    const clear = () => {
      strokeFrameRef.current = null
      strokePaintPendingRef.current = false
    }
    strokeFrameRef.current =
      typeof requestAnimationFrame === 'function' ? requestAnimationFrame(clear) : window.setTimeout(clear, 0)
  }, [doc, paint])

  /** Paints any throttled stroke repaint immediately, for the end of a stroke. */
  const flushStrokeSurface = useCallback(() => {
    cancelStrokeFrame()
    paint(doc())
  }, [cancelStrokeFrame, doc, paint])

  useEffect(() => cancelStrokeFrame, [cancelStrokeFrame])

  /**
   * Stops whatever pointer drag is in progress so an undo or redo cannot be
   * silently overwritten by it: a stroke (and its spray timer), a selection drag
   * or a canvas resize. Pending shapes and polylines are deliberately left alone;
   * undo and redo finish or drop those themselves.
   */
  const abortPointerInteraction = useCallback(() => {
    stopSpraying()
    cancelStrokeFrame()
    strokeRef.current = null
    selectRef.current = null
    canvasResizeRef.current = null
    setLasso(null)
    setHoverCursor(null)
    setEraserHover(null)
    setEraserSlot('primary')
  }, [cancelStrokeFrame, stopSpraying])

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
    (before: Bitmap, bytes?: number) => {
      const stack = layers().map((layer, index) => (index === activeRef.current ? { ...layer, bitmap: before } : layer))
      historyRef.current.record({ layers: stack, active: activeRef.current, bytes })
      onDocumentChangeRef.current?.()
    },
    [layers],
  )

  /**
   * What erasing leaves behind: on the bottom layer the secondary colour (the
   * primary one for a right-button stroke), transparency above it.
   */
  const eraseColor = useCallback(
    (slot: 'primary' | 'secondary' = 'primary') => eraseColorOn(activeRef.current, slot, primary, secondary),
    [primary, secondary],
  )

  const publishLayers = useCallback(() => {
    const onLayersChange = onLayersChangeRef.current
    if (!onLayersChange) return
    const stack = currentLayers().map(({ id, name, bitmap }) => ({ id, name, thumbnail: thumbnail(bitmap) }))
    onLayersChange(stack, activeRef.current)
  }, [currentLayers])

  /**
   * Replaces the layer stack; the active layer's bitmap becomes the live paint surface.
   * `publish` can be turned off while a live drag repeatedly resizes the stack, so the
   * layer thumbnails are only rebuilt once the drag finishes.
   */
  const setLayers = useCallback(
    (next: Layer[], active: number, publish = true) => {
      layersRef.current = next
      activeRef.current = active
      setActiveIndex(active)
      bitmapRef.current = next[active].bitmap
      const flatten = (stack: Layer[]) => compositeLayers(stack.map((layer) => layer.bitmap))
      stackRef.current = { below: flatten(next.slice(0, active)), above: flatten(next.slice(active + 1)) }
      paint(next[active].bitmap)
      if (publish) publishLayers()
    },
    [paint, publishLayers],
  )

  useEffect(() => {
    publishLayers()
  }, [publishLayers])

  const syncHistory = useCallback(() => {
    const history = historyRef.current
    onHistoryChangeRef.current(history.canUndo, history.canRedo)
    publishLayers()
  }, [publishLayers])

  const updateSelection = useCallback(
    (rect: Rect | null, nextMask: SelectionMask | null = null) => {
      selectionRef.current = rect
      maskRef.current = rect ? nextMask : null
      setSelection(rect)
      setMask(rect ? nextMask : null)
      if (!floatingRef.current) setOverflow(null)
      onSelectionChangeRef.current(rect !== null)
    },
    [],
  )

  const selectionWidth = textDraft?.width ?? editor?.width ?? (lasso ? lassoExtent(lasso, 'x') : selection?.width)
  const selectionHeight = textDraft?.height ?? editor?.height ?? (lasso ? lassoExtent(lasso, 'y') : selection?.height)
  useEffect(() => {
    onSelectionSizeChangeRef.current?.(
      selectionWidth !== undefined && selectionHeight !== undefined
        ? { width: selectionWidth, height: selectionHeight }
        : null,
    )
  }, [selectionWidth, selectionHeight])

  const currentRect = useCallback((): Rect | null => {
    const floating = floatingRef.current
    if (floating) {
      return { x: floating.x, y: floating.y, width: floating.bitmap.width, height: floating.bitmap.height }
    }
    return selectionRef.current
  }, [])

  /** A floating selection's pixels, with the background colour keyed out in transparent mode. */
  const floatingPixels = useCallback((floating: FloatingSelection): Bitmap => {
    const key = selectionKeyRef.current
    const { width, height } = floating.bitmap
    return key ? extractRegion(floating.bitmap, { x: 0, y: 0, width, height }, key) : floating.bitmap
  }, [])

  /**
   * Stamps a floating selection onto `target`. A selection moved partly past the
   * image edge is clipped here: only its in-image pixels are written.
   */
  const blitFloating = useCallback(
    (target: Bitmap, floating: FloatingSelection) => {
      blitAlpha(target, floatingPixels(floating), floating.x, floating.y)
    },
    [floatingPixels],
  )

  const renderPreview = useCallback(() => {
    const floating = floatingRef.current
    if (!floating) return
    const preview = floating.base.clone()
    blitFloating(preview, floating)
    paint(preview)
    setOverflow(floatingOverflow(floatingPixels(floating), floating.x, floating.y, preview.width, preview.height))
  }, [blitFloating, floatingPixels, paint])

  // Toggling transparent selection (or changing the background colour) restyles a lifted selection at once.
  useEffect(() => {
    selectionKeyRef.current = transparentSelection ? secondary : null
    renderPreview()
  }, [renderPreview, transparentSelection, secondary])

  const ensureFloating = useCallback(
    (rect: Rect): FloatingSelection => {
      if (floatingRef.current) return floatingRef.current
      const original = doc()
      const base = original.clone()
      const selectionMask = maskRef.current
      const region = crop(original, rect)
      const bitmap = selectionMask ? applyMask(region, selectionMask) : region
      recordHistory(original.clone())
      fillSelection(base, rect, selectionMask, eraseColor())
      bitmapRef.current = base
      const floating: FloatingSelection = { source: bitmap, bitmap, x: rect.x, y: rect.y, base }
      floatingRef.current = floating
      syncHistory()
      return floating
    },
    [doc, eraseColor, recordHistory, syncHistory],
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
    blitFloating(result, floating)
    setOverflow(null)
    bitmapRef.current = result
    floatingRef.current = null
    paint(result)
    syncHistory()
  }, [blitFloating, paint, syncHistory])

  useEffect(() => {
    if (tool === 'select') return
    if (floatingRef.current) commitFloating()
    if (selectionRef.current) updateSelection(null)
  }, [tool, commitFloating, updateSelection])

  useEffect(() => {
    paint(doc())
  }, [size, paint, doc, pixelRatio])

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
      const onPanChange = onPanChangeRef.current
      if (!onPanChange) return
      const point = miniatureImagePoint(clientX, clientY)
      if (!point) return
      onPanChange({
        x: (size.width / 2 - point.x) * zoom,
        y: (size.height / 2 - point.y) * zoom,
      })
    },
    [miniatureImagePoint, size.width, size.height, zoom],
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

  const shapeStyle = useMemo<ShapeStyle>(
    () => ({ width: strokeWidthFor('shape', brushSize), primary, secondary, fill: shapeFill, strength }),
    [brushSize, primary, secondary, shapeFill, strength],
  )

  const cancelShapeRef = useRef<() => void>(() => {})

  /** Draws the pending shape onto a copy of the base; the live bitmap is left untouched. */
  const previewShape = useCallback(() => {
    const shape = shapeRef.current
    if (!shape) return
    const preview = shape.base.clone()
    renderShape(preview, shape.kind, shape.points, shape.slot, shape.style)
    paint(preview)
    setShape({ kind: shape.kind, mode: shape.mode, points: shape.points })
  }, [paint])

  /** Draws the placed shape onto the active layer as one undo step. */
  const commitShape = useCallback(() => {
    const shape = shapeRef.current
    if (!shape) return
    shapeRef.current = null
    setShape(null)
    // A shape still being inserted (too small to count) leaves the document untouched.
    if (shape.mode === 'insert') {
      bitmapRef.current = shape.base
      paint(shape.base)
      return
    }
    recordHistory(shape.base)
    const final = shape.base.clone()
    renderShape(final, shape.kind, shape.points, shape.slot, shape.style)
    bitmapRef.current = final
    paint(final)
    syncHistory()
  }, [paint, recordHistory, syncHistory])

  /** Drops the pending shape, restoring the untouched base and recording no history. */
  const cancelShape = useCallback(() => {
    const shape = shapeRef.current
    if (!shape) return
    shapeRef.current = null
    setShape(null)
    bitmapRef.current = shape.base
    paint(shape.base)
  }, [paint])

  const commitShapeRef = useRef(commitShape)
  useEffect(() => {
    commitShapeRef.current = commitShape
  }, [commitShape])
  useEffect(() => {
    cancelShapeRef.current = cancelShape
  }, [cancelShape])

  const previewPolyline = useCallback(() => {
    const polyline = polylineRef.current
    if (!polyline) return
    const points = polyline.pending ? [...polyline.points, polyline.pending] : polyline.points
    const preview = polyline.base.clone()
    if (points.length > 1) renderShape(preview, polyline.kind, points, polyline.slot, polyline.style)
    paint(preview)
  }, [paint])

  /** Repaints what is on screen: any pending shape, curve or lifted selection included. */
  const repaintCurrentView = useCallback(() => {
    const shape = shapeRef.current
    if (shape) {
      const preview = shape.base.clone()
      renderShape(preview, shape.kind, shape.points, shape.slot, shape.style)
      paint(preview)
    } else if (polylineRef.current) {
      previewPolyline()
    } else if (floatingRef.current) {
      renderPreview()
    } else {
      paint(doc())
    }
  }, [doc, paint, previewPolyline, renderPreview])

  /**
   * Repaints once more on the next frame after a new image is loaded or pasted.
   * The load paints synchronously too, but some browsers keep showing the old
   * pixels until the user interacts; a repaint in a fresh frame settles it.
   */
  const repaintFrameRef = useRef<number | null>(null)
  const scheduleRepaint = useCallback(() => {
    if (repaintFrameRef.current !== null) return
    const run = () => {
      repaintFrameRef.current = null
      repaintCurrentView()
    }
    repaintFrameRef.current =
      typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : window.setTimeout(run, 0)
  }, [repaintCurrentView])
  useEffect(
    () => () => {
      if (repaintFrameRef.current === null) return
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(repaintFrameRef.current)
      else window.clearTimeout(repaintFrameRef.current)
      repaintFrameRef.current = null
    },
    [],
  )

  /** Draws the vertices placed so far as one undo step; a lone vertex is dropped. */
  const finishPolyline = useCallback(() => {
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
    renderShape(final, polyline.kind, polyline.points, polyline.slot, polyline.style)
    bitmapRef.current = final
    paint(final)
    syncHistory()
  }, [doc, paint, recordHistory, syncHistory])

  /** Drops a freeform shape in progress, recording no history. */
  const cancelPolyline = useCallback(() => {
    if (!polylineRef.current) return
    polylineRef.current = null
    setPolylineActive(false)
    paint(doc())
  }, [doc, paint])

  const cancelPolylineRef = useRef(cancelPolyline)
  useEffect(() => {
    cancelPolylineRef.current = cancelPolyline
  }, [cancelPolyline])

  const finishPolylineRef = useRef(finishPolyline)
  useEffect(() => {
    finishPolylineRef.current = finishPolyline
  }, [finishPolyline])

  const commitTextRef = useRef<() => void>(() => {})

  // Switching tool or shape kind accepts whatever is still being edited, as in
  // Paint: the shape is committed first, since settling a polyline drops it.
  useEffect(() => {
    commitShapeRef.current()
    finishPolylineRef.current()
    commitTextRef.current()
  }, [tool, shapeKind])

  // A shape that is still pending follows the colour, size and fill settings, as in
  // Paint, so the toolbar restyles it instead of only the next one. Picking another
  // tool commits the shape first (above), so that tool's settings never reach it.
  useEffect(() => {
    const shape = shapeRef.current
    if (shape) {
      shape.style = shapeStyle
      const preview = shape.base.clone()
      renderShape(preview, shape.kind, shape.points, shape.slot, shape.style)
      paint(preview)
    }
    const polyline = polylineRef.current
    if (polyline) {
      polyline.style = shapeStyle
      previewPolyline()
    }
  }, [paint, previewPolyline, shapeStyle])

  // The miniature only fills in when the canvas is painted, so opening it repaints
  // what is on screen: a pending shape, curve or lifted selection included.
  useEffect(() => {
    if (!showMiniature) return
    repaintCurrentView()
  }, [showMiniature, repaintCurrentView])

  useEffect(() => {
    if (!polylineActive) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== 'Escape') return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) return
      event.preventDefault()
      if (event.key === 'Escape') {
        // Escape cancels the shape in progress, like any pending shape, and must not
        // reach the app's select-tool shortcut; stopping here keeps that independent
        // of listener order.
        event.stopImmediatePropagation()
        cancelPolylineRef.current()
      } else {
        finishPolylineRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [polylineActive])

  useEffect(() => {
    if (!shape) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== 'Escape') return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) return
      event.preventDefault()
      if (event.key === 'Escape') {
        // Escape cancels the shape and must not reach the app's select-tool shortcut.
        event.stopImmediatePropagation()
        cancelShapeRef.current()
      } else {
        commitShapeRef.current()
      }
    }
    // Listening as the key bubbles lets an open menu or dialog take Escape first, so
    // closing one leaves the shape alone.
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [shape])

  // Pressing or releasing Shift or Ctrl mid-drag reshapes the pending shape at
  // once, from the last pointer position, without waiting for the pointer to move.
  const shapeActive = shape !== null
  useEffect(() => {
    if (!shapeActive) return
    const onModifier = (event: KeyboardEvent) => {
      if (event.key !== 'Shift' && event.key !== 'Control' && event.key !== 'Meta') return
      const current = shapeRef.current
      if (!current || current.pointerId === null) return
      if (current.mode !== 'insert' && !current.activeHandle) return
      const next = dragModifiers(event)
      if (next.constrain === current.modifiers.constrain && next.fromCentre === current.modifiers.fromCentre) return
      current.modifiers = next
      applyShapeDrag(current)
      previewShape()
    }
    window.addEventListener('keydown', onModifier)
    window.addEventListener('keyup', onModifier)
    return () => {
      window.removeEventListener('keydown', onModifier)
      window.removeEventListener('keyup', onModifier)
    }
  }, [shapeActive, previewShape])

  const resetDocument = useCallback(
    (bitmap: Bitmap) => {
      polylineRef.current = null
      setPolylineActive(false)
      shapeRef.current = null
      setShape(null)
      historyRef.current = new History<DocSnapshot>(HISTORY_LIMIT, {
        maxBytes: HISTORY_MAX_BYTES,
        sizeOf: snapshotBytes,
      })
      editorRef.current = null
      floatingRef.current = null
      setEditor(null)
      setSize({ width: bitmap.width, height: bitmap.height })
      onSizeChangeRef.current(bitmap.width, bitmap.height)
      layerCountRef.current = 1
      setLayers([{ id: 1, name: 'Background', bitmap }], 0)
      updateSelection(null)
      syncHistory()
      scheduleRepaint()
    },
    [scheduleRepaint, setLayers, syncHistory, updateSelection],
  )

  const restore = useCallback(
    (snapshot: DocSnapshot) => {
      const { width, height } = snapshot.layers[0].bitmap
      // Read the live size before setLayers swaps the bitmap under it.
      const current = doc()
      if (current.width !== width || current.height !== height) {
        // The old selection/mask and lasso are in the previous size's
        // coordinates and would point outside the restored image.
        updateSelection(null)
        setLasso(null)
      }
      setSize({ width, height })
      onSizeChangeRef.current(width, height)
      setLayers([...snapshot.layers], snapshot.active)
      syncHistory()
    },
    [doc, setLayers, syncHistory, updateSelection],
  )

  /** Applies a whole-image operation to every layer as one undo step. */
  const applyToLayers = useCallback(
    (transform: (bitmap: Bitmap, bottom: boolean) => Bitmap) => {
      recordHistory(doc().clone(), stackBytes(layers()))
      const next = currentLayers().map((layer, index) => ({ ...layer, bitmap: transform(layer.bitmap, index === 0) }))
      const { width, height } = next[0].bitmap
      setSize({ width, height })
      onSizeChangeRef.current(width, height)
      setLayers(next, activeRef.current)
      syncHistory()
    },
    [currentLayers, doc, layers, recordHistory, setLayers, syncHistory],
  )

  /**
   * Accepts whatever is still being edited (a pending shape or curve, an open text
   * box) onto the active layer, each as its own undo step, as in Paint. Every document
   * action runs this first, so it acts on the image the user sees.
   */
  const acceptPending = useCallback(() => {
    commitShapeRef.current()
    finishPolyline()
    commitTextRef.current()
  }, [finishPolyline])

  /** Settles pending edits before the layer stack changes. */
  const settle = useCallback(() => {
    acceptPending()
    commitFloating()
    updateSelection(null)
  }, [acceptPending, commitFloating, updateSelection])

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
      syncHistory()
    },
    [doc, recordHistory, setLayers, syncHistory],
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
      acceptPending()
      commitFloating()
      // The old selection/mask no longer matches the resized document.
      updateSelection(null)
      setLasso(null)
      // New area is white on the bottom layer and transparent above it.
      applyToLayers((bitmap, bottom) => resizeTo(bitmap, rect, bottom ? WHITE : undefined))
    },
    [applyToLayers, acceptPending, commitFloating, resizeTo, updateSelection],
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
      acceptPending()
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
      const bitmap = pasted.clone()
      const x = clamp(origin.x, 0, width - bitmap.width)
      const y = clamp(origin.y, 0, height - bitmap.height)
      floatingRef.current = { source: bitmap, bitmap, x, y, base }
      renderPreview()
      updateSelection({ x, y, width: bitmap.width, height: bitmap.height })
      syncHistory()
      scheduleRepaint()
    },
    [
      applyToLayers,
      commitFloating,
      doc,
      acceptPending,
      recordHistory,
      renderPreview,
      resizeTo,
      scheduleRepaint,
      syncHistory,
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
        resetDocument(fitWithin(bitmap, MAX_CANVAS))
      },
      async loadDataUrl(src) {
        resetDocument(fitWithin(await bitmapFromDataUrl(src), MAX_CANVAS))
      },
      pasteBitmap(bitmap) {
        pasteImage(fitWithin(bitmap, MAX_CANVAS))
      },
      async pasteDataUrl(src) {
        pasteImage(fitWithin(await bitmapFromDataUrl(src), MAX_CANVAS))
      },
      clear() {
        acceptPending()
        commitFloating()
        recordHistory(doc().clone())
        doc().fill(activeRef.current === 0 ? WHITE : TRANSPARENT)
        paint(doc())
        // The cleared canvas no longer matches any selection mask.
        updateSelection(null)
        syncHistory()
      },
      undo() {
        // Nothing that is still being dragged out may keep running past this point.
        abortPointerInteraction()
        // Undo takes back the pending shape or curve itself, as in Paint: it is placed
        // and then undone, so the step before it survives and redo brings it back.
        // One too small to place (still being dragged out, a lone freeform vertex) is
        // simply dropped, and that is all this undo does.
        const unplaced =
          shapeRef.current?.mode === 'insert' || (polylineRef.current !== null && polylineRef.current.points.length < 2)
        commitShapeRef.current()
        finishPolyline()
        if (unplaced) return
        if (floatingRef.current) {
          commitFloating()
          updateSelection(null)
        }
        const previous = historyRef.current.undo({ layers: currentLayers(), active: activeRef.current })
        if (previous) {
          restore(previous)
          onDocumentChangeRef.current?.()
        }
      },
      redo() {
        if (!historyRef.current.canRedo) return
        // Nothing that is still being dragged out may keep running past this point.
        abortPointerInteraction()
        // Placing a pending shape or freeform shape would clear the redo stack, so redo
        // drops it instead.
        cancelShapeRef.current()
        cancelPolyline()
        if (floatingRef.current) {
          commitFloating()
          updateSelection(null)
        }
        const next = historyRef.current.redo({ layers: currentLayers(), active: activeRef.current })
        if (next) {
          restore(next)
          onDocumentChangeRef.current?.()
        }
      },
      toDataUrl(type = 'image/png') {
        acceptPending()
        const floating = floatingRef.current
        let active = doc()
        if (floating) {
          active = floating.base.clone()
          blitFloating(active, floating)
        }
        const stack = currentLayers().map((layer, index) => (index === activeRef.current ? active : layer.bitmap))
        const flat = compositeLayers(stack) ?? active
        return bitmapToDataUrl(flat, type)
      },
      getSize() {
        // From the bitmap, not state: callers ask right after loading, before a re-render.
        const { width, height } = doc()
        return { width, height }
      },
      hasPendingShape() {
        return shapeRef.current !== null || polylineRef.current !== null
      },
      flip(axis) {
        acceptPending()
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
        acceptPending()
        const start = beginRotation()
        if (start) {
          applyRotation(start, degrees)
          const floating = floatingRef.current
          if (floating) floating.source = floating.bitmap
          return
        }
        applyToLayers((bitmap, bottom) =>
          fitWithin(rotateBy(bitmap, degrees, bottom ? secondary : null), MAX_CANVAS),
        )
      },
      resize(width, height) {
        acceptPending()
        commitFloating()
        // Scaling moves every pixel, so the old selection coordinates are stale.
        updateSelection(null)
        applyToLayers((bitmap) => scale(bitmap, width, height))
      },
      scale(width, height) {
        acceptPending()
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
        acceptPending()
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
      blur(radius) {
        acceptPending()
        const floating = floatingRef.current
        if (floating) {
          const { width, height } = floating.bitmap
          const blurred = floating.bitmap.clone()
          blurSelection(blurred, { x: 0, y: 0, width, height }, maskRef.current, radius)
          floating.bitmap = blurred
          floating.source = blurred
          renderPreview()
          return
        }
        const rect = selectionRef.current
        if (rect) {
          recordHistory(doc().clone())
          blurSelection(doc(), rect, maskRef.current, radius)
          paint(doc())
          syncHistory()
          return
        }
        applyToLayers((bitmap) => gaussianBlur(bitmap, radius))
      },
      cropToSelection() {
        acceptPending()
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
      clickOutside(clientX, clientY, pointerId) {
        clickOutsideRef.current(clientX, clientY, pointerId)
      },
      selectAll() {
        acceptPending()
        commitFloating()
        updateSelection({ x: 0, y: 0, width: doc().width, height: doc().height })
      },
      invertSelection() {
        acceptPending()
        commitFloating()
        const inverted = invertSelection(selectionRef.current, maskRef.current, doc().width, doc().height)
        updateSelection(inverted?.rect ?? null, inverted?.mask ?? null)
      },
      deleteSelection() {
        acceptPending()
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
        acceptPending()
        const floating = floatingRef.current
        if (floating) {
          const composite = floating.base.clone()
          blitFloating(composite, floating)
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
        acceptPending()
        const floating = floatingRef.current
        let active = doc()
        if (floating) {
          active = floating.base.clone()
          blitFloating(active, floating)
        }
        const stack = currentLayers().map((layer, index) => (index === activeRef.current ? active : layer.bitmap))
        const flat = compositeLayers(stack) ?? active
        const rect = currentRect()
        if (!rect) return bitmapToDataUrl(flat)
        const region = crop(flat, rect)
        return bitmapToDataUrl(maskRef.current ? applyMask(region, maskRef.current) : region)
      },
      cutSelection() {
        acceptPending()
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
      abortPointerInteraction,
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
      blitFloating,
      commitFloating,
      currentRect,
      doc,
      ensureFloating,
      eraseColor,
      acceptPending,
      cancelPolyline,
      finishPolyline,
      paint,
      pasteImage,
      renderPreview,
      resetDocument,
      secondary,
      syncHistory,
      updateSelection,
    ],
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

  /** The image pixel under the pointer, which may lie outside the image (unscaled if the canvas has no layout size). */
  const toRawPoint = useCallback((event: ReactPointerEvent<HTMLElement>): Point => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = rect.width === 0 ? 1 : size.width / rect.width
    const scaleY = rect.height === 0 ? 1 : size.height / rect.height
    return floorPoint({ x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY })
  }, [size.width, size.height])

  const toPoint = useCallback(
    (event: ReactPointerEvent<HTMLElement>): Point => clampPoint(toRawPoint(event), size.width, size.height),
    [size.width, size.height, toRawPoint],
  )

  // Strokes and shapes follow the pointer past the image edge; the bitmap
  // primitives clip whatever lands outside, so nothing piles up along the border.
  const toFreePoint = useCallback(
    (event: ReactPointerEvent<HTMLElement>): Point => floorPoint(clientToCanvas(event.clientX, event.clientY)),
    [clientToCanvas],
  )

  const commitText = useCallback(() => {
    const current = editorRef.current
    if (!current) return
    editorRef.current = null
    setEditor(null)
    if (current.value.trim().length === 0) return
    const options = { ...text, color: colorFor(current.slot), maxWidth: current.width }
    // Subpixel text needs the pixel grid's R-G-B stripes, so a turned box falls back
    // to greyscale; hard-edged text is turned with nearest sampling to stay hard.
    const mode = textRenderMode(text, current.angle)
    if (mode === 'subpixel') {
      const coverage = renderTextSubpixel(current.value, options)
      if (!coverage) return
      recordHistory(doc().clone())
      blendSubpixel(doc(), coverage, current.x, current.y, options.color)
    } else {
      const rendered = renderText(current.value, { ...options, antialias: mode !== 'aliased' })
      if (!rendered) return
      recordHistory(doc().clone())
      const sampling = mode === 'aliased' ? 'nearest' : 'bilinear'
      blitAlphaRotated(doc(), rendered, current.x, current.y, rectCentre(current), current.angle, sampling)
    }
    paint(doc())
    syncHistory()
  }, [colorFor, doc, recordHistory, paint, syncHistory, text])
  useEffect(() => {
    commitTextRef.current = commitText
  }, [commitText])

  /** The pointer that owns the interaction in progress, if any. */
  const activePointerId = useCallback((): number | null => {
    if (strokeRef.current) return strokeRef.current.pointerId
    if (selectRef.current) return selectRef.current.pointerId
    if (canvasResizeRef.current) return canvasResizeRef.current.pointerId
    if (textPlaceRef.current) return textPlaceRef.current.pointerId
    const shape = shapeRef.current
    if (shape && shape.pointerId !== null) return shape.pointerId
    const polyline = polylineRef.current
    if (polyline && polyline.pointerId !== null) return polyline.pointerId
    return null
  }, [])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 && event.button !== 2) return
      // A right-click opens the workspace context menu unless the tool acts on it
      // (see `rightClickActs`): then it uses the secondary colour or zooms out, and
      // the workspace skips its menu. The canvas `onContextMenu` swallows the native menu.
      if (event.button === 2 && !rightClickActs(tool)) return
      // A second touch must not start its own interaction: it would overwrite the
      // active drag and record an extra history step.
      const activePointer = activePointerId()
      if (activePointer !== null && activePointer !== event.pointerId) return
      if (tool === 'eraser') setEraserHover(toPoint(event))
      if (editorRef.current) {
        commitText()
        return
      }
      event.preventDefault()
      const point = toPoint(event)
      const slot: 'primary' | 'secondary' = event.button === 2 ? 'secondary' : 'primary'

      if (tool === 'select') {
        event.preventDefault()
        // The press may come from a handle or the overhang of a floating selection
        // past the image edge; the canvas captures the drag either way.
        canvasRef.current?.setPointerCapture(event.pointerId)
        const rect = currentRect()
        // Hit-test the real pointer, so handles and overhang outside the image are grabbed too.
        const free = toFreePoint(event)
        const handle = rect ? hitHandle(rect, free, HANDLE_HIT / zoom) : null
        if (rect && handle) {
          selectRef.current = { pointerId: event.pointerId, mode: 'resize', start: free, handle, origin: rect }
          return
        }
        if (rect && pointInRect(free, rect)) {
          selectRef.current = { pointerId: event.pointerId, mode: 'move', start: free, origin: rect }
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
        onZoomClickRef.current(slot === 'secondary' ? -1 : 1)
        return
      }
      if (tool === 'picker') {
        const flat = compositeLayers(currentLayers().map((layer) => layer.bitmap)) ?? doc()
        onPickColorRef.current(flat.get(point.x, point.y), slot)
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
            style: shapeStyle,
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
      if (isShapeTool(tool)) {
        const shape = shapeRef.current
        if (shape) {
          // A pending shape is only retargeted by grabbing one of its handles.
          if (shape.mode !== 'tweak') return
          const active = hitShapeHandle(shape.kind, shape.points, point, SHAPE_DOT_HIT / zoom)
          if (active) {
            grabShapeHandle(shape, active, event.pointerId, point, dragModifiers(event))
            return
          }
          // A line is thin, so its body is grabbed a few pixels either side of the stroke.
          if (
            shape.kind === 'line' &&
            shape.points.length >= 2 &&
            distanceToSegment(point, shape.points[0], shape.points[1]) <= shape.style.width / 2 + LINE_BODY_HIT / zoom
          ) {
            shape.pointerId = event.pointerId
            shape.activeHandle = BODY_HANDLE
            shape.dragPoint = point
            shape.modifiers = dragModifiers(event)
            shape.grab = null
            shape.body = { press: point, points: shape.points }
            return
          }
          // A press outside the handles places the pending shape, then starts the next.
          commitShape()
        }
        const points = insertShape(shapeKind, point, point)
        shapeRef.current = {
          kind: shapeKind,
          slot,
          style: shapeStyle,
          base: doc().clone(),
          points,
          mode: 'insert',
          pointerId: event.pointerId,
          activeHandle: null,
          insertStart: point,
          dragPoint: point,
          modifiers: dragModifiers(event),
          grab: null,
          body: null,
        }
        setShape({ kind: shapeKind, mode: 'insert', points })
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
      if (tool === 'eraser') setEraserSlot(slot)
      cancelStrokeFrame()

      {
        recordHistory(base)
        stroke.recorded = true
        if (strength < 1) stroke.work = base.clone()
        const target = stroke.work ?? doc()
        const color = tool === 'eraser' ? eraseColor(slot) : strokeColorFor(tool, slot, primary, secondary)
        const width = strokeWidthFor(tool, brushSize)
        if (tool === 'airbrush') {
          sprayDab(target, point, width, color, random)
        } else if (tool === 'brush' && brush === 'highlighter') {
          const mask = createCoverageMask(base.width, base.height)
          stampHighlighter(mask, point, point, width)
          stroke.highlighter = mask
          const dirty = segmentBounds(point, point, width)
          if (stroke.work) {
            compositeHighlighterInto(stroke.work, base, mask, color, HIGHLIGHTER_ALPHA, dirty)
          } else {
            const result = base.clone()
            compositeHighlighterInto(result, base, mask, color, HIGHLIGHTER_ALPHA, dirty)
            bitmapRef.current = result
          }
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
              paintStrokeSurface()
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
    [activePointerId, brush, brushSize, cancelStrokeFrame, colorFor, commitShape, commitFloating, commitText, currentLayers, currentRect, doc, eraseColor, finishPolyline, paint, paintStrokeSurface, previewPolyline, primary, random, recordHistory, secondary, selectionShape, shapeKind, shapeStyle, size.height, size.width, stopSpraying, strength, syncHistory, toFreePoint, toPoint, tool, updateSelection, zoom],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const point = toPoint(event)
      onCursorMoveRef.current(point)
      if (tool === 'eraser') {
        // Past the image edge (a captured drag) the preview hides and the pointer returns.
        const raw = toRawPoint(event)
        const over = raw.x >= 0 && raw.y >= 0 && raw.x < size.width && raw.y < size.height
        setEraserHover((last) => (!over ? null : last && pointsEqual(last, point) ? last : point))
      }
      if (tool === 'select' && !selectRef.current) {
        const rect = currentRect()
        const free = toFreePoint(event)
        const handle = rect ? hitHandle(rect, free, HANDLE_HIT / zoom) : null
        setHoverCursor(
          handle ? handleCursor(handle) : rect && pointInRect(free, rect) ? 'move' : null,
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
          updateSelection(marqueeRect(drag.start, toRawPoint(event), size.width, size.height))
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
          // A moved selection follows the pointer past the image edge; whatever
          // hangs outside is only cut away once it is placed.
          const free = clientToCanvas(event.clientX, event.clientY)
          const x = origin.x + Math.floor(free.x) - drag.start.x
          const y = origin.y + Math.floor(free.y) - drag.start.y
          floating.x = x
          floating.y = y
          renderPreview()
          updateSelection({ x, y, width: floating.bitmap.width, height: floating.bitmap.height }, maskRef.current)
          return
        }
        if (drag.mode === 'resize' && drag.handle) {
          const next = resizeRect(origin, drag.handle, clientToCanvas(event.clientX, event.clientY))
          floating.bitmap = scale(floating.source, next.width, next.height)
          floating.x = next.x
          floating.y = next.y
          renderPreview()
          updateSelection(next, maskRef.current)
          return
        }
        return
      }
      const free = toFreePoint(event)
      const polyline = polylineRef.current
      if (polyline) {
        if (polyline.pointerId !== null && polyline.pointerId !== event.pointerId) return
        polyline.pending = free
        previewPolyline()
        return
      }
      const shape = shapeRef.current
      if (shape) {
        if (shape.pointerId === null || shape.pointerId !== event.pointerId) return
        if (shape.mode !== 'insert' && !shape.activeHandle) return
        shape.dragPoint = free
        shape.modifiers = dragModifiers(event)
        applyShapeDrag(shape)
        previewShape()
        return
      }
      const stroke = strokeRef.current
      if (!stroke || stroke.pointerId !== event.pointerId) return
      {
        const color = stroke.tool === 'eraser' ? eraseColor(stroke.slot) : strokeColorFor(stroke.tool, stroke.slot, primary, secondary)
        const width = strokeWidthFor(stroke.tool, brushSize)
        const target = stroke.work ?? doc()
        if (stroke.tool === 'airbrush') {
          sprayDab(target, free, width, color, random)
        } else if (stroke.tool === 'brush' && brush === 'highlighter' && stroke.highlighter) {
          stampHighlighter(stroke.highlighter, stroke.last, free, width)
          const dirty = segmentBounds(stroke.last, free, width)
          const result = stroke.work ?? doc()
          compositeHighlighterInto(result, stroke.base, stroke.highlighter, color, HIGHLIGHTER_ALPHA, dirty)
        } else if (stroke.tool === 'brush') {
          paintBrushStroke(target, stroke.last, free, { size: width, color, brush, random, source: stroke.base })
        } else {
          drawLine(target, stroke.last, free, width, color, strokeShape(stroke.tool))
        }
        if (stroke.work) {
          blendToward(doc(), stroke.base, stroke.work, stroke.strength, segmentBounds(stroke.last, free, width))
        }
        paintStrokeSurface()
      }
      stroke.last = free
    },
    [brush, brushSize, clientToCanvas, currentRect, doc, ensureFloating, eraseColor, paintStrokeSurface, previewShape, previewPolyline, primary, random, renderPreview, secondary, size.height, size.width, toFreePoint, toPoint, toRawPoint, tool, updateSelection, zoom],
  )

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      // A cancelled pointer (a system gesture, palm rejection) has no usable position,
      // some browsers report 0,0, so whatever it was dragging out is dropped. Drags that
      // only use the positions of earlier moves (strokes, moving or resizing a selection
      // or a shape handle) keep what they did.
      const cancelled = event.type === 'pointercancel'
      const place = textPlaceRef.current
      if (place && place.pointerId === event.pointerId) {
        textPlaceRef.current = null
        setTextDraft(null)
        if (cancelled) return
        const lineHeight = Math.round(text.fontSize * TEXT_LINE_HEIGHT) + 4
        const rect = placeTextBox(place.start, toPoint(event), TEXT_DRAG_SLOP / zoom, lineHeight, size.width, size.height)
        const next: TextEditorState = { ...rect, value: '', slot: 'primary', angle: 0 }
        editorRef.current = next
        setEditor(next)
        return
      }
      const drag = selectRef.current
      if (drag && drag.pointerId === event.pointerId) {
        if (drag.mode === 'marquee') {
          const rect = marqueeRect(drag.start, toRawPoint(event), size.width, size.height)
          if (cancelled || !rect || (rect.width < 2 && rect.height < 2)) updateSelection(null)
          else updateSelection(rect)
        }
        if (drag.mode === 'lasso') {
          const traced = cancelled ? null : polygonSelection(drag.points ?? [], size.width, size.height)
          updateSelection(traced?.rect ?? null, traced?.mask ?? null)
          setLasso(null)
        }
        selectRef.current = null
        return
      }
      const polyline = polylineRef.current
      if (polyline) {
        if (polyline.pointerId !== event.pointerId) return
        if (cancelled) {
          if (polyline.points.length < 2) {
            cancelPolyline()
            return
          }
          polyline.pointerId = null
          polyline.pending = null
          previewPolyline()
          return
        }
        const end = toFreePoint(event)
        if (!pointsEqual(end, polyline.points[polyline.points.length - 1])) polyline.points.push(end)
        polyline.pointerId = null
        polyline.pending = end
        previewPolyline()
        return
      }
      const shape = shapeRef.current
      if (shape) {
        if (shape.pointerId !== event.pointerId) return
        if (shape.mode === 'insert') {
          const end = toFreePoint(event)
          if (cancelled || distance(shape.insertStart, end) * zoom < SHAPE_CLICK_SLOP) {
            cancelShape()
            return
          }
          shape.dragPoint = end
          shape.modifiers = dragModifiers(event)
          applyShapeDrag(shape)
          shape.mode = 'tweak'
        }
        shape.activeHandle = null
        shape.pointerId = null
        shape.grab = null
        shape.body = null
        previewShape()
        return
      }
      const stroke = strokeRef.current
      if (!stroke || stroke.pointerId !== event.pointerId) return
      stopSpraying()
      // The last move may have been coalesced into a pending frame; show its pixels now.
      flushStrokeSurface()
      if (stroke.recorded) {
        // Freehand strokes paint in place; refresh the layer thumbnails once they are done.
        publishLayers()
      }
      strokeRef.current = null
      if (stroke.tool === 'eraser') setEraserSlot('primary')
    },
    [cancelPolyline, cancelShape, flushStrokeSurface, previewShape, previewPolyline, publishLayers, size.height, size.width, stopSpraying, text.fontSize, toFreePoint, toPoint, toRawPoint, updateSelection, zoom],
  )

  // Clicking the workspace background settles pending edits and deselects, but
  // never while a canvas drag is running or on a handle poking past the image.
  const handleClickOutside = useCallback(
    (clientX: number, clientY: number, pointerId?: number) => {
      if (selectRef.current) return
      const rect = currentRect()
      const point = clientToCanvas(clientX, clientY)
      if (rect && hitHandle(rect, point, HANDLE_HIT / zoom)) return
      // Nor on the part of a floating selection hanging past the image edge.
      if (rect && floatingRef.current && pointInRect(point, rect)) return
      // A pending shape's handle dragged past the image edge is drawn over the
      // workspace; a press there grabs it again, and the canvas runs the drag.
      const shape = shapeRef.current
      if (shape && shape.mode === 'tweak' && shape.pointerId === null) {
        const active = hitShapeHandle(shape.kind, shape.points, floorPoint(point), SHAPE_DOT_HIT / zoom)
        if (active) {
          if (pointerId === undefined) return
          canvasRef.current?.setPointerCapture?.(pointerId)
          grabShapeHandle(shape, active, pointerId, floorPoint(point), { constrain: false, fromCentre: false })
          return
        }
      }
      acceptPending()
      commitFloating()
      updateSelection(null)
      if (pointerId === undefined || tool !== 'select') return
      // With the Select tool the press also starts a selection, so the user can drag
      // in from beyond a corner instead of hitting it exactly. The canvas captures the
      // pointer, so the rest of the drag runs through its own handlers; nothing is
      // selected until the drag reaches the image.
      canvasRef.current?.setPointerCapture?.(pointerId)
      const start = floorPoint(point)
      if (selectionShape === 'freeform') {
        const edge = clampPoint(start, size.width, size.height)
        selectRef.current = { pointerId, mode: 'lasso', start: edge, points: [edge] }
        setLasso([edge])
        return
      }
      selectRef.current = { pointerId, mode: 'marquee', start }
    },
    [acceptPending, clientToCanvas, commitFloating, currentRect, selectionShape, size.height, size.width, tool, updateSelection, zoom],
  )
  useEffect(() => {
    clickOutsideRef.current = handleClickOutside
  }, [handleClickOutside])

  const handleRotateDown = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      const start = clientToCanvas(event.clientX, event.clientY)
      selectRef.current = { pointerId: event.pointerId, mode: 'rotate', start }
    },
    [clientToCanvas],
  )

  const handleRotateMove = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      const drag = selectRef.current
      if (!drag || drag.mode !== 'rotate' || drag.pointerId !== event.pointerId) return
      event.stopPropagation()
      if (!drag.rotation) {
        const rotation = beginRotation()
        if (!rotation) return
        drag.rotation = rotation
      }
      const { center } = drag.rotation
      const point = clientToCanvas(event.clientX, event.clientY)
      const radians = pointerAngle(center, point) - pointerAngle(center, drag.start)
      applyRotation(drag.rotation, (radians * 180) / Math.PI)
    },
    [applyRotation, beginRotation, clientToCanvas],
  )

  const handleRotateUp = useCallback((event: ReactPointerEvent<HTMLSpanElement>) => {
    const drag = selectRef.current
    if (!drag || drag.mode !== 'rotate' || drag.pointerId !== event.pointerId) return
    event.stopPropagation()
    if (drag.rotation) {
      const floating = floatingRef.current
      if (floating) floating.source = floating.bitmap
    }
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
      acceptPending()
      commitFloating()
      const { width, height } = doc()
      const source: DocSnapshot = { layers: currentLayers(), active: activeRef.current }
      source.layers[source.active] = { ...source.layers[source.active], bitmap: doc().clone() }
      source.bytes = stackBytes(source.layers)
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
    [acceptPending, commitFloating, currentLayers, doc, pan],
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
        onDocumentChangeRef.current?.()
        drag.recorded = true
        syncHistory()
      }

      const rect = { x: left, y: top, width: right - left, height: bottom - top }
      const next = drag.source.layers.map((layer, index) => ({
        ...layer,
        bitmap: resizeTo(layer.bitmap, rect, index === 0 ? WHITE : undefined),
      }))
      setSize({ width: next[0].bitmap.width, height: next[0].bitmap.height })
      onSizeChangeRef.current(next[0].bitmap.width, next[0].bitmap.height)
      // During a drag only the live surface is needed; the thumbnails are rebuilt once on drop.
      setLayers(next, drag.source.active, false)

      // Keep the edge opposite the dragged handle pinned on screen.
      const onPanChange = onPanChangeRef.current
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
    [resizeTo, setLayers, syncHistory, zoom],
  )

  const handleCanvasResizeUp = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      const drag = canvasResizeRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      event.stopPropagation()
      canvasResizeRef.current = null
      // Only a drag that actually changed the size has thumbnails to rebuild.
      if (drag.recorded) syncHistory()
    },
    [syncHistory],
  )

  const handlePointerLeave = useCallback(() => {
    onCursorMoveRef.current(null)
    setEraserHover(null)
    const polyline = polylineRef.current
    if (polyline && polyline.pointerId === null) {
      polyline.pending = null
      previewPolyline()
    }
  }, [previewPolyline])

  const keepTextFocus = useCallback(
    (event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>) => {
      if ((event.target as HTMLElement).tagName === 'INPUT') return
      event.preventDefault()
      event.stopPropagation()
    },
    [],
  )

  const handleTextHandleDown = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>, handle: SelectionHandle | 'rotate') => {
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
      const centre = rectCentre(current)
      // Like a shape's: the rotate handle (on the left, clear of the toolbar above)
      // turns the box about its centre, and the resize handles act along the
      // turned box's own axes.
      const updated =
        drag.handle === 'rotate'
          ? { ...current, angle: rotationToward(centre, point, 'left') }
          : {
              ...current,
              ...resizeTextBox(current, drag.handle, unrotateAround(point, centre, current.angle), size.width, size.height),
            }
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

  const pending = shape !== null || polylineActive || (editor !== null && editor.value.trim().length > 0)
  useEffect(() => {
    onPendingChangeRef.current?.(pending)
  }, [pending])

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

  const cursor = canvasCursor(tool, hoverCursor, { eraserPreview: eraserHover !== null })

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
          color={eraseColorOn(activeIndex, eraserSlot, primary, secondary)}
        />
      ) : null}
      {overflow ? (
        <OverflowLayer
          overflow={overflow}
          zoom={zoom}
          onPointerDown={tool === 'select' ? handlePointerDown : null}
          onPointerMove={handlePointerMove}
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
            // Handles poke past the image edge, so they take presses themselves
            // and hand them to the canvas, which runs the resize drag.
            <span
              key={handle}
              className={`selection-handle selection-handle-${handle}`}
              style={tool === 'select' ? { pointerEvents: 'auto', cursor: handleCursor(handle) } : undefined}
              onPointerDown={tool === 'select' ? handlePointerDown : undefined}
            />
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
      {shape && shape.mode === 'tweak' ? (
        <svg
          className="shape-overlay"
          aria-hidden="true"
          width={size.width * zoom}
          height={size.height * zoom}
        >
          {shapeHandles(shape.kind, shape.points).map((handle) => (
            <circle
              key={handle.id}
              className={handle.id === 'rotate' ? 'shape-handle shape-rotate-handle' : 'shape-handle'}
              cx={(handle.point.x + 0.5) * zoom}
              cy={(handle.point.y + 0.5) * zoom}
              r={4.5}
            />
          ))}
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
                      onTextChangeRef.current({ fontFamily: font.value })
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
              if (Number.isFinite(value) && value > 0) onTextChangeRef.current({ fontSize: Math.min(200, Math.round(value)) })
            }}
          />
          <button
            type="button"
            className="icon-button text-format-button"
            aria-label="Bold"
            aria-pressed={text.bold}
            onClick={() => onTextChangeRef.current({ bold: !text.bold })}
          >
            <span className="text-format-glyph glyph-bold">B</span>
          </button>
          <button
            type="button"
            className="icon-button text-format-button"
            aria-label="Italic"
            aria-pressed={text.italic}
            onClick={() => onTextChangeRef.current({ italic: !text.italic })}
          >
            <span className="text-format-glyph glyph-italic">I</span>
          </button>
          <button
            type="button"
            className="icon-button text-format-button"
            aria-label="Underline"
            aria-pressed={text.underline}
            onClick={() => onTextChangeRef.current({ underline: !text.underline })}
          >
            <span className="text-format-glyph glyph-underline">U</span>
          </button>
          <span className="text-toolbar-separator" aria-hidden="true" />
          <button
            type="button"
            className="icon-button text-format-button"
            aria-label="Anti-aliasing"
            title="Anti-aliasing: smooth text edges (off: hard pixel edges)"
            aria-pressed={text.antialias}
            onClick={() => onTextChangeRef.current({ antialias: !text.antialias })}
          >
            <AntialiasIcon size={18} />
          </button>
          <button
            type="button"
            className="icon-button text-format-button"
            aria-label="Subpixel rendering"
            title={
              text.antialias
                ? 'Subpixel rendering: sharper text for LCD screens (upright text only)'
                : 'Subpixel rendering needs anti-aliasing'
            }
            aria-pressed={text.subpixel}
            disabled={!text.antialias}
            onClick={() => onTextChangeRef.current({ subpixel: !text.subpixel })}
          >
            <SubpixelIcon size={18} />
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
            ...textBoxTurn(editor, zoom),
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
            ...textBoxTurn(editor, zoom),
          }}
        >
          <span
            className="text-rotate-handle shape-rotate-handle"
            title="Rotate"
            style={{ left: -ROTATE_HANDLE_OFFSET * zoom, top: '50%' }}
            onPointerDown={(event) => handleTextHandleDown(event, 'rotate')}
            onPointerMove={handleTextHandleMove}
            onPointerUp={handleTextHandleUp}
            onPointerCancel={handleTextHandleUp}
          />
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
