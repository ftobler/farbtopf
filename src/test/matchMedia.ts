import { act } from '@testing-library/react'

type Listener = () => void

const original = window.matchMedia

/**
 * Replaces window.matchMedia with one where exactly the given queries match. `setMatching`
 * changes that set and fires the change listeners. Call `restoreMatchMedia` after the test.
 */
export function mockMatchMedia(initial: readonly string[] = []) {
  let matching = new Set(initial)
  const listeners = new Set<Listener>()
  window.matchMedia = ((query: string) => ({
    get matches() {
      return matching.has(query)
    },
    media: query,
    onchange: null,
    addListener: (listener: Listener) => listeners.add(listener),
    removeListener: (listener: Listener) => listeners.delete(listener),
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  return {
    setMatching(queries: readonly string[]) {
      matching = new Set(queries)
      act(() => listeners.forEach((listener) => listener()))
    },
  }
}

export function restoreMatchMedia() {
  window.matchMedia = original
}
