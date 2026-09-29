import { parseColor, toHexWithAlpha } from './color'
import type { Rgba } from './color'

export const CUSTOM_COLORS_KEY = 'farbtopf.customColors'

/** One palette row of custom slots; the oldest color drops out when a new one is added to a full row. */
export const MAX_CUSTOM_COLORS = 10

export function loadCustomColors(): string[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(CUSTOM_COLORS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const colors: string[] = []
    for (const entry of parsed) {
      if (typeof entry !== 'string') continue
      const color = parseColor(entry)
      if (!color) continue
      const hex = toHexWithAlpha(color)
      if (!colors.includes(hex)) colors.push(hex)
    }
    return colors.slice(-MAX_CUSTOM_COLORS)
  } catch {
    return []
  }
}

export function saveCustomColors(colors: readonly string[]): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(colors))
  } catch {
    return
  }
}

export function withCustomColor(colors: readonly string[], color: Rgba): string[] {
  const hex = toHexWithAlpha(color)
  if (colors.includes(hex)) return [...colors]
  return [...colors, hex].slice(-MAX_CUSTOM_COLORS)
}
