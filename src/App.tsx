import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MenuBar } from './components/MenuBar'
import { NewCanvasDialog } from './components/NewCanvasDialog'
import { PaintCanvas } from './components/PaintCanvas'
import type { PaintCanvasHandle } from './components/PaintCanvas'
import { Ribbon } from './components/Ribbon'
import { RotateDialog } from './components/RotateDialog'
import { ScaleImageDialog } from './components/ScaleImageDialog'
import { StatusBar } from './components/StatusBar'
import type { Rgba } from './core/color'
import type { Point } from './core/geometry'
import type { SelectionShape } from './core/selection'
import { DEFAULT_CANVAS, DEFAULT_PALETTE } from './core/palette'
import { DEFAULT_PRIMARY, DEFAULT_SECONDARY } from './core/palette'
import { TOOLS, BRUSH_SIZES, toolById } from './core/tools'
import type { ShapeFill, ToolId } from './core/tools'
import { ZOOM_LEVELS, nextZoom } from './core/zoom'
import { useTheme } from './hooks/useTheme'
import { downloadDataUrl, readFileAsDataUrl } from './render/image'

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

  const { theme, toggleTheme } = useTheme()

  const [tool, setTool] = useState<ToolId>('brush')
  const [primary, setPrimary] = useState<Rgba>(DEFAULT_PRIMARY)
  const [secondary, setSecondary] = useState<Rgba>(DEFAULT_SECONDARY)
  const [brushSize, setBrushSize] = useState(4)
  const [shapeFill, setShapeFill] = useState<ShapeFill>('outline')
  const [zoom, setZoom] = useState(1)
  const [showGrid, setShowGrid] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [cursor, setCursor] = useState<Point | null>(null)
  const [canvasSize, setCanvasSize] = useState(DEFAULT_CANVAS)
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [showScaleDialog, setShowScaleDialog] = useState(false)
  const [showRotateDialog, setShowRotateDialog] = useState(false)
  const [customRotation, setCustomRotation] = useState(0)
  const [hasSelection, setHasSelection] = useState(false)
  const [transparentSelection, setTransparentSelection] = useState(false)
  const [selectionShape, setSelectionShape] = useState<SelectionShape>('rectangle')
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

  const handleNewDocument = useCallback(
    (width: number, height: number) => {
      canvasRef.current?.newDocument(width, height)
      setZoom(fitZoom(width, height))
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
    canvasRef.current?.flip(axis)
  }, [])

  const handleRotate = useCallback((degrees: number) => {
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
      const match = TOOLS.find((definition) => definition.shortcut.toLowerCase() === lower)
      if (match) setTool(match.id)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    brushSize,
    handleDeleteSelection,
    handleOpenClick,
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
        onNew={() => setNewDialogOpen(true)}
        onOpen={handleOpenClick}
        onSave={handleSave}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClear={handleClear}
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
          hasSelection={hasSelection}
          onCrop={handleCrop}
          onScale={() => setShowScaleDialog(true)}
          onFlip={handleFlip}
          onRotate={handleRotate}
          onCustomRotate={() => setShowRotateDialog(true)}
          onPaste={handlePasteFromClipboard}
          onCut={handleCutFromCanvas}
          onCopy={handleCopyFromCanvas}
          primary={primary}
          secondary={secondary}
          palette={DEFAULT_PALETTE}
          onPrimaryChange={setPrimary}
          onSecondaryChange={setSecondary}
          onSwap={handleSwapColors}
          transparentSelection={transparentSelection}
          onTransparentSelectionChange={setTransparentSelection}
          selectionShape={selectionShape}
          onSelectionShapeChange={setSelectionShape}
          onSelectAll={handleSelectAll}
          onInvertSelection={handleInvertSelection}
          onDeleteSelection={handleDeleteSelection}
        />
      </div>

      <div className="workspace">
        <PaintCanvas
          ref={canvasRef}
          initialWidth={DEFAULT_CANVAS.width}
          initialHeight={DEFAULT_CANVAS.height}
          tool={tool}
          primary={primary}
          secondary={secondary}
          brushSize={brushSize}
          shapeFill={shapeFill}
          zoom={zoom}
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
