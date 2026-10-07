import { describe, it, expect } from 'vitest'
import { trimBounds } from '../src/lib/trim.js'

// A w×h image, transparent except the given [x, y] pixels.
function image(w, h, solid) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (const [x, y] of solid) data[(y * w + x) * 4 + 3] = 255
  return data
}

describe('trimBounds', () => {
  it('finds the box around the visible pixels', () => {
    expect(trimBounds(image(10, 8, [[2, 3], [6, 5]]), 10, 8)).toEqual({ x: 2, y: 3, w: 5, h: 3 })
  })

  it('ignores almost-invisible specks', () => {
    const data = image(10, 10, [[4, 4]])
    data[(0 * 10 + 0) * 4 + 3] = 5
    expect(trimBounds(data, 10, 10)).toEqual({ x: 4, y: 4, w: 1, h: 1 })
  })

  it('returns null for a fully transparent image', () => {
    expect(trimBounds(image(4, 4, []), 4, 4)).toBeNull()
  })
})
