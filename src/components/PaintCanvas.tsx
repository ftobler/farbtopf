import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Bitmap } from '../core/bitmap'
import type { Rgba } from '../core/color'
import { WHITE, colorsEqual, toCss } from '../core/color'
import type { Point, Rect } from '../core/geometry'
import { clamp, clampPoint, distance, normalizeRect, pointInRect } from '../core/geometry'
import { History } from '../core/history'
import {
  blitAlpha,
  crop,
  drawEllipse,
  drawLine,
  drawRect,
  extractRegion,
  flipHorizontal,
  flipVertical,
  floodFill,
  rotate90,
  rotate180,
  rotate270,
  scale,
  stamp,
} from '../core/raster'
import type { BrushShape } from '../core/raster'
import type { ShapeFill, ToolId } from '../core/tools'
import { isShapeTool, strokeColorFor, strokeWidthFor } from '../core/tools'
import { bitmapFromDataUrl } from '../render/image'
import { fontSizeForBrush, renderText } from '../render/text'

export interface PaintCanvasHandle {
  newDocument: (width: number, height: number) => void
  loadBitmap: (bitmap: Bitmap) => void
  loadDataUrl: (src: string) => Promise<void>
  clear: () => void
  undo: () => void
  redo: () => void
  toDataUrl: () => string
  getSize: () => { width: number; height: number }
  flip: (axis: 'horizontal' | 'vertical') => void
  rotate: (degrees: 90 | 180 | 270) => void
  resize: (width: number, height: number) => void
  cropToSelection: () => void
  getSelection: () => Rect | null
  clearSelection: () => void
  getSelectionDataUrl: () => string | null
  cutSelection: () => void
}

export interface PaintCanvasProps {
  initialWidth: number
  initialHeight: number
  tool: ToolId
  primary: Rgba
  secondary: Rgba
  brushSize: number
  shapeFill: ShapeFill
  zoom: number
  showGrid: boolean
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void
  onCursorMove: (point: Point | null) => void
  onPickColor: (color: Rgba, slot: 'primary' | 'secondary') => void
  onSizeChange: (width: number, height: number) => void
  onSelectionChange?: (hasSelection: boolean) => void
  transparentSelection: boolean
}

interface StrokeState {
  pointerId: number
  slot: 'primary' | 'secondary'
  tool: ToolId
  start: Point
  last: Point
  base: Bitmap
  recorded: boolean
}

interface TextEditorState {
  x: number
  y: number
  value: string
  slot: 'primary' | 'secondary'
}

type SelectionHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

interface FloatingSelection {
  source: Bitmap
  bitmap: Bitmap
  x: number
  y: number
  base: Bitmap
}

interface SelectDrag {
  pointerId: number
  mode: 'marquee' | 'move' | 'resize'
  start: Point
  handle?: SelectionHandle
  origin?: Rect
}

const HISTORY_LIMIT = 80

const SELECTION_HANDLES: SelectionHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const HANDLE_HIT = 4

function strokeShape(tool: ToolId): BrushShape {
  return tool === 'pencil' || tool === 'eraser' ? 'square' : 'round'
}

