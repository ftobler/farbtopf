import { useCallback, useEffect, useState } from 'react'
import type { Rgba } from '../core/color'
import { loadCustomColors, saveCustomColors, withCustomColor } from '../core/customColors'

export function useCustomColors() {
  const [colors, setColors] = useState<string[]>(() => loadCustomColors())

  useEffect(() => {
    saveCustomColors(colors)
  }, [colors])

  const add = useCallback((color: Rgba) => {
    setColors((current) => withCustomColor(current, color))
  }, [])

  const remove = useCallback((hex: string) => {
    setColors((current) => current.filter((entry) => entry !== hex))
  }, [])

  return { colors, add, remove }
}
