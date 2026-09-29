import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react'
import { clampByte, hsvToRgb, parseColor, rgbToHsv, toCss, toHexWithAlpha } from '../core/color'
import type { Hsv, Rgba } from '../core/color'
import { PaletteIcon, PlusIcon, TrashIcon } from './icons'

export type ColorSlot = 'primary' | 'secondary'

export interface ColorPickerProps {
  color: Rgba
  target: ColorSlot
  customColors: readonly string[]
  onTargetChange: (target: ColorSlot) => void
  onColorChange: (color: Rgba) => void
  onAddCustomColor: (color: Rgba) => void
  onRemoveCustomColor: (hex: string) => void
}

interface RgbText {
  r: string
  g: string
  b: string
}

type ColorPickerPanelProps = ColorPickerProps

const CHANNELS: readonly (keyof RgbText)[] = ['r', 'g', 'b']
const CHANNEL_LABELS: Record<keyof RgbText, string> = { r: 'Red', g: 'Green', b: 'Blue' }

function toRgbText(color: Rgba): RgbText {
  return { r: String(color.r), g: String(color.g), b: String(color.b) }
}

export function ColorPicker(props: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handlePointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div className="dropdown color-picker" ref={rootRef}>
      <button
        type="button"
        className="icon-button color-picker-trigger"
        title="Custom colors"
        aria-label="Custom colors"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <PaletteIcon size={26} />
      </button>

      {open ? (
        <div className="dropdown-menu dropdown-end color-picker-panel" role="dialog" aria-label="Color picker">
          <ColorPickerPanel key={props.target} {...props} />
        </div>
      ) : null}
    </div>
  )
}