function spray(bitmap: Bitmap, center: Point, radius: number, color: Rgba): void {
  const r = Math.max(1, radius)
  const attempts = Math.max(8, Math.round(r * r * 0.6))
  for (let i = 0; i < attempts; i += 1) {
    const angle = Math.random() * Math.PI * 2
    const distance = Math.sqrt(Math.random()) * r
    bitmap.set(
      Math.round(center.x + Math.cos(angle) * distance),
      Math.round(center.y + Math.sin(angle) * distance),
      color,
    )
  }
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
  if (handle.includes('w')) left = Math.round(point.x)
  if (handle.includes('e')) right = Math.round(point.x)
  if (handle.includes('n')) top = Math.round(point.y)
  if (handle.includes('s')) bottom = Math.round(point.y)
  left = clamp(left, 0, width - 1)
  top = clamp(top, 0, height - 1)
  right = clamp(right, 1, width)
  bottom = clamp(bottom, 1, height)
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
    shapeFill,
    zoom,
    showGrid,
    onHistoryChange,
    onCursorMove,
    onPickColor,
    onSizeChange,
    onSelectionChange = () => {},
    transparentSelection,
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const bitmapRef = useRef<Bitmap | null>(null)
  const historyRef = useRef(new History<Bitmap>(HISTORY_LIMIT))
  const strokeRef = useRef<StrokeState | null>(null)
  const editorRef = useRef<TextEditorState | null>(null)
  const selectionRef = useRef<Rect | null>(null)
  const selectRef = useRef<SelectDrag | null>(null)
  const floatingRef = useRef<FloatingSelection | null>(null)
  const [size, setSize] = useState({ width: initialWidth, height: initialHeight })
  const [editor, setEditor] = useState<TextEditorState | null>(null)
  const [selection, setSelection] = useState<Rect | null>(null)
  const [hoverCursor, setHoverCursor] = useState<string | null>(null)

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
    context.putImageData(bitmap.toImageData(), 0, 0)
  }, [])

  const syncHistory = useCallback(() => {
    const history = historyRef.current
    onHistoryChange(history.canUndo, history.canRedo)
  }, [onHistoryChange])

  const updateSelection = useCallback(
    (rect: Rect | null) => {
      selectionRef.current = rect
      setSelection(rect)
      onSelectionChange(rect !== null)
    },
    [onSelectionChange],
  )

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
      const bitmap = extractRegion(original, rect, transparentSelection ? secondary : null)
      historyRef.current.record(original.clone())
      drawRect(base, rect, 1, secondary, true)
      bitmapRef.current = base
      const floating: FloatingSelection = { source: bitmap, bitmap, x: rect.x, y: rect.y, base }
      floatingRef.current = floating
      syncHistory()
      return floating
    },
    [doc, secondary, syncHistory, transparentSelection],
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
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = size.width
    canvas.height = size.height
    paint(doc())
  }, [size, paint, doc])

  const resetDocument = useCallback(
    (bitmap: Bitmap) => {
      bitmapRef.current = bitmap
      historyRef.current = new History<Bitmap>(HISTORY_LIMIT)
      editorRef.current = null
      floatingRef.current = null
      setEditor(null)
      setSize({ width: bitmap.width, height: bitmap.height })
      onSizeChange(bitmap.width, bitmap.height)
      updateSelection(null)
      syncHistory()
    },
    [onSizeChange, syncHistory, updateSelection],
  )

  const applyBitmap = useCallback(
    (next: Bitmap) => {
      historyRef.current.record(doc().clone())
      bitmapRef.current = next
      setSize({ width: next.width, height: next.height })
      onSizeChange(next.width, next.height)
      paint(next)
      syncHistory()
    },
    [doc, onSizeChange, paint, syncHistory],
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
      clear() {
        commitFloating()
        const history = historyRef.current
        history.record(doc().clone())
        doc().fill(WHITE)
        paint(doc())
        syncHistory()
      },
      undo() {
        if (floatingRef.current) {
          commitFloating()
          updateSelection(null)
        }
        const previous = historyRef.current.undo(doc())
        if (!previous) return
        bitmapRef.current = previous
        setSize({ width: previous.width, height: previous.height })
        onSizeChange(previous.width, previous.height)
        paint(previous)
        syncHistory()
      },
      redo() {
        if (floatingRef.current) {
          commitFloating()
          updateSelection(null)
        }
        const next = historyRef.current.redo(doc())
        if (!next) return
        bitmapRef.current = next
        setSize({ width: next.width, height: next.height })
        onSizeChange(next.width, next.height)
        paint(next)
        syncHistory()
      },
      toDataUrl() {
        return canvasRef.current?.toDataURL('image/png') ?? ''
      },
      getSize() {
        return { width: size.width, height: size.height }
      },
      flip(axis) {
        commitFloating()
        applyBitmap(axis === 'horizontal' ? flipHorizontal(doc()) : flipVertical(doc()))
      },
      rotate(degrees) {
        commitFloating()
        applyBitmap(
          degrees === 90 ? rotate90(doc()) : degrees === 180 ? rotate180(doc()) : rotate270(doc()),
        )
      },
      resize(width, height) {
        commitFloating()
        applyBitmap(scale(doc(), width, height))
      },
      cropToSelection() {
        commitFloating()
        const rect = selectionRef.current
        if (!rect) return
        applyBitmap(crop(doc(), rect))
        updateSelection(null)
      },
      getSelection() {
        return selectionRef.current
      },
      clearSelection() {
        commitFloating()
        updateSelection(null)
      },
      getSelectionDataUrl() {
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
          return bitmapToDataUrl(region)
        }
        const rect = selectionRef.current
        if (!rect) return null
        return bitmapToDataUrl(crop(doc(), rect))
      },
      cutSelection() {
        commitFloating()
        const rect = selectionRef.current
        if (!rect) return
        historyRef.current.record(doc().clone())
        for (let y = rect.y; y < rect.y + rect.height; y += 1) {
          for (let x = rect.x; x < rect.x + rect.width; x += 1) doc().set(x, y, WHITE)
        }
        paint(doc())
        syncHistory()
      },
    }),
    [
      applyBitmap,
      commitFloating,
      doc,
      onSizeChange,
      paint,
      resetDocument,
      size.width,
      size.height,
      syncHistory,
      updateSelection,
    ],
  )

  const colorFor = useCallback(
    (slot: 'primary' | 'secondary') => (slot === 'secondary' ? secondary : primary),
    [primary, secondary],
  )

  const toPoint = useCallback((event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return clampPoint(
      { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY },
      canvas.width,
      canvas.height,
    )
  }, [])

  const renderShape = useCallback(
    (target: Bitmap, start: Point, end: Point, slot: 'primary' | 'secondary') => {
      const color = colorFor(slot)
      const fillColor = slot === 'secondary' ? primary : secondary
      const rect = normalizeRect(start, end)
      if (tool === 'line') {
        drawLine(target, start, end, brushSize, color, 'round')
        return
      }
      if (tool === 'rectangle') {
        if (shapeFill === 'filled') {
          drawRect(target, rect, 1, color, true)
        } else {
          if (shapeFill === 'outline-filled') drawRect(target, rect, 1, fillColor, true)
          drawRect(target, rect, brushSize, color, false)
        }
        return
      }
      if (tool === 'ellipse') {
        if (shapeFill === 'filled') {
          drawEllipse(target, rect, 1, color, true)
        } else {
          if (shapeFill === 'outline-filled') drawEllipse(target, rect, 1, fillColor, true)
          drawEllipse(target, rect, brushSize, color, false)
        }
      }
    },
    [brushSize, colorFor, primary, secondary, shapeFill, tool],
  )

  const commitText = useCallback(() => {
    const current = editorRef.current
    if (!current) return
    editorRef.current = null
    setEditor(null)
    if (current.value.trim().length === 0) return
    const rendered = renderText(current.value, {
      fontSize: fontSizeForBrush(brushSize),
      color: colorFor(current.slot),
    })
    if (!rendered) return
    historyRef.current.record(doc().clone())
    blitAlpha(doc(), rendered, current.x, current.y)
    paint(doc())
    syncHistory()
  }, [brushSize, colorFor, doc, paint, syncHistory])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0 && event.button !== 2) return
      if (editorRef.current) {
        commitText()
        return
      }
      event.preventDefault()
      const point = toPoint(event)
      const slot: 'primary' | 'secondary' = event.button === 2 ? 'secondary' : 'primary'

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
        selectRef.current = { pointerId: event.pointerId, mode: 'marquee', start: point }
        updateSelection(clampRect(normalizeRect(point, point), size.width, size.height))
        return
      }
      if (tool === 'picker') {
        onPickColor(doc().get(point.x, point.y), slot)
        return
      }
      if (tool === 'fill') {
        const color = colorFor(slot)
        if (colorsEqual(doc().get(point.x, point.y), color)) return
        historyRef.current.record(doc().clone())
        floodFill(doc(), point, color)
        paint(doc())
        syncHistory()
        return
      }
      if (tool === 'text') {
        const next = { x: point.x, y: point.y, value: '', slot }
        editorRef.current = next
        setEditor(next)
        return
      }

      event.currentTarget.setPointerCapture(event.pointerId)
      const base = doc().clone()
      const stroke: StrokeState = {
        pointerId: event.pointerId,
        slot,
        tool,
        start: point,
        last: point,
        base,
        recorded: false,
      }
      strokeRef.current = stroke

      if (isShapeTool(tool)) {
        paint(base)
      } else {
        historyRef.current.record(base)
        stroke.recorded = true
        const color = strokeColorFor(tool, slot, primary, secondary)
        if (tool === 'airbrush') spray(doc(), point, brushSize, color)
        else stamp(doc(), point.x, point.y, strokeWidthFor(tool, brushSize), color, strokeShape(tool))
        paint(doc())
        syncHistory()
      }
    },
    [brushSize, colorFor, commitFloating, commitText, currentRect, doc, onPickColor, paint, primary, secondary, size.height, size.width, syncHistory, toPoint, tool, updateSelection, zoom],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const point = toPoint(event)
      onCursorMove(point)
      if (tool === 'select' && !selectRef.current) {
        const rect = currentRect()
        const handle = rect ? hitHandle(rect, point, HANDLE_HIT / zoom) : null
        setHoverCursor(
          handle ? handleCursor(handle) : rect && pointInRect(point, rect) ? 'move' : null,
        )
      }
      const drag = selectRef.current
      if (drag && drag.pointerId === event.pointerId) {
        if (drag.mode === 'marquee') {
          updateSelection(clampRect(normalizeRect(drag.start, point), size.width, size.height))
          return
        }
        const origin = drag.origin
        if (!origin) return
        const floating = ensureFloating(origin)
        if (drag.mode === 'move') {
          const x = clamp(origin.x + (point.x - drag.start.x), 0, Math.max(0, size.width - floating.bitmap.width))
          const y = clamp(origin.y + (point.y - drag.start.y), 0, Math.max(0, size.height - floating.bitmap.height))
          floating.x = x
          floating.y = y
          renderPreview()
          updateSelection({ x, y, width: floating.bitmap.width, height: floating.bitmap.height })
          return
        }
        if (drag.mode === 'resize' && drag.handle) {
          const next = resizeRect(origin, drag.handle, point, size.width, size.height)
          floating.bitmap = scale(floating.source, next.width, next.height)
          floating.x = next.x
          floating.y = next.y
          renderPreview()
          updateSelection(next)
          return
        }
        return
      }
      const stroke = strokeRef.current
      if (!stroke || stroke.pointerId !== event.pointerId) return
      if (isShapeTool(stroke.tool)) {
        if (!stroke.recorded) {
          historyRef.current.record(stroke.base.clone())
          stroke.recorded = true
          syncHistory()
        }
        const preview = stroke.base.clone()
        renderShape(preview, stroke.start, point, stroke.slot)
        paint(preview)
      } else {
        const color = strokeColorFor(stroke.tool, stroke.slot, primary, secondary)
        if (stroke.tool === 'airbrush') spray(doc(), point, brushSize, color)
        else
          drawLine(
            doc(),
            stroke.last,
            point,
            strokeWidthFor(stroke.tool, brushSize),
            color,
            strokeShape(stroke.tool),
          )
        paint(doc())
      }
      stroke.last = point
    },
    [brushSize, currentRect, doc, ensureFloating, onCursorMove, paint, primary, renderPreview, renderShape, secondary, size.height, size.width, syncHistory, toPoint, tool, updateSelection, zoom],
  )

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const drag = selectRef.current
      if (drag && drag.pointerId === event.pointerId) {
        if (drag.mode === 'marquee') {
          const rect = clampRect(normalizeRect(drag.start, toPoint(event)), size.width, size.height)
          if (rect.width < 2 && rect.height < 2) updateSelection(null)
          else updateSelection(rect)
        }
        selectRef.current = null
        return
      }
      const stroke = strokeRef.current
      if (!stroke || stroke.pointerId !== event.pointerId) return
      if (isShapeTool(stroke.tool) && stroke.recorded) {
        const end = toPoint(event)
        const final = stroke.base.clone()
        renderShape(final, stroke.start, end, stroke.slot)
        bitmapRef.current = final
        paint(final)
        syncHistory()
      }
      strokeRef.current = null
    },
    [paint, renderShape, size.height, size.width, syncHistory, toPoint, updateSelection],
  )

  const handlePointerLeave = useCallback(() => {
    onCursorMove(null)
  }, [onCursorMove])

  const cursor =
    tool === 'text' ? 'text' : tool === 'fill' ? 'cell' : tool === 'picker' ? 'copy' : tool === 'select' ? (hoverCursor ?? 'crosshair') : 'crosshair'

  return (
    <div
      className="canvas-frame"
      style={{ width: size.width * zoom, height: size.height * zoom }}
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
          {SELECTION_HANDLES.map((handle) => (
            <span key={handle} className={`selection-handle selection-handle-${handle}`} />
          ))}
        </div>
      ) : null}
      {editor ? (
        <textarea
          className="text-editor"
          autoFocus
          spellCheck={false}
          value={editor.value}
          style={{
            left: editor.x * zoom,
            top: editor.y * zoom,
            fontSize: fontSizeForBrush(brushSize) * zoom,
            lineHeight: 1.25,
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
          onBlur={commitText}
        />
      ) : null}
    </div>
  )
})
