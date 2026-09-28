export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

export const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 255 }
export const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 255 }
export const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, a: 0 }

export function rgba(r: number, g: number, b: number, a = 255): Rgba {
  return { r, g, b, a }
}

export function clampByte(value: number): number {
  if (value < 0) return 0
  if (value > 255) return 255
  return Math.round(value)
}

/** Compares two colors, optionally allowing a per-channel tolerance. */
export function colorsEqual(a: Rgba, b: Rgba, tolerance = 0): boolean {
  return (
    Math.abs(a.r - b.r) <= tolerance &&
    Math.abs(a.g - b.g) <= tolerance &&
    Math.abs(a.b - b.b) <= tolerance &&
    Math.abs(a.a - b.a) <= tolerance
  )
}

function expand(hex: string): string | null {
  const value = hex.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(value)) {
    return value
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (/^[0-9a-fA-F]{4}$/.test(value)) {
    return value
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (/^[0-9a-fA-F]{6}$/.test(value) || /^[0-9a-fA-F]{8}$/.test(value)) {
    return value
  }
  return null
}

/** Parses `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`. Returns null when invalid. */
export function parseColor(input: string): Rgba | null {
  const value = expand(input)
  if (!value) return null
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  const a = value.length === 8 ? parseInt(value.slice(6, 8), 16) : 255
  return { r, g, b, a }
}

function hex2(value: number): string {
  return clampByte(value).toString(16).padStart(2, '0')
}

export function toHex(color: Rgba): string {
  return `#${hex2(color.r)}${hex2(color.g)}${hex2(color.b)}`
}

export function toCss(color: Rgba): string {
  if (color.a >= 255) return `rgb(${color.r}, ${color.g}, ${color.b})`
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${(color.a / 255).toFixed(3)})`
}

export interface Hsv {
  h: number
  s: number
  v: number
}

/** Converts an opaque RGB color to HSV (h in [0,360), s/v in [0,1]). */
export function rgbToHsv(color: Rgba): Hsv {
  const r = color.r / 255
  const g = color.g / 255
  const b = color.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let h = 0
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6
    else if (max === g) h = (b - r) / delta + 2
    else h = (r - g) / delta + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : delta / max
  return { h, s, v: max }
}

export function hsvToRgb({ h, s, v }: Hsv): Rgba {
  const c = v * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = v - c
  return {
    r: clampByte((r + m) * 255),
    g: clampByte((g + m) * 255),
    b: clampByte((b + m) * 255),
    a: 255,
  }
}

/** Mixes two colors by `t` (0 = a, 1 = b). */
export function mix(a: Rgba, b: Rgba, t: number): Rgba {
  return {
    r: clampByte(a.r + (b.r - a.r) * t),
    g: clampByte(a.g + (b.g - a.g) * t),
    b: clampByte(a.b + (b.b - a.b) * t),
    a: clampByte(a.a + (b.a - a.a) * t),
  }
}

export function luminance(color: Rgba): number {
  return (0.299 * color.r + 0.587 * color.g + 0.114 * color.b) / 255
}

/** Returns black or white depending on which contrasts better. */
export function contrasting(color: Rgba): Rgba {
  return luminance(color) > 0.6 ? BLACK : WHITE
}
