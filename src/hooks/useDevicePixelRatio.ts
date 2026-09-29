import { useEffect, useState } from 'react'

function currentRatio(): number {
  return typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
}

/** The device pixel ratio, updated when browser zoom or the monitor changes it. */
export function useDevicePixelRatio(): number {
  const [ratio, setRatio] = useState(currentRatio)

  useEffect(() => {
    const update = () => setRatio(currentRatio())
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return ratio
}