function ColorPickerPanel({
  color,
  target,
  customColors,
  onTargetChange,
  onColorChange,
  onAddCustomColor,
  onRemoveCustomColor,
}: ColorPickerPanelProps) {
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(color))
  const [alpha, setAlpha] = useState(color.a)
  const [hexText, setHexText] = useState(() => toHexWithAlpha(color))
  const [rgbText, setRgbText] = useState<RgbText>(() => toRgbText(color))
  const areaRef = useRef<HTMLDivElement | null>(null)

  const emit = (next: Rgba, nextHsv: Hsv) => {
    setHsv(nextHsv)
    setAlpha(next.a)
    setHexText(toHexWithAlpha(next))
    setRgbText(toRgbText(next))
    onColorChange(next)
  }

  const handleAreaPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = areaRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return
    const s = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const v = Math.min(1, Math.max(0, 1 - (event.clientY - rect.top) / rect.height))
    const next = { h: hsv.h, s, v }
    emit({ ...hsvToRgb(next), a: alpha }, next)
  }

  const handleHueChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = { h: Number(event.target.value), s: hsv.s, v: hsv.v }
    emit({ ...hsvToRgb(next), a: alpha }, next)
  }

  const handleAlphaChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value)
    const next = clampByte(value)
    setAlpha(next)
    setHexText(toHexWithAlpha({ ...hsvToRgb(hsv), a: next }))
    onColorChange({ ...hsvToRgb(hsv), a: next })
  }

  const handleHexChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    setHexText(value)
    const parsed = parseColor(value)
    if (!parsed) return
    setHsv(rgbToHsv(parsed))
    setAlpha(parsed.a)
    setRgbText(toRgbText(parsed))
    onColorChange(parsed)
  }

  const handleChannelChange = (channel: keyof RgbText, value: string) => {
    setRgbText((current) => ({ ...current, [channel]: value }))
    const parsed = Number(value)
    if (value.trim() === '' || !Number.isInteger(parsed) || parsed < 0 || parsed > 255) return
    const next = { ...hsvToRgb(hsv), a: alpha, [channel]: parsed }
    setHsv(rgbToHsv(next))
    setHexText(toHexWithAlpha(next))
    onColorChange(next)
  }

  const selectCustom = (hex: string) => {
    const parsed = parseColor(hex)
    if (parsed) emit(parsed, rgbToHsv(parsed))
  }

  const preview = toCss(color)
  const rgb = hsvToRgb(hsv)

  return (
    <>
      <div
        className="sv-area"
        ref={areaRef}
        role="slider"
        tabIndex={0}
        aria-label="Saturation and value"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.v * 100)}
        aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, value ${Math.round(hsv.v * 100)}%`}
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))` }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          handleAreaPointer(event)
        }}
        onPointerMove={(event) => {
          if (event.buttons === 0) return
          handleAreaPointer(event)
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 0.1 : 0.01
          const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
          let { s, v } = hsv
          if (event.key === 'ArrowLeft') s = clamp01(s - step)
          else if (event.key === 'ArrowRight') s = clamp01(s + step)
          else if (event.key === 'ArrowUp') v = clamp01(v + step)
          else if (event.key === 'ArrowDown') v = clamp01(v - step)
          else return
          event.preventDefault()
          const next = { h: hsv.h, s, v }
          emit({ ...hsvToRgb(next), a: alpha }, next)
        }}
      >
        <span className="sv-cursor" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
      </div>

      <div
        className="slider-track hue-track"
        style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
      >
        <input
          type="range"
          className="slider-input"
          min={0}
          max={360}
          value={Math.round(hsv.h)}
          aria-label="Hue"
          onChange={handleHueChange}
        />
      </div>

      <div
        className="slider-track alpha-track"
        style={{ backgroundImage: `linear-gradient(to right, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0), rgb(${rgb.r}, ${rgb.g}, ${rgb.b}))` }}
      >
        <input
          type="range"
          className="slider-input"
          min={0}
          max={255}
          value={Math.round(alpha)}
          aria-label="Alpha"
          onChange={handleAlphaChange}
        />
      </div>

      <div className="color-picker-preview-row">
        <span className="color-picker-preview" style={{ background: preview }} aria-label="Color preview" role="img" />
        <div className="color-picker-target" role="group" aria-label="Apply to">
          <button
            type="button"
            className="color-picker-target-button"
            aria-pressed={target === 'primary'}
            onClick={() => onTargetChange('primary')}
          >
            Primary
          </button>
          <button
            type="button"
            className="color-picker-target-button"
            aria-pressed={target === 'secondary'}
            onClick={() => onTargetChange('secondary')}
          >
            Secondary
          </button>
        </div>
      </div>

      <div className="color-picker-fields">
        <label className="color-picker-field">
          Hex
          <input
            type="text"
            value={hexText}
            spellCheck={false}
            aria-label="Hex color"
            onChange={handleHexChange}
          />
        </label>
        <div className="color-picker-rgb">
          {CHANNELS.map((channel) => (
            <label key={channel} className="color-picker-field">
              {CHANNEL_LABELS[channel]}
              <input
                type="number"
                min={0}
                max={255}
                value={rgbText[channel]}
                aria-label={CHANNEL_LABELS[channel]}
                onChange={(event) => handleChannelChange(channel, event.target.value)}
              />
            </label>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="color-picker-add"
        aria-label="Add custom color"
        onClick={() => onAddCustomColor(color)}
      >
        <PlusIcon size={14} />
        Add to palette
      </button>

      {customColors.length > 0 ? (
        <div className="color-picker-custom" role="group" aria-label="Custom colors">
          {customColors.map((hex) => (
            <span key={hex} className="color-picker-custom-item">
              <button
                type="button"
                className="swatch color-picker-custom-swatch"
                style={{ background: hex }}
                title={hex}
                aria-label={`Select custom color ${hex}`}
                onClick={() => selectCustom(hex)}
              />
              <button
                type="button"
                className="color-picker-remove"
                aria-label={`Remove custom color ${hex}`}
                onClick={() => onRemoveCustomColor(hex)}
              >
                <TrashIcon size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </>
  )
}
