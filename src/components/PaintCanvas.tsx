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
import type { Point } from '../core/geometry'
import { clampPoint, normalizeRect } from '../core/geometry'
import { History } from '../core/history'
import { blitAlpha, drawEllipse, drawLine, drawRect, floodFill, stamp } from '../core/raster'
import type { BrushShape } from '../core/raster'
import type { ShapeFill, ToolId } from '../core/tools'
import { isShapeTool } from '../core/tools'
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

const HISTORY_LIMIT = 80

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
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const bitmapRef = useRef<Bitmap | null>(null)
  const historyRef = useRef(new History<Bitmap>(HISTORY_LIMIT))
  const strokeRef = useRef<StrokeState | null>(null)
  const editorRef = useRef<TextEditorState | null>(null)
  const [size, setSize] = useState({ width: initialWidth, height: initialHeight })
  const [editor, setEditor] = useState<TextEditorState | null>(null)

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
      setEditor(null)
      setSize({ width: bitmap.width, height: bitmap.height })
      onSizeChange(bitmap.width, bitmap.height)
      syncHistory()
    },
    [onSizeChange, syncHistory],
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
        const history = historyRef.current
        history.record(doc().clone())
        doc().fill(WHITE)
        paint(doc())
        syncHistory()
      },
      undo() {
        const previous = historyRef.current.undo(doc())
        if (!previous) return
        bitmapRef.current = previous
        paint(previous)
        syncHistory()
      },
      redo() {
        const next = historyRef.current.redo(doc())
        if (!next) return
        bitmapRef.current = next
        paint(next)
        syncHistory()
      },
      toDataUrl() {
        return canvasRef.current?.toDataURL('image/png') ?? ''
      },
      getSize() {
        return { width: size.width, height: size.height }
      },
    }),
    [doc, paint, resetDocument, size.width, size.height, syncHistory],
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
        const color = colorFor(slot)
        if (tool === 'airbrush') spray(doc(), point, brushSize, color)
        else stamp(doc(), point.x, point.y, brushSize, color, strokeShape(tool))
        paint(doc())
        syncHistory()
      }
    },
    [brushSize, colorFor, commitText, doc, onPickColor, paint, syncHistory, toPoint, tool],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const point = toPoint(event)
      onCursorMove(point)
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
        const color = colorFor(stroke.slot)
        if (stroke.tool === 'airbrush') spray(doc(), point, brushSize, color)
        else
          drawLine(
            doc(),
            stroke.last,
            point,
            brushSize,
            color,
            strokeShape(stroke.tool),
          )
        paint(doc())
      }
      stroke.last = point
    },
    [brushSize, colorFor, doc, onCursorMove, paint, renderShape, syncHistory, toPoint],
  )

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
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
    [paint, renderShape, syncHistory, toPoint],
  )

  const handlePointerLeave = useCallback(() => {
    onCursorMove(null)
  }, [onCursorMove])

  const cursor =
    tool === 'text' ? 'text' : tool === 'fill' ? 'cell' : tool === 'picker' ? 'copy' : 'crosshair'

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
