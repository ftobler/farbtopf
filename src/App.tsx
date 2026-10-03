import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { ContextMenu } from './components/ContextMenu'
import { MenuBar } from './components/MenuBar'
import { MenuDivider, MenuItem, MenuSubmenu } from './components/Dropdown'
import {
  CopyIcon,
  CropIcon,
  CutIcon,
  FlipIcon,
  GaussianBlurIcon,
  FlipVerticalIcon,
  InvertColorsIcon,
  InvertSelectionIcon,
  PasteIcon,
  Rotate180Icon,
  RotateIcon,
  RotateLeftIcon,
  RotateRightIcon,
  ScaleIcon,
  SelectIcon,
  TrashIcon,
} from './components/icons'
import { LayersPanel } from './components/LayersPanel'
import { ConfirmDialog } from './components/ConfirmDialog'
import { NewCanvasDialog } from './components/NewCanvasDialog'
import { PaintCanvas } from './components/PaintCanvas'
import type { PaintCanvasHandle } from './components/PaintCanvas'
import { Ribbon } from './components/Ribbon'
import { BlurDialog } from './components/BlurDialog'
import { RotateDialog } from './components/RotateDialog'
import { CanvasSizeDialog } from './components/CanvasSizeDialog'
import { ScaleImageDialog } from './components/ScaleImageDialog'
import { Scrollbars } from './components/Scrollbars'
import { StatusBar } from './components/StatusBar'
import { ToolSliders } from './components/ToolSliders'
import { BrushPreview } from './components/BrushPreview'
import type { BrushId } from './core/brushes'
import type { Rgba } from './core/color'
import type { Point } from './core/geometry'
import type { LayerInfo } from './core/layers'
import type { SelectionShape } from './core/selection'
import type { ShapeKind } from './core/shapes'
import { DEFAULT_CANVAS, DEFAULT_PALETTE } from './core/palette'
import { DEFAULT_PRIMARY, DEFAULT_SECONDARY } from './core/palette'
import { TOOLS, rightClickActs, toolById } from './core/tools'
import { DEFAULT_TOOL_SETTINGS, clampOpacity, clampSize, isSizedTool, stepSize } from './core/toolSettings'
import type { SizedTool, ToolSettingsMap } from './core/toolSettings'
import type { ShapeFill, ToolId } from './core/tools'
import { ZOOM_LEVELS, displayZoom, nextZoom } from './core/zoom'
import { useCustomColors } from './hooks/useCustomColors'
import { useDevicePixelRatio } from './hooks/useDevicePixelRatio'
import { useTheme } from './hooks/useTheme'
import { downloadDataUrl, readFileAsDataUrl } from './render/image'
import {
  canPickFiles,
  canSaveFiles,
  dataUrlToBlob,
  imageMimeFor,
  isEncodableName,
  pickImageFile,
  pickSaveFile,
  pngName,
  writeFile,
} from './render/fileAccess'
import { DEFAULT_TEXT_OPTIONS } from './render/text'
import type { TextOptions } from './render/text'

/** Single-key shortcuts that pick a specific shape. */
const SHAPE_SHORTCUTS: Record<string, ShapeKind> = { l: 'line', r: 'rectangle', o: 'ellipse' }

/** How long loading an image may take before the busy indicator shows, so instant loads do not flicker. */
const BUSY_DELAY_MS = 150
/** Decoding an image file at least this big blocks long enough to show the busy indicator right away. */
const LARGE_IMAGE_BYTES = 1_000_000

/** Resolves once the browser has had a chance to paint. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    const afterFrame = () => window.setTimeout(resolve, 0)
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(afterFrame)
    else afterFrame()
  })
}

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

/** Wheel delta, in pixels, that a single zoom step waits for. */
const WHEEL_ZOOM_STEP = 100

/**
 * A wheel event's deltaY normalized to the pixel scale `WHEEL_ZOOM_STEP` counts
 * in. A line-mode notch (three lines) and a page both map to one step; pixel
 * deltas pass through so trackpad events keep accumulating.
 */
