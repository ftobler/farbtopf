import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type { Point } from '../core/geometry'
import { clamp } from '../core/geometry'
import { WORKSPACE_PADDING, computeScrollbarMetrics, panForScroll } from '../core/scrollbars'

export const SCROLLBAR_INSET = 4
const IDLE_MS = 1100

interface DragState {
  axis: 'x' | 'y'
  pointerId: number
  element: HTMLElement
  startClient: number
  startScroll: number
  maxScroll: number
  scrollPerPx: number
  content: number
  viewport: number
}

export interface ScrollbarsProps {
  workspaceRef: RefObject<HTMLElement | null>
  zoom: number
  pan: Point
  canvasSize: { width: number; height: number }
  onPanChange: (pan: Point) => void
}

export function Scrollbars({ workspaceRef, zoom, pan, canvasSize, onPanChange }: ScrollbarsProps) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [visible, setVisible] = useState(false)
  const [dragging, setDragging] = useState<'x' | 'y' | null>(null)
  const hideTimer = useRef<number | null>(null)
  const dragRef = useRef<DragState | null>(null)

  useEffect(() => {
    const element = workspaceRef.current
    if (!element) return
    const measure = () => {
      const rect = element.getBoundingClientRect()
      setSize((current) =>
        current.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height },
      )
    }
    measure()
    window.addEventListener('resize', measure)
    if (typeof ResizeObserver === 'undefined') {
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [workspaceRef])

  const clearHide = useCallback(() => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }, [])

  const hide = useCallback(() => {
    clearHide()
    setVisible(false)
  }, [clearHide])

  const show = useCallback(() => {
    setVisible(true)
    clearHide()
    if (!dragRef.current) {
      hideTimer.current = window.setTimeout(() => setVisible(false), IDLE_MS)
    }
  }, [clearHide])

  useEffect(() => {
    const element = workspaceRef.current
    if (!element) return
    const handleEnter = () => show()
    const handleMove = () => show()
    const handleLeave = () => {
      if (!dragRef.current) hide()
    }
    element.addEventListener('pointerenter', handleEnter)
    element.addEventListener('pointermove', handleMove)
    element.addEventListener('pointerleave', handleLeave)
    return () => {
      element.removeEventListener('pointerenter', handleEnter)
      element.removeEventListener('pointermove', handleMove)
      element.removeEventListener('pointerleave', handleLeave)
    }
  }, [workspaceRef, show, hide])

  useEffect(() => () => clearHide(), [clearHide])

  const innerWidth = Math.max(0, size.width - WORKSPACE_PADDING * 2)
  const innerHeight = Math.max(0, size.height - WORKSPACE_PADDING * 2)
  const contentX = canvasSize.width * zoom
  const contentY = canvasSize.height * zoom
  const trackX = Math.max(0, size.width - SCROLLBAR_INSET * 2)
  const trackY = Math.max(0, size.height - SCROLLBAR_INSET * 2)
  const metricsX = computeScrollbarMetrics(contentX, innerWidth, pan.x)
  const metricsY = computeScrollbarMetrics(contentY, innerHeight, pan.y)
  const active = visible || dragging !== null

  const thumbX = metricsX.thumbRatio * trackX
  const thumbY = metricsY.thumbRatio * trackY
  const offsetX = metricsX.positionRatio * Math.max(0, trackX - thumbX)
  const offsetY = metricsY.positionRatio * Math.max(0, trackY - thumbY)

  const handleThumbDown = useCallback(
    (axis: 'x' | 'y', event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      const element = event.currentTarget
      const metrics = axis === 'x' ? metricsX : metricsY
      const track = axis === 'x' ? trackX : trackY
      const travel = Math.max(0, track - metrics.thumbRatio * track)
      element.setPointerCapture?.(event.pointerId)
      dragRef.current = {
        axis,
        pointerId: event.pointerId,
        element,
        startClient: axis === 'x' ? event.clientX : event.clientY,
        startScroll: metrics.scroll,
        maxScroll: metrics.maxScroll,
        scrollPerPx: travel > 0 ? metrics.maxScroll / travel : 0,
        content: axis === 'x' ? contentX : contentY,
        viewport: axis === 'x' ? innerWidth : innerHeight,
      }
      setDragging(axis)
      show()
    },
    [contentX, contentY, innerHeight, innerWidth, metricsX, metricsY, show, trackX, trackY],
  )

  const handleTrackDown = useCallback(
    (axis: 'x' | 'y', event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      const element = event.currentTarget
      const rect = element.getBoundingClientRect()
      const track = axis === 'x' ? rect.width : rect.height
      const metrics = axis === 'x' ? metricsX : metricsY
      const travel = Math.max(0, track - metrics.thumbRatio * track)
      const offset = axis === 'x' ? event.clientX - rect.left : event.clientY - rect.top
      const ratio = travel > 0 ? clamp((offset - (metrics.thumbRatio * track) / 2) / travel, 0, 1) : 0
      const scroll = ratio * metrics.maxScroll
      const content = axis === 'x' ? contentX : contentY
      const viewport = axis === 'x' ? innerWidth : innerHeight
      const next = panForScroll(content, viewport, scroll)
      element.setPointerCapture?.(event.pointerId)
      dragRef.current = {
        axis,
        pointerId: event.pointerId,
        element,
        startClient: axis === 'x' ? event.clientX : event.clientY,
        startScroll: scroll,
        maxScroll: metrics.maxScroll,
        scrollPerPx: travel > 0 ? metrics.maxScroll / travel : 0,
        content,
        viewport,
      }
      onPanChange(axis === 'x' ? { x: next, y: pan.y } : { x: pan.x, y: next })
      setDragging(axis)
      show()
    },
    [contentX, contentY, innerHeight, innerWidth, metricsX, metricsY, onPanChange, pan.x, pan.y, show],
  )

  const handleDragMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId || drag.element !== event.currentTarget) return
      const position = drag.axis === 'x' ? event.clientX : event.clientY
      const scroll = clamp(drag.startScroll + (position - drag.startClient) * drag.scrollPerPx, 0, drag.maxScroll)
      const next = panForScroll(drag.content, drag.viewport, scroll)
      onPanChange(drag.axis === 'x' ? { x: next, y: pan.y } : { x: pan.x, y: next })
    },
    [onPanChange, pan.x, pan.y],
  )

  const handleDragEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      dragRef.current = null
      setDragging(null)
      if (drag.element === event.currentTarget) {
        drag.element.releasePointerCapture?.(event.pointerId)
      }
      show()
    },
    [show],
  )

  return (
    <div className="workspace-scrollbars">
      {metricsX.scrollable ? (
        <div
          className="workspace-scrollbar"
          data-axis="x"
          data-visible={active ? 'true' : 'false'}
          data-dragging={dragging === 'x' ? 'true' : 'false'}
          onPointerDown={(event) => handleTrackDown('x', event)}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        >
          <div
            className="workspace-scrollbar-thumb"
            style={{ left: offsetX, width: thumbX }}
            onPointerDown={(event) => handleThumbDown('x', event)}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
          />
        </div>
      ) : null}
      {metricsY.scrollable ? (
        <div
          className="workspace-scrollbar"
          data-axis="y"
          data-visible={active ? 'true' : 'false'}
          data-dragging={dragging === 'y' ? 'true' : 'false'}
          onPointerDown={(event) => handleTrackDown('y', event)}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        >
          <div
            className="workspace-scrollbar-thumb"
            style={{ top: offsetY, height: thumbY }}
            onPointerDown={(event) => handleThumbDown('y', event)}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
          />
        </div>
      ) : null}
    </div>
  )
}
