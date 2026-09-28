import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ColorPalette } from './components/ColorPalette'
import { HelpDialog } from './components/HelpDialog'
import { MenuBar } from './components/MenuBar'
import { NewCanvasDialog } from './components/NewCanvasDialog'
import { PaintCanvas } from './components/PaintCanvas'
import type { PaintCanvasHandle } from './components/PaintCanvas'
import { StatusBar } from './components/StatusBar'
import { ToolBar } from './components/ToolBar'
import type { Rgba } from './core/color'
import type { Point } from './core/geometry'
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
  const [helpOpen, setHelpOpen] = useState(false)
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
    handleOpenClick,
    handleRedo,
    handleSave,
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
        showGrid={showGrid}
        theme={theme}
        onNew={() => setNewDialogOpen(true)}
        onOpen={handleOpenClick}
        onSave={handleSave}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClear={handleClear}
        onToggleGrid={() => setShowGrid((value) => !value)}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomReset={() => setZoom(1)}
        onToggleTheme={toggleTheme}
        onShowHelp={() => setHelpOpen(true)}
      />

      <div className="topbar">
        <ToolBar
          tool={tool}
          onToolChange={setTool}
          brushSize={brushSize}
          onBrushSizeChange={setBrushSize}
          shapeFill={shapeFill}
          onShapeFillChange={setShapeFill}
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid((value) => !value)}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClear={handleClear}
        />

        <ColorPalette
          primary={primary}
          secondary={secondary}
          palette={DEFAULT_PALETTE}
          onPrimaryChange={setPrimary}
          onSecondaryChange={setSecondary}
          onSwap={handleSwapColors}
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
        />
      </div>

      <StatusBar
        cursor={cursor}
        width={canvasSize.width}
        height={canvasSize.height}
        zoom={zoom}
        toolLabel={toolLabel}
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

      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />

      {message ? <div className="toast">{message}</div> : null}
    </div>
  )
}

export default App
