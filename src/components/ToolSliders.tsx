import { useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import {
  MAX_OPACITY,
  MAX_SIZE,
  MIN_OPACITY,
  MIN_SIZE,
  clampOpacity,
  clampSize,
  opacityToSlider,
  sizeToSlider,
  sliderToOpacity,
  sliderToSize,
  stepSize,
} from '../core/toolSettings'

interface VerticalSliderProps {
  label: string
  value: number
  min: number
  max: number
  valueText: string
  /** Where `value` sits on the track, 0 (bottom) to 1 (top). */
  position: number
  /** The value for a track position, 0 (bottom) to 1 (top). */
  fromPosition: (position: number) => number
  /** The value a key press moves to, or null for keys the slider does not handle. */
  keyStep: (value: number, key: string) => number | null
  onChange: (value: number) => void
  onSlidingChange?: (sliding: boolean) => void
}

/**
 * A vertical slider (WAI-ARIA slider pattern): drag or press on the track, or use the
 * arrow, Page Up/Down, Home and End keys while it has focus.
 */
function VerticalSlider({
  label,
  value,
  min,
  max,
  valueText,
  position,
  fromPosition,
  keyStep,
  onChange,
  onSlidingChange,
}: VerticalSliderProps) {
  const pointerRef = useRef<number | null>(null)

  const update = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.height <= 0) return
    onChange(fromPosition(1 - (event.clientY - rect.top) / rect.height))
  }

  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== event.pointerId) return
    pointerRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    onSlidingChange?.(false)
  }

  const percent = Math.min(1, Math.max(0, position)) * 100

  return (
    <div className="tool-slider">
      <span className="tool-slider-value" aria-hidden="true">
        {valueText}
      </span>
      <div
        className="tool-slider-track"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        title={label}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          event.currentTarget.focus()
          event.currentTarget.setPointerCapture?.(event.pointerId)
          pointerRef.current = event.pointerId
          onSlidingChange?.(true)
          update(event)
        }}
        onPointerMove={(event) => {
          if (pointerRef.current === event.pointerId) update(event)
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
          const next = keyStep(value, event.key)
          if (next === null) return
          // Keep arrows and friends from also driving the workspace shortcuts.
          event.preventDefault()
          event.stopPropagation()
          onChange(Math.min(max, Math.max(min, next)))
        }}
      >
        <span className="tool-slider-rail" />
        <span className="tool-slider-fill" style={{ height: `${percent}%` }} />
        <span className="tool-slider-thumb" style={{ bottom: `${percent}%` }} />
      </div>
      <span className="tool-slider-label" aria-hidden="true">
        {label}
      </span>
    </div>
  )
}

function sizeKeyStep(size: number, key: string): number | null {
  switch (key) {
    case 'ArrowUp':
    case 'ArrowRight':
      return clampSize(size + 1)
    case 'ArrowDown':
    case 'ArrowLeft':
      return clampSize(size - 1)
    case 'PageUp':
      return stepSize(size, 1)
    case 'PageDown':
      return stepSize(size, -1)
    case 'Home':
      return MIN_SIZE
    case 'End':
      return MAX_SIZE
    default:
      return null
  }
}

function opacityKeyStep(opacity: number, key: string): number | null {
  switch (key) {
    case 'ArrowUp':
    case 'ArrowRight':
      return clampOpacity(opacity + 1)
    case 'ArrowDown':
    case 'ArrowLeft':
      return clampOpacity(opacity - 1)
    case 'PageUp':
      return clampOpacity(opacity + 10)
    case 'PageDown':
      return clampOpacity(opacity - 10)
    case 'Home':
      return MIN_OPACITY
    case 'End':
      return MAX_OPACITY
    default:
      return null
  }
}

export interface ToolSlidersProps {
  /** The current tool's size in image pixels. */
  size: number
  /** The current tool's opacity in percent. */
  opacity: number
  onSizeChange: (size: number) => void
  onOpacityChange: (opacity: number) => void
  /** True while either slider is being dragged. */
  onSlidingChange?: (sliding: boolean) => void
}

/**
 * Floating size and opacity sliders for the sized tools, on the left of the workspace.
 * The size slider is logarithmic so 1-10 px are as easy to pick as the big sizes.
 */
export function ToolSliders({ size, opacity, onSizeChange, onOpacityChange, onSlidingChange }: ToolSlidersProps) {
  return (
    <div
      className="tool-sliders"
      role="group"
      aria-label="Tool size and opacity"
      onContextMenu={(event) => {
        // The panel sits inside the workspace; keep the canvas context menu from opening too.
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <VerticalSlider
        label="Size"
        value={size}
        min={MIN_SIZE}
        max={MAX_SIZE}
        valueText={`${size} px`}
        position={sizeToSlider(size)}
        fromPosition={sliderToSize}
        keyStep={sizeKeyStep}
        onChange={onSizeChange}
        onSlidingChange={onSlidingChange}
      />
      <VerticalSlider
        label="Opacity"
        value={opacity}
        min={MIN_OPACITY}
        max={MAX_OPACITY}
        valueText={`${opacity}%`}
        position={opacityToSlider(opacity)}
        fromPosition={sliderToOpacity}
        keyStep={opacityKeyStep}
        onChange={onOpacityChange}
        onSlidingChange={onSlidingChange}
      />
    </div>
  )
}
