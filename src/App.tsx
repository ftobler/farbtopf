import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { MenuBar } from './components/MenuBar'
import { NewCanvasDialog } from './components/NewCanvasDialog'
import { PaintCanvas } from './components/PaintCanvas'
import type { PaintCanvasHandle } from './components/PaintCanvas'
import { Ribbon } from './components/Ribbon'
import { RotateDialog } from './components/RotateDialog'
import { ScaleImageDialog } from './components/ScaleImageDialog'
import { Scrollbars } from './components/Scrollbars'
import { StatusBar } from './components/StatusBar'
import type { BrushId } from './core/brushes'
import type { Rgba } from './core/color'
import type { Point } from './core/geometry'
import type { SelectionShape } from './core/selection'
import type { ShapeKind } from './core/shapes'
import { DEFAULT_CANVAS, DEFAULT_PALETTE } from './core/palette'
import { DEFAULT_PRIMARY, DEFAULT_SECONDARY } from './core/palette'
import { TOOLS, BRUSH_SIZES, toolById } from './core/tools'
import type { ShapeFill, ToolId } from './core/tools'
import { ZOOM_LEVELS, nextZoom } from './core/zoom'
import { useCustomColors } from './hooks/useCustomColors'
import { useTheme } from './hooks/useTheme'
import { downloadDataUrl, readFileAsDataUrl } from './render/image'
import { DEFAULT_TEXT_OPTIONS } from './render/text'
import type { TextOptions } from './render/text'

/** Single-key shortcuts that pick a specific shape. */
const SHAPE_SHORTCUTS: Record<string, ShapeKind> = { l: 'line', r: 'rectangle', o: 'ellipse' }