function wheelZoomDelta(event: WheelEvent): number {
  if (event.deltaMode === 1) return event.deltaY * (WHEEL_ZOOM_STEP / 3)
  if (event.deltaMode === 2) return event.deltaY * WHEEL_ZOOM_STEP
  return event.deltaY
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

function App() {
  const canvasRef = useRef<PaintCanvasHandle | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  /** Where Save writes to: the file the document was opened from or last saved as, when the browser gave us one. */
  const fileHandleRef = useRef<FileSystemFileHandle | null>(null)
  const messageTimer = useRef<number | null>(null)
  const busyRef = useRef(false)
  const busyShownRef = useRef(false)
  const busyTimer = useRef<number | null>(null)
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const panRef = useRef<{ pointerId: number; startX: number; startY: number; panX: number; panY: number } | null>(null)
  /** Wheel delta carried over between events so trackpads step one zoom level per gesture. */
  const wheelAccumRef = useRef(0)

  const { theme, toggleTheme } = useTheme()
  const customColors = useCustomColors()

  const [tool, setTool] = useState<ToolId>('brush')
  const [primary, setPrimary] = useState<Rgba>(DEFAULT_PRIMARY)
  const [secondary, setSecondary] = useState<Rgba>(DEFAULT_SECONDARY)
  // Size and opacity belong to each sized tool (see toolSettings.ts). While an unsized
  // tool is active, the size controls keep acting on the last sized tool.
  const [toolSettings, setToolSettings] = useState<ToolSettingsMap>(DEFAULT_TOOL_SETTINGS)
  const [lastSizedTool, setLastSizedTool] = useState<SizedTool>('brush')
  if (isSizedTool(tool) && tool !== lastSizedTool) setLastSizedTool(tool)
  const sizedTool: SizedTool = isSizedTool(tool) ? tool : lastSizedTool
  const brushSize = toolSettings[sizedTool].size
  const opacity = toolSettings[sizedTool].opacity
  const setBrushSize = useCallback(
    (size: number) =>
      setToolSettings((current) => ({ ...current, [sizedTool]: { ...current[sizedTool], size: clampSize(size) } })),
    [sizedTool],
  )
  /** True while a tool slider is being dragged; the brush preview shows meanwhile. */
  const [sliding, setSliding] = useState(false)
  const setOpacity = useCallback(
    (value: number) =>
      setToolSettings((current) => ({
        ...current,
        [sizedTool]: { ...current[sizedTool], opacity: clampOpacity(value) },
      })),
    [sizedTool],
  )
  const [brush, setBrush] = useState<BrushId>('round')
  const [text, setText] = useState<TextOptions>(DEFAULT_TEXT_OPTIONS)
  const [shapeFill, setShapeFill] = useState<ShapeFill>('outline')
  const [shapeKind, setShapeKind] = useState<ShapeKind>('rectangle')
  const [zoom, setZoom] = useState(1)
  const pixelRatio = useDevicePixelRatio()
  // What the canvas is drawn at; `zoom` stays the nominal level the UI shows.
  const shownZoom = displayZoom(zoom, pixelRatio)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [panning, setPanning] = useState(false)
  const [showGrid, setShowGrid] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [cursor, setCursor] = useState<Point | null>(null)
  const [selectionSize, setSelectionSize] = useState<{ width: number; height: number } | null>(null)
  const [canvasSize, setCanvasSize] = useState(DEFAULT_CANVAS)
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  /** A destructive action waiting on the user's answer to the unsaved-changes confirmation. */
  const [pendingAction, setPendingAction] = useState<{ run: () => void } | null>(null)
  /** True while files from the OS are dragged over the window. */
  const [dropTarget, setDropTarget] = useState(false)
  const [showScaleDialog, setShowScaleDialog] = useState(false)
  /** Size of the selection the Scale dialog acts on, or null to scale the whole image. */
  const [scaleSelection, setScaleSelection] = useState<{ width: number; height: number } | null>(null)
  const [showCanvasSizeDialog, setShowCanvasSizeDialog] = useState(false)
  const [showRotateDialog, setShowRotateDialog] = useState(false)
  /** What the blur dialog will blur, or null while it is closed. */
  const [blurTarget, setBlurTarget] = useState<'selection' | 'image' | null>(null)
  const [blurRadius, setBlurRadius] = useState(2)
  const [customRotation, setCustomRotation] = useState(0)
  const [lastRotation, setLastRotation] = useState(90)
  const [lastFlip, setLastFlip] = useState<'horizontal' | 'vertical'>('horizontal')
  const [hasSelection, setHasSelection] = useState(false)
  const [transparentSelection, setTransparentSelection] = useState(false)
  const [selectionShape, setSelectionShape] = useState<SelectionShape>('rectangle')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showMiniature, setShowMiniature] = useState(false)
  const [contextMenu, setContextMenu] = useState<Point | null>(null)
  const [showLayers, setShowLayers] = useState(false)
  const [layers, setLayers] = useState<{ list: LayerInfo[]; active: number }>({ list: [], active: 0 })
  const [message, setMessage] = useState<string | null>(null)
  const [busyShown, setBusyShown] = useState(false)
  /** Name of the file the document came from or was saved to; null for a new image. */
  const [fileName, setFileName] = useState<string | null>(null)
  /** Counts edits; the document is dirty while it differs from the count at the last save, open or New. */
  const revisionRef = useRef(0)
  const [savedRevision, setSavedRevision] = useState(0)
  const [revision, setRevision] = useState(0)
  /** Unplaced work on the canvas (a pending shape, an open text box with text) is unsaved too. */
  const [pending, setPending] = useState(false)
  const dirty = revision !== savedRevision || pending
  const modalOpen =
    newDialogOpen ||
    showScaleDialog ||
    showCanvasSizeDialog ||
    showRotateDialog ||
    blurTarget !== null ||
    pendingAction !== null

  /** Runs `action` right away, or after the user confirms losing unsaved work. */
  const requestDestructive = useCallback(
    (action: () => void) => {
      if (dirty) setPendingAction({ run: action })
      else action()
    },
    [dirty],
  )

  const cancelPendingAction = useCallback(() => setPendingAction(null), [])

  const confirmPendingAction = useCallback(() => {
    const action = pendingAction?.run
    setPendingAction(null)
    action?.()
  }, [pendingAction])

  const handleDocumentChange = useCallback(() => {
    revisionRef.current += 1
    setRevision(revisionRef.current)
  }, [])

  /** Marks the document as saved at `at` (now by default); edits made since keep it dirty. */
  const markSaved = useCallback((at: number = revisionRef.current) => setSavedRevision(at), [])

  const notify = useCallback((text: string) => {
    setMessage(text)
    if (messageTimer.current !== null) window.clearTimeout(messageTimer.current)
    messageTimer.current = window.setTimeout(() => setMessage(null), 2600)
  }, [])

  useEffect(() => {
    return () => {
      if (messageTimer.current !== null) window.clearTimeout(messageTimer.current)
      if (busyTimer.current !== null) window.clearTimeout(busyTimer.current)
    }
  }, [])

  /** Shows the busy indicator now (only while a load is running), committing it synchronously. */
  const showBusy = useCallback(() => {
    if (busyTimer.current !== null) {
      window.clearTimeout(busyTimer.current)
      busyTimer.current = null
    }
    if (!busyRef.current || busyShownRef.current) return
    busyShownRef.current = true
    flushSync(() => setBusyShown(true))
  }, [])

  /**
   * Runs the image load `task` behind the busy indicator, which shows once it takes
   * longer than BUSY_DELAY_MS. A load requested while another is running is ignored.
   */
  const runBusy = useCallback(
    async (task: () => Promise<void>) => {
      if (busyRef.current) return
      busyRef.current = true
      busyTimer.current = window.setTimeout(showBusy, BUSY_DELAY_MS)
      try {
        await task()
      } finally {
        if (busyTimer.current !== null) window.clearTimeout(busyTimer.current)
        busyTimer.current = null
        busyRef.current = false
        busyShownRef.current = false
        setBusyShown(false)
      }
    },
    [showBusy],
  )

  /**
   * Call before decoding `bytes` of image, which blocks the main thread: a large image
   * shows the indicator at once, and a showing indicator gets a frame to paint first.
   */
  const beforeDecode = useCallback(
    async (bytes: number) => {
      if (bytes >= LARGE_IMAGE_BYTES) showBusy()
      if (busyShownRef.current) await nextPaint()
    },
    [showBusy],
  )

  useEffect(() => {
    document.title = `${dirty ? '*' : ''}${fileName ? `${fileName} - ` : ''}Farbtopf`
  }, [dirty, fileName])

  useEffect(() => {
    if (!dirty) return
    // Makes the browser ask before leaving the page with unsaved changes.
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = true
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])

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
      fileHandleRef.current = null
      setFileName(null)
      markSaved()
      notify(`New ${width} × ${height} canvas`)
    },
    [markSaved, notify],
  )

  const openNewDialog = useCallback(() => {
    requestDestructive(() => setNewDialogOpen(true))
  }, [requestDestructive])

  const openFile = useCallback(
    (file: File, handle: FileSystemFileHandle | null = null) =>
      runBusy(async () => {
        try {
          const dataUrl = await readFileAsDataUrl(file)
          await beforeDecode(file.size)
          await canvasRef.current?.loadDataUrl(dataUrl)
          const size = canvasRef.current?.getSize()
          if (size) {
            setCanvasSize(size)
            setZoom(fitZoom(size.width, size.height))
            setPan({ x: 0, y: 0 })
          }
          setCursor(null)
          fileHandleRef.current = handle
          setFileName(file.name)
          markSaved()
          notify(`Opened ${file.name}`)
        } catch {
          notify('Could not open that image')
        }
      }),
    [beforeDecode, markSaved, notify, runBusy],
  )

  /** Pastes an image file as a floating selection that the select tool can move (without the busy indicator). */
  const pasteBlob = useCallback(
    async (file: Blob) => {
      try {
        const dataUrl = await readFileAsDataUrl(file)
        const handle = canvasRef.current
        if (!handle) return
        await beforeDecode(file.size)
        setTool('select')
        await handle.pasteDataUrl(dataUrl)
      } catch {
        notify('Could not paste that image')
      }
    },
    [beforeDecode, notify],
  )

  const pasteFile = useCallback((file: Blob) => runBusy(() => pasteBlob(file)), [pasteBlob, runBusy])

  const handlePasteFromClipboard = useCallback(async () => {
    if (!navigator.clipboard?.read) {
      notify('Clipboard paste is not supported here')
      return
    }
    await runBusy(async () => {
      try {
        const items = await navigator.clipboard.read()
        for (const item of items) {
          const type = item.types.find((entry) => entry.startsWith('image/'))
          if (!type) continue
          await pasteBlob(await item.getType(type))
          return
        }
        notify('No image in the clipboard')
      } catch {
        notify('Could not paste from the clipboard')
      }
    })
  }, [notify, pasteBlob, runBusy])

  const copyDataUrl = useCallback(
    async (dataUrl: string | undefined) => {
      if (!dataUrl) return
      if (!navigator.clipboard?.write) {
        notify('Clipboard copy is not supported here')
        return
      }
      try {
        const blob = dataUrlToBlob(dataUrl)
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        notify('Copied to the clipboard')
      } catch {
        notify('Could not copy to the clipboard')
      }
    },
    [notify],
  )

  const handleCopyFromCanvas = useCallback(
    () => copyDataUrl(canvasRef.current?.getSelectionDataUrl() ?? canvasRef.current?.toDataUrl()),
    [copyDataUrl],
  )

  const handleCopyVisible = useCallback(() => copyDataUrl(canvasRef.current?.getVisibleDataUrl()), [copyDataUrl])

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
      const blob = dataUrlToBlob(dataUrl)
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      if (hasSelection) handle?.cutSelection()
      else handle?.clear()
      notify('Cut to the clipboard')
    } catch {
      notify('Could not cut to the clipboard')
    }
  }, [notify])

  /** Hands the image to the browser as a PNG download. Returns the file name, or null when there was nothing to save. */
  const downloadPng = useCallback(() => {
    const dataUrl = canvasRef.current?.toDataUrl()
    if (!dataUrl) return null
    const name = pngName(fileName)
    downloadDataUrl(dataUrl, name)
    return name
  }, [fileName])

  const handleDownload = useCallback(() => {
    const name = downloadPng()
    if (name) notify(`Downloaded ${name}`)
  }, [downloadPng, notify])

  /** Writes the image to `handle` in that file's format. */
  const saveToHandle = useCallback(
    async (handle: FileSystemFileHandle) => {
      try {
        const dataUrl = canvasRef.current?.toDataUrl(imageMimeFor(handle.name))
        if (!dataUrl) return
        const saving = revisionRef.current
        await writeFile(handle, dataUrlToBlob(dataUrl))
        fileHandleRef.current = handle
        setFileName(handle.name)
        markSaved(saving)
        notify(`Saved ${handle.name}`)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          notify(`Permission to save ${handle.name} was denied`)
        } else {
          notify(`Could not save ${handle.name}`)
        }
      }
    },
    [markSaved, notify],
  )

  const handleSaveAs = useCallback(async () => {
    if (!canSaveFiles()) {
      // Without the File System Access API a download is the only way to save,
      // so here it counts as saving (unlike File > Download).
      const name = downloadPng()
      if (name) {
        markSaved()
        notify(`Saved ${name}`)
      }
      return
    }
    let handle: FileSystemFileHandle | null
    try {
      const suggested = fileName && isEncodableName(fileName) ? fileName : pngName(fileName)
      handle = await pickSaveFile(suggested)
    } catch {
      notify('Could not save the image')
      return
    }
    if (handle) await saveToHandle(handle)
  }, [downloadPng, fileName, markSaved, notify, saveToHandle])

  const handleSave = useCallback(async () => {
    const handle = fileHandleRef.current
    if (handle && isEncodableName(handle.name)) await saveToHandle(handle)
    else await handleSaveAs()
  }, [handleSaveAs, saveToHandle])

  const openFileFromPicker = useCallback(async () => {
    if (!canPickFiles()) {
      fileInputRef.current?.click()
      return
    }
    try {
      const picked = await pickImageFile()
      if (picked) await openFile(picked.file, picked.handle)
    } catch {
      notify('Could not open that image')
    }
  }, [notify, openFile])

  const handleOpenClick = useCallback(() => {
    requestDestructive(() => {
      void openFileFromPicker()
    })
  }, [openFileFromPicker, requestDestructive])

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

  const handleInvertColors = useCallback(() => {
    canvasRef.current?.invertColors()
  }, [])

  const handleContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      // Tools that act on a right-click (zoom out, secondary colour) get no menu over it,
      // and a right-click leaves a pending shape alone, menu included.
      if (rightClickActs(tool) || canvasRef.current?.hasPendingShape()) return
      setContextMenu({ x: event.clientX, y: event.clientY })
    },
    [tool],
  )

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const openScaleDialog = useCallback(() => {
    const selection = canvasRef.current?.getSelection() ?? null
    setScaleSelection(selection ? { width: selection.width, height: selection.height } : null)
    setShowScaleDialog(true)
  }, [])

  const handleScaleApply = useCallback(
    (width: number, height: number) => {
      canvasRef.current?.scale(width, height)
      setShowScaleDialog(false)
      notify(`Scaled ${scaleSelection ? 'selection' : 'image'} to ${width} × ${height}`)
    },
    [notify, scaleSelection],
  )

  const handleCanvasSizeApply = useCallback(
    (width: number, height: number) => {
      // Same path as dragging the canvas edge handles: no scaling, content stays top-left.
      canvasRef.current?.resizeCanvas({ x: 0, y: 0, width, height })
      setShowCanvasSizeDialog(false)
      notify(`Resized canvas to ${width} × ${height}`)
    },
    [notify],
  )

  const openBlurDialog = useCallback(() => {
    setBlurTarget(canvasRef.current?.getSelection() ? 'selection' : 'image')
  }, [])

  const handleBlurApply = useCallback(
    (radius: number) => {
      setBlurRadius(radius)
      setBlurTarget(null)
      canvasRef.current?.blur(radius)
      notify(`Blurred ${blurTarget ?? 'image'} by ${radius} px`)
    },
    [blurTarget, notify],
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

  const handleLayersChange = useCallback((list: LayerInfo[], active: number) => {
    setLayers({ list, active })
  }, [])

  const onSizeChange = useCallback((width: number, height: number) => {
    setCanvasSize({ width, height })
  }, [])

  const handleHistoryChange = useCallback((undo: boolean, redo: boolean) => {
    setCanUndo(undo)
    setCanRedo(redo)
  }, [])

  const handleZoomClick = useCallback((direction: 1 | -1) => {
    setZoom((value) => nextZoom(value, direction))
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
      const delta = wheelZoomDelta(event)
      if (delta === 0) return
      if (Math.sign(delta) !== Math.sign(wheelAccumRef.current)) wheelAccumRef.current = 0
      wheelAccumRef.current += delta
      if (Math.abs(wheelAccumRef.current) < WHEEL_ZOOM_STEP) return
      const direction: 1 | -1 = wheelAccumRef.current < 0 ? 1 : -1
      wheelAccumRef.current %= WHEEL_ZOOM_STEP
      const target = nextZoom(zoom, direction)
      if (target === zoom) return
      const frame = workspace.querySelector('.canvas-frame')
      if (frame) {
        const workspaceRect = workspace.getBoundingClientRect()
        const frameRect = frame.getBoundingClientRect()
        const shownTarget = displayZoom(target, pixelRatio)
        const canvasX = (event.clientX - frameRect.left) / shownZoom
        const canvasY = (event.clientY - frameRect.top) / shownZoom
        const offsetX = (workspaceRect.width - canvasSize.width * shownTarget) / 2
        const offsetY = (workspaceRect.height - canvasSize.height * shownTarget) / 2
        setPan({
          x: event.clientX - workspaceRect.left - offsetX - canvasX * shownTarget,
          y: event.clientY - workspaceRect.top - offsetY - canvasY * shownTarget,
        })
      }
      setZoom(target)
    }
    workspace.addEventListener('wheel', handleWheel, { passive: false })
    return () => workspace.removeEventListener('wheel', handleWheel)
  }, [zoom, shownZoom, pixelRatio, canvasSize.width, canvasSize.height])

  const handlePanDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // A plain click on the gray background itself (not the canvas, a handle,
      // scrollbar or floating panel) settles the selection and deselects; with the
      // Select tool, dragging on from there selects the part of the image it covers.
      if (event.button === 0 && event.target === event.currentTarget) {
        canvasRef.current?.clickOutside(event.clientX, event.clientY, event.pointerId)
        return
      }
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
      if (modalOpen) return
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
          void handleSave()
          return
        }
        if (key === 'o') {
          event.preventDefault()
          void handleOpenClick()
          return
        }
        if (key === 'n') {
          event.preventDefault()
          openNewDialog()
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
        return
      }

      // Alt+<key> combinations belong to the browser/OS, not to the plain
      // single-key shortcuts below. Ctrl/Meta combinations were handled above.
      if (event.altKey) return

      if (event.key === '[' || event.key === ']') {
        event.preventDefault()
        setBrushSize(stepSize(brushSize, event.key === '[' ? -1 : 1))
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
        // While the context menu is open Escape only dismisses it; it must not
        // also clear the canvas selection or switch tools.
        if (contextMenu) return
        // A pending shape or freeform shape handles Escape itself by discarding it.
        if (canvasRef.current?.hasPendingShape()) return
        canvasRef.current?.clearSelection()
        setTool('select')
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
    setBrushSize,
    contextMenu,
    modalOpen,
    handleCopyFromCanvas,
    handleCutFromCanvas,
    handleDeleteSelection,
    handleOpenClick,
    openNewDialog,
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
      if (items) {
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) {
              event.preventDefault()
              void pasteFile(file)
              return
            }
          }
        }
      }
      if (isTypingTarget(event.target)) return
      if (!navigator.clipboard?.read) return
      // A text paste has no image for us, and complaining about it would be noise.
      const types = Array.from(items ?? []).map((item) => item.type)
      if (types.includes('text/plain') || types.includes('text/html')) return
      void handlePasteFromClipboard()
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [handlePasteFromClipboard, pasteFile])

  useEffect(() => {
    const carriesFiles = (event: DragEvent) => Boolean(event.dataTransfer?.types.includes('Files'))
    // Dropping a file anywhere would otherwise make the browser navigate to it.
    const handleDragOver = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      setDropTarget(true)
    }
    const handleDragLeave = (event: DragEvent) => {
      // relatedTarget is null once the pointer leaves the window itself.
      if (!event.relatedTarget) setDropTarget(false)
    }
    const handleDrop = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      setDropTarget(false)
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length === 0) return
      const index = files.findIndex((file) => file.type.startsWith('image/'))
      if (index < 0) {
        notify('Could not open that image')
        return
      }
      // The handle, where the browser offers one, must be requested while the drop event is running.
      const items = Array.from(event.dataTransfer?.items ?? []).filter((item) => item.kind === 'file')
      const pending = items[index]?.getAsFileSystemHandle?.() ?? null
      const file = files[index]
      requestDestructive(() => {
        void (async () => {
          const handle = await Promise.resolve(pending).catch(() => null)
          await openFile(file, handle?.kind === 'file' ? (handle as FileSystemFileHandle) : null)
        })()
      })
    }
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
    }
  }, [notify, openFile, requestDestructive])

  const toolLabel = useMemo(() => toolById(tool).label, [tool])

  return (
    <div className={`app${dropTarget ? ' app--drop-target' : ''}${busyShown ? ' app--busy' : ''}`}>
      <MenuBar
        canUndo={canUndo}
        canRedo={canRedo}
        theme={theme}
        zoom={zoom}
        showGrid={showGrid}
        isFullscreen={isFullscreen}
        showMiniature={showMiniature}
        onNew={openNewDialog}
        onOpen={handleOpenClick}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onDownload={handleDownload}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClear={handleClear}
        onCut={handleCutFromCanvas}
        onCopy={handleCopyFromCanvas}
        onPaste={handlePasteFromClipboard}
        onCopyVisible={handleCopyVisible}
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
          onScale={openScaleDialog}
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
          showLayers={showLayers}
          onToggleLayers={() => setShowLayers((value) => !value)}
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
        aria-busy={busyShown}
        onPointerDown={handlePanDown}
        onPointerMove={handlePanMove}
        onPointerUp={handlePanUp}
        onPointerCancel={handlePanUp}
        onMouseDown={(event) => {
          if (event.button === 1) event.preventDefault()
        }}
        onAuxClick={(event) => event.preventDefault()}
        onContextMenu={handleContextMenu}
      >
        <PaintCanvas
          ref={canvasRef}
          initialWidth={DEFAULT_CANVAS.width}
          initialHeight={DEFAULT_CANVAS.height}
          tool={tool}
          primary={primary}
          secondary={secondary}
          brushSize={brushSize}
          opacity={opacity}
          shapeFill={shapeFill}
          shapeKind={shapeKind}
          zoom={shownZoom}
          pan={pan}
          showGrid={showGrid}
          onHistoryChange={handleHistoryChange}
          onCursorMove={setCursor}
          onPickColor={handlePickColor}
          onSizeChange={onSizeChange}
          onSelectionChange={setHasSelection}
          onSelectionSizeChange={setSelectionSize}
          onZoomClick={handleZoomClick}
          transparentSelection={transparentSelection}
          selectionShape={selectionShape}
          brush={brush}
          text={text}
          onTextChange={handleTextChange}
          showMiniature={showMiniature}
          onPanChange={setPan}
          onLayersChange={handleLayersChange}
          onDocumentChange={handleDocumentChange}
          onPendingChange={setPending}
        />
        <Scrollbars
          workspaceRef={workspaceRef}
          zoom={shownZoom}
          pan={pan}
          canvasSize={canvasSize}
          onPanChange={setPan}
        />
        {isSizedTool(tool) ? (
          <ToolSliders
            size={brushSize}
            opacity={opacity}
            onSizeChange={setBrushSize}
            onOpacityChange={setOpacity}
            onSlidingChange={setSliding}
          />
        ) : null}
        {sliding && isSizedTool(tool) ? (
          <BrushPreview
            tool={tool}
            brush={brush}
            size={brushSize}
            opacity={opacity}
            color={tool === 'eraser' ? secondary : primary}
            zoom={shownZoom}
          />
        ) : null}
        {showLayers ? (
          <LayersPanel
            layers={layers.list}
            active={layers.active}
            onSelect={(index) => canvasRef.current?.selectLayer(index)}
            onAdd={() => canvasRef.current?.addLayer()}
            onDelete={(index) => canvasRef.current?.deleteLayer(index)}
            onMove={(from, to) => canvasRef.current?.moveLayer(from, to)}
          />
        ) : null}
      </div>

      {/* Outside the workspace, whose aria-busy would otherwise hold back the announcement. */}
      <div className="busy-status" role="status" aria-live="polite">
        {busyShown ? (
          <div className="busy-indicator">
            <span className="busy-spinner" aria-hidden="true" />
            Loading image…
          </div>
        ) : null}
      </div>

      <StatusBar
        cursor={cursor}
        selectionSize={selectionSize}
        width={canvasSize.width}
        height={canvasSize.height}
        zoom={zoom}
        toolLabel={toolLabel}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid((value) => !value)}
        onZoomChange={setZoom}
        onCanvasSizeClick={() => setShowCanvasSizeDialog(true)}
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

      {pendingAction ? (
        <ConfirmDialog
          open
          title="Discard unsaved changes?"
          message="The current image has unsaved changes. Discarding will lose them for good."
          confirmLabel="Discard"
          onCancel={cancelPendingAction}
          onConfirm={confirmPendingAction}
        />
      ) : null}

      {showScaleDialog ? (
        <ScaleImageDialog
          open={showScaleDialog}
          initialWidth={scaleSelection?.width ?? canvasSize.width}
          initialHeight={scaleSelection?.height ?? canvasSize.height}
          title={scaleSelection ? 'Scale selection' : 'Scale image'}
          onCancel={() => setShowScaleDialog(false)}
          onApply={handleScaleApply}
        />
      ) : null}

      {showCanvasSizeDialog ? (
        <CanvasSizeDialog
          open={showCanvasSizeDialog}
          initialWidth={canvasSize.width}
          initialHeight={canvasSize.height}
          onCancel={() => setShowCanvasSizeDialog(false)}
          onApply={handleCanvasSizeApply}
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

      {blurTarget ? (
        <BlurDialog
          open
          title={blurTarget === 'selection' ? 'Blur selection' : 'Blur image'}
          initialRadius={blurRadius}
          onCancel={() => setBlurTarget(null)}
          onApply={handleBlurApply}
        />
      ) : null}

      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
        >
          {(close) => (
            <>
              <MenuItem
                icon={<CutIcon size={16} />}
                shortcut="Ctrl+X"
                onClick={() => {
                  void handleCutFromCanvas()
                  close()
                }}
              >
                Cut
              </MenuItem>
              <MenuItem
                icon={<CopyIcon size={16} />}
                shortcut="Ctrl+C"
                onClick={() => {
                  void handleCopyFromCanvas()
                  close()
                }}
              >
                Copy
              </MenuItem>
              <MenuItem
                icon={<PasteIcon size={16} />}
                shortcut="Ctrl+V"
                onClick={() => {
                  void handlePasteFromClipboard()
                  close()
                }}
              >
                Paste
              </MenuItem>
              <MenuDivider />
              <MenuItem
                icon={<CropIcon size={16} />}
                disabled={!hasSelection}
                onClick={() => {
                  handleCrop()
                  close()
                }}
              >
                Crop
              </MenuItem>
              <MenuItem
                icon={<SelectIcon size={16} />}
                shortcut="Ctrl+A"
                onClick={() => {
                  handleSelectAll()
                  close()
                }}
              >
                Select all
              </MenuItem>
              <MenuItem
                icon={<InvertSelectionIcon size={16} />}
                onClick={() => {
                  handleInvertSelection()
                  close()
                }}
              >
                Invert selection
              </MenuItem>
              <MenuItem
                icon={<TrashIcon size={16} />}
                shortcut="Del"
                disabled={!hasSelection}
                onClick={() => {
                  handleDeleteSelection()
                  close()
                }}
              >
                Delete
              </MenuItem>
              <MenuDivider />
              <MenuSubmenu label="Rotate" icon={<RotateIcon size={16} />}>
                {(closeSub) => (
                  <>
                    <MenuItem
                      icon={<RotateLeftIcon size={16} />}
                      onClick={() => {
                        handleRotate(270)
                        closeSub()
                        close()
                      }}
                    >
                      Rotate left 90°
                    </MenuItem>
                    <MenuItem
                      icon={<RotateRightIcon size={16} />}
                      onClick={() => {
                        handleRotate(90)
                        closeSub()
                        close()
                      }}
                    >
                      Rotate right 90°
                    </MenuItem>
                    <MenuItem
                      icon={<Rotate180Icon size={16} />}
                      onClick={() => {
                        handleRotate(180)
                        closeSub()
                        close()
                      }}
                    >
                      Rotate 180°
                    </MenuItem>
                  </>
                )}
              </MenuSubmenu>
              <MenuSubmenu label="Flip" icon={<FlipIcon size={16} />}>
                {(closeSub) => (
                  <>
                    <MenuItem
                      icon={<FlipIcon size={16} />}
                      onClick={() => {
                        handleFlip('horizontal')
                        closeSub()
                        close()
                      }}
                    >
                      Flip horizontal
                    </MenuItem>
                    <MenuItem
                      icon={<FlipVerticalIcon size={16} />}
                      onClick={() => {
                        handleFlip('vertical')
                        closeSub()
                        close()
                      }}
                    >
                      Flip vertical
                    </MenuItem>
                  </>
                )}
              </MenuSubmenu>
              <MenuDivider />
              <MenuItem
                icon={<ScaleIcon size={16} />}
                onClick={() => {
                  openScaleDialog()
                  close()
                }}
              >
                Resize
              </MenuItem>
              <MenuItem
                icon={<InvertColorsIcon size={16} />}
                onClick={() => {
                  handleInvertColors()
                  close()
                }}
              >
                Invert color
              </MenuItem>
              <MenuItem
                icon={<GaussianBlurIcon size={16} />}
                onClick={() => {
                  openBlurDialog()
                  close()
                }}
              >
                {hasSelection ? 'Blur selection' : 'Blur image'}
              </MenuItem>
            </>
          )}
        </ContextMenu>
      ) : null}

      {message ? <div className="toast">{message}</div> : null}
    </div>
  )
}

export default App
