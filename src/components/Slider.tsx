import { useRef } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

interface SliderCommonProps {
  /** Accessible name. */
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  className?: string
  title?: string
}

export interface HorizontalSliderProps extends SliderCommonProps {
  orientation?: 'horizontal'
  step?: number
  /** A CSS background for the track in place of the plain rail, e.g. a hue gradient. */
  trackBackground?: string
}

export interface VerticalSliderProps extends SliderCommonProps {
  orientation: 'vertical'
  /** Spoken value, e.g. "12 px". */
  valueText?: string
  /** Where `value` sits on the track, 0 (bottom) to 1 (top). Linear in the range by default. */
  position?: number
  /** The value for a track position, 0 (bottom) to 1 (top). Linear and rounded by default. */
  fromPosition?: (position: number) => number
  /** The value a key press moves to, or null for keys the slider does not handle. */
  keyStep?: (value: number, key: string) => number | null
  /** True while the thumb is being dragged. */
  onSlidingChange?: (sliding: boolean) => void
}

export type SliderProps = HorizontalSliderProps | VerticalSliderProps

function classes(...names: (string | undefined | false)[]): string {
  return names.filter(Boolean).join(' ')
}

/**
 * The app's one slider look (the zoom slider's): a thin rail with a round accent thumb.
 * Horizontal sliders are native range inputs; vertical ones follow the WAI-ARIA slider
 * pattern so they can map the track non-linearly (top = larger value).
 */
export function Slider(props: SliderProps) {
  if (props.orientation === 'vertical') return <VerticalSlider {...props} />
  const { label, value, min, max, step = 1, onChange, className, title, trackBackground } = props
  const style = trackBackground ? ({ '--slider-rail': trackBackground } as CSSProperties) : undefined
  return (
    <input
      type="range"
      className={classes('slider', trackBackground && 'slider-gradient', className)}
      aria-label={label}
      title={title}
      min={min}
      max={max}
      step={step}
      value={value}
      style={style}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  )
}

function linearKeyStep(min: number, max: number) {
  const page = Math.max(1, Math.round((max - min) / 10))
  return (value: number, key: string): number | null => {
    switch (key) {
      case 'ArrowUp':
      case 'ArrowRight':
        return value + 1
      case 'ArrowDown':
      case 'ArrowLeft':
        return value - 1
      case 'PageUp':
        return value + page
      case 'PageDown':
        return value - page
      case 'Home':
        return min
      case 'End':
        return max
      default:
        return null
    }
  }
}

function VerticalSlider({
  label,
  value,
  min,
  max,
  onChange,
  className,
  title,
  valueText,
  position,
  fromPosition,
  keyStep,
  onSlidingChange,
}: VerticalSliderProps) {
  const pointerRef = useRef<number | null>(null)
  const toValue = fromPosition ?? ((p: number) => Math.round(min + p * (max - min)))
  const step = keyStep ?? linearKeyStep(min, max)
  const at = position ?? (max > min ? (value - min) / (max - min) : 0)

  const update = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.height <= 0) return
    const p = Math.min(1, Math.max(0, 1 - (event.clientY - rect.top) / rect.height))
    onChange(Math.min(max, Math.max(min, toValue(p))))
  }

  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== event.pointerId) return
    pointerRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    onSlidingChange?.(false)
  }

  const clamped = Math.min(1, Math.max(0, at))

  return (
    <div
      className={classes('slider', 'slider-vertical', className)}
      role="slider"
      tabIndex={0}
      title={title}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      style={{ '--slider-position': clamped } as CSSProperties}
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
        const next = step(value, event.key)
        if (next === null) return
        // Keep arrows and friends from also driving the workspace shortcuts.
        event.preventDefault()
        event.stopPropagation()
        onChange(Math.min(max, Math.max(min, next)))
      }}
    >
      <span className="slider-rail" />
      <span className="slider-thumb" />
    </div>
  )
}