function fitZoom(width: number, height: number): number {
  const availableWidth = Math.max(200, window.innerWidth - 96)
  const availableHeight = Math.max(200, window.innerHeight - 280)
  const raw = Math.min(1, availableWidth / width, availableHeight / height)
  let best: number = ZOOM_LEVELS[0]
  for (const level of ZOOM_LEVELS) {
    if (level <= raw) best = level
  }
  return best
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

function App() {
  const canvasRef = useRef<PaintCanvasHandle | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const messageTimer = useRef<number | null>(null)
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const panRef = useRef<{ pointerId: number; startX: number; startY: number; panX: number; panY: number } | null>(null)

  const { theme, toggleTheme } = useTheme()
  const customColors = useCustomColors()

  const [tool, setTool] = useState<ToolId>('brush')
  const [primary, setPrimary] = useState<Rgba>(DEFAULT_PRIMARY)
  const [secondary, setSecondary] = useState<Rgba>(DEFAULT_SECONDARY)
  const [brushSize, setBrushSize] = useState(4)
  const [brush, setBrush] = useState<BrushId>('round')
  const [text, setText] = useState<TextOptions>(DEFAULT_TEXT_OPTIONS)
  const [shapeFill, setShapeFill] = useState<ShapeFill>('outline')
  const [shapeKind, setShapeKind] = useState<ShapeKind>('rectangle')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [panning, setPanning] = useState(false)
  const [showGrid, setShowGrid] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [cursor, setCursor] = useState<Point | null>(null)
  const [canvasSize, setCanvasSize] = useState(DEFAULT_CANVAS)
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [showScaleDialog, setShowScaleDialog] = useState(false)
  const [showRotateDialog, setShowRotateDialog] = useState(false)
  const [customRotation, setCustomRotation] = useState(0)
  const [lastRotation, setLastRotation] = useState(90)
  const [lastFlip, setLastFlip] = useState<'horizontal' | 'vertical'>('horizontal')
  const [hasSelection, setHasSelection] = useState(false)
  const [transparentSelection, setTransparentSelection] = useState(false)
  const [selectionShape, setSelectionShape] = useState<SelectionShape>('rectangle')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showMiniature, setShowMiniature] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const notify = useCallback((text: string) => {
    setMessage(text)
    if (messageTimer.current !== null) window.clearTimeout(messageTimer.current)
    messageTimer.current = window.setTimeout(() => setMessage(null), 2600)
  }, [])

  useEffect(() => {
    return () => {
      if (messageTimer.current !== null) window.clearTimeout(messageTimer.current)
    }
  }, [])

  useEffect(() => {
    document.title = 'Farbtopf'
  }, [])

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const handleNewDocument = useCallback(
    (width: number, height: number) => {
      canvasRef.current?.newDocument(width, height)
      setZoom(fitZoom(width, height))
      setPan({ x: 0, y: 0 })
      setNewDialogOpen(false)
      notify(`New ${width} × ${height} canvas`)
    },
    [notify],
  )

  const openFile = useCallback(
    async (file: File) => {
      try {
        const dataUrl = await readFileAsDataUrl(file)
        await canvasRef.current?.loadDataUrl(dataUrl)
        const size = canvasRef.current?.getSize()
        if (size) {
          setCanvasSize(size)
          setZoom(fitZoom(size.width, size.height))
          setPan({ x: 0, y: 0 })
        }
        setCursor(null)
        notify(`Opened ${file.name}`)
      } catch {
        notify('Could not open that image')
      }
    },
    [notify],
  )

  const handlePasteFromClipboard = useCallback(async () => {
    if (!navigator.clipboard?.read) {
      notify('Clipboard paste is not supported here')
      return
    }
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const type = item.types.find((entry) => entry.startsWith('image/'))
        if (!type) continue
        const blob = await item.getType(type)
        const extension = type.split('/')[1] ?? 'png'
        await openFile(new File([blob], `pasted.${extension}`, { type }))
        return
      }
      notify('No image in the clipboard')
    } catch {
      notify('Could not paste from the clipboard')
    }
  }, [notify, openFile])

  const handleCopyFromCanvas = useCallback(async () => {
    const dataUrl = canvasRef.current?.getSelectionDataUrl() ?? canvasRef.current?.toDataUrl()
    if (!dataUrl) return
    if (!navigator.clipboard?.write) {
      notify('Clipboard copy is not supported here')
      return
    }
    try {
      const blob = await (await fetch(dataUrl)).blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      notify('Copied to the clipboard')
    } catch {
      notify('Could not copy to the clipboard')
    }
  }, [notify])

  const handleCutFromCanvas = useCallback(async () => {
    const handle = canvasRef.current
    const hasSelection = handle?.getSelection() != null
    const dataUrl = handle?.getSelectionDataUrl() ?? handle?.toDataUrl()
    if (!dataUrl) return
    if (!navigator.clipboard?.write) {
      notify('Clipboard copy is not supported here')
      return
    }
    try {
      const blob = await (await fetch(dataUrl)).blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      if (hasSelection) handle?.cutSelection()
      else handle?.clear()
      notify('Cut to the clipboard')
    } catch {
      notify('Could not cut to the clipboard')
    }
  }, [notify])

  const handleSave = useCallback(() => {
    const dataUrl = canvasRef.current?.toDataUrl()
    if (!dataUrl) return
    downloadDataUrl(dataUrl, 'farbtopf.png')
    notify('Saved farbtopf.png')
  }, [notify])

  const handleOpenClick = useCallback(() => fileInputRef.current?.click(), [])

  const handleUndo = useCallback(() => canvasRef.current?.undo(), [])
  const handleRedo = useCallback(() => canvasRef.current?.redo(), [])
  const handleClear = useCallback(() => canvasRef.current?.clear(), [])

  const handleToggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.()
    } else {
      void document.documentElement.requestFullscreen?.()
    }
  }, [])

  const handleZoomFit = useCallback(() => {
    setZoom(fitZoom(canvasSize.width, canvasSize.height))
    setPan({ x: 0, y: 0 })
  }, [canvasSize.width, canvasSize.height])

  const handleCrop = useCallback(() => {
    canvasRef.current?.cropToSelection()
  }, [])

  const handleSelectAll = useCallback(() => {
    setTool('select')
    canvasRef.current?.selectAll()
  }, [])

  const handleInvertSelection = useCallback(() => {
    setTool('select')
    canvasRef.current?.invertSelection()
  }, [])

  const handleDeleteSelection = useCallback(() => {
    canvasRef.current?.deleteSelection()
  }, [])

  const handleScaleApply = useCallback(
    (width: number, height: number) => {
      canvasRef.current?.resize(width, height)
      setShowScaleDialog(false)
      notify(`Scaled to ${width} × ${height}`)
    },
    [notify],
  )

  const handleFlip = useCallback((axis: 'horizontal' | 'vertical') => {
    setLastFlip(axis)
    canvasRef.current?.flip(axis)
  }, [])

  const handleRotate = useCallback((degrees: number) => {
    setLastRotation(degrees)
    canvasRef.current?.rotate(degrees)
  }, [])

  const handleCustomRotateApply = useCallback(
    (degrees: number) => {
      setCustomRotation(degrees)
      setShowRotateDialog(false)
      handleRotate(degrees)
    },
    [handleRotate],
  )

  const handlePickColor = useCallback(
    (color: Rgba, slot: 'primary' | 'secondary') => {
      if (slot === 'primary') setPrimary(color)
      else setSecondary(color)
    },
    [],
  )

  const handleTextChange = useCallback((patch: Partial<TextOptions>) => {
    setText((current) => ({ ...current, ...patch }))
  }, [])

  const handleSwapColors = useCallback(() => {
    setPrimary(secondary)
    setSecondary(primary)
  }, [primary, secondary])

  const onSizeChange = useCallback((width: number, height: number) => {
    setCanvasSize({ width, height })
  }, [])

  const zoomIn = useCallback(() => {
    setZoom((value) => nextZoom(value, 1))
  }, [])

  const zoomOut = useCallback(() => {
    setZoom((value) => nextZoom(value, -1))
  }, [])

  useEffect(() => {
    const workspace = workspaceRef.current
    if (!workspace) return
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const target = nextZoom(zoom, event.deltaY < 0 ? 1 : -1)
      if (target === zoom) return
      const frame = workspace.querySelector('.canvas-frame')
      if (frame) {
        const workspaceRect = workspace.getBoundingClientRect()
        const frameRect = frame.getBoundingClientRect()
        const canvasX = (event.clientX - frameRect.left) / zoom
        const canvasY = (event.clientY - frameRect.top) / zoom
        const offsetX = (workspaceRect.width - canvasSize.width * target) / 2
        const offsetY = (workspaceRect.height - canvasSize.height * target) / 2
        setPan({
          x: event.clientX - workspaceRect.left - offsetX - canvasX * target,
          y: event.clientY - workspaceRect.top - offsetY - canvasY * target,
        })
      }
      setZoom(target)
    }
    workspace.addEventListener('wheel', handleWheel, { passive: false })
    return () => workspace.removeEventListener('wheel', handleWheel)
  }, [zoom, canvasSize.width, canvasSize.height])

  const handlePanDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 1) return
      const workspace = workspaceRef.current
      if (!workspace) return
      event.preventDefault()
      workspace.setPointerCapture?.(event.pointerId)
      panRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        panX: pan.x,
        panY: pan.y,
      }
      setPanning(true)
    },
    [pan.x, pan.y],
  )

  const handlePanMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    setPan({ x: pan.panX + (event.clientX - pan.startX), y: pan.panY + (event.clientY - pan.startY) })
  }, [])

  const handlePanUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    panRef.current = null
    setPanning(false)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      const modifier = event.ctrlKey || event.metaKey

      if (modifier) {
        const key = event.key.toLowerCase()
        if (key === 'z') {
          event.preventDefault()
          if (event.shiftKey) handleRedo()
          else handleUndo()
          return
        }
        if (key === 'y') {
          event.preventDefault()
          handleRedo()
          return
        }
        if (key === 's') {
          event.preventDefault()
          handleSave()
          return
        }
        if (key === 'o') {
          event.preventDefault()
          handleOpenClick()
          return
        }
        if (key === 'n') {
          event.preventDefault()
          setNewDialogOpen(true)
          return
        }
        if (key === 'a') {
          event.preventDefault()
          handleSelectAll()
          return
        }
        if (key === 'x') {
          event.preventDefault()
          void handleCutFromCanvas()
          return
        }
        if (key === 'c') {
          event.preventDefault()
          void handleCopyFromCanvas()
          return
        }
        if (key === 'v') {
          event.preventDefault()
          void handlePasteFromClipboard()
          return
        }
        return
      }

      if (event.key === '[' || event.key === ']') {
        event.preventDefault()
        const sizes: number[] = [...BRUSH_SIZES]
        const index = sizes.indexOf(brushSize)
        const next = event.key === '[' ? Math.max(0, index - 1) : Math.min(sizes.length - 1, index + 1)
        setBrushSize(sizes[next] ?? brushSize)
        return
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        zoomIn()
        return
      }
      if (event.key === '-') {
        event.preventDefault()
        zoomOut()
        return
      }

      if (event.key === 'Escape') {
        canvasRef.current?.clearSelection()
        return
      }
      if (event.key === 'Delete') {
        handleDeleteSelection()
        return
      }

      const lower = event.key.toLowerCase()
      if (lower === 'x') {
        handleSwapColors()
        return
      }
      if (lower === 'g') {
        setShowGrid((value) => !value)
        return
      }
      const shortcutShape = SHAPE_SHORTCUTS[lower]
      if (shortcutShape) {
        setShapeKind(shortcutShape)
        setTool('shape')
        return
      }
      const match = TOOLS.find((definition) => definition.shortcut.toLowerCase() === lower)
      if (match) setTool(match.id)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    brushSize,
    handleCopyFromCanvas,
    handleCutFromCanvas,
    handleDeleteSelection,
    handleOpenClick,
    handlePasteFromClipboard,
    handleRedo,
    handleSave,
    handleSelectAll,
    handleSwapColors,
    handleUndo,
    zoomIn,
    zoomOut,
  ])

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            event.preventDefault()
            void openFile(file)
            return
          }
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [openFile])

  const toolLabel = useMemo(() => toolById(tool).label, [tool])

  return (
    <div className="app">
      <MenuBar
        canUndo={canUndo}
        canRedo={canRedo}
        theme={theme}
        zoom={zoom}
        showGrid={showGrid}
        isFullscreen={isFullscreen}
        showMiniature={showMiniature}
        onNew={() => setNewDialogOpen(true)}
        onOpen={handleOpenClick}
        onSave={handleSave}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClear={handleClear}
        onCut={handleCutFromCanvas}
        onCopy={handleCopyFromCanvas}
        onPaste={handlePasteFromClipboard}
        onZoomChange={setZoom}
        onZoomFit={handleZoomFit}
        onToggleGrid={() => setShowGrid((value) => !value)}
        onToggleFullscreen={handleToggleFullscreen}
        onToggleMiniature={() => setShowMiniature((value) => !value)}
        onToggleTheme={toggleTheme}
      />

      <div className="topbar">
        <Ribbon
          tool={tool}
          onToolChange={setTool}
          brushSize={brushSize}
          onBrushSizeChange={setBrushSize}
          shapeFill={shapeFill}
          onShapeFillChange={setShapeFill}
          shapeKind={shapeKind}
          onShapeKindChange={setShapeKind}
          hasSelection={hasSelection}
          onCrop={handleCrop}
          onScale={() => setShowScaleDialog(true)}
          onFlip={handleFlip}
          onRotate={handleRotate}
          lastRotation={lastRotation}
          lastFlip={lastFlip}
          onCustomRotate={() => setShowRotateDialog(true)}
          onPaste={handlePasteFromClipboard}
          onCut={handleCutFromCanvas}
          onCopy={handleCopyFromCanvas}
          primary={primary}
          secondary={secondary}
          palette={DEFAULT_PALETTE}
          customColors={customColors.colors}
          onPrimaryChange={setPrimary}
          onSecondaryChange={setSecondary}
          onSwap={handleSwapColors}
          onAddCustomColor={customColors.add}
          onRemoveCustomColor={customColors.remove}
          transparentSelection={transparentSelection}
          onTransparentSelectionChange={setTransparentSelection}
          selectionShape={selectionShape}
          onSelectionShapeChange={setSelectionShape}
          onSelectAll={handleSelectAll}
          onInvertSelection={handleInvertSelection}
          onDeleteSelection={handleDeleteSelection}
          brush={brush}
          onBrushChange={setBrush}
        />
      </div>

      <div
        className={`workspace${panning ? ' panning' : ''}`}
        ref={workspaceRef}
        onPointerDown={handlePanDown}
        onPointerMove={handlePanMove}
        onPointerUp={handlePanUp}
        onPointerCancel={handlePanUp}
        onMouseDown={(event) => {
          if (event.button === 1) event.preventDefault()
        }}
        onAuxClick={(event) => event.preventDefault()}
      >
        <PaintCanvas
          ref={canvasRef}
          initialWidth={DEFAULT_CANVAS.width}
          initialHeight={DEFAULT_CANVAS.height}
          tool={tool}
          primary={primary}
          secondary={secondary}
          brushSize={brushSize}
          shapeFill={shapeFill}
          shapeKind={shapeKind}
          zoom={zoom}
          pan={pan}
          showGrid={showGrid}
          onHistoryChange={(undo, redo) => {
            setCanUndo(undo)
            setCanRedo(redo)
          }}
          onCursorMove={setCursor}
          onPickColor={handlePickColor}
          onSizeChange={onSizeChange}
          onSelectionChange={setHasSelection}
          onZoomClick={(direction) => setZoom((value) => nextZoom(value, direction))}
          transparentSelection={transparentSelection}
          selectionShape={selectionShape}
          brush={brush}
          text={text}
          onTextChange={handleTextChange}
          showMiniature={showMiniature}
          onPanChange={setPan}
        />
        <Scrollbars
          workspaceRef={workspaceRef}
          zoom={zoom}
          pan={pan}
          canvasSize={canvasSize}
          onPanChange={setPan}
        />
      </div>

      <StatusBar
        cursor={cursor}
        width={canvasSize.width}
        height={canvasSize.height}
        zoom={zoom}
        toolLabel={toolLabel}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid((value) => !value)}
        onZoomChange={setZoom}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="visually-hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void openFile(file)
          event.target.value = ''
        }}
      />

      {newDialogOpen ? (
        <NewCanvasDialog
          open={newDialogOpen}
          initialWidth={canvasSize.width}
          initialHeight={canvasSize.height}
          onCancel={() => setNewDialogOpen(false)}
          onCreate={handleNewDocument}
        />
      ) : null}

      {showScaleDialog ? (
        <ScaleImageDialog
          open={showScaleDialog}
          initialWidth={canvasSize.width}
          initialHeight={canvasSize.height}
          onCancel={() => setShowScaleDialog(false)}
          onApply={handleScaleApply}
        />
      ) : null}

      {showRotateDialog ? (
        <RotateDialog
          open={showRotateDialog}
          initialDegrees={customRotation}
          onCancel={() => setShowRotateDialog(false)}
          onApply={handleCustomRotateApply}
        />
      ) : null}

      {message ? <div className="toast">{message}</div> : null}
    </div>
  )
}

export default App
