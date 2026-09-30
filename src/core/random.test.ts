import { describe, expect, it } from 'vitest'
import { seededRandom } from './random'

describe('seededRandom', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = seededRandom(42)
    const b = seededRandom(42)
    for (let i = 0; i < 20; i += 1) expect(a()).toBe(b())
  })

  it('differs between seeds and stays within [0, 1)', () => {
    const a = seededRandom(1)
    const b = seededRandom(2)
    let same = 0
    for (let i = 0; i < 100; i += 1) {
      const x = a()
      const y = b()
      if (x === y) same += 1
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
    expect(same).toBeLessThan(5)
  })
})
