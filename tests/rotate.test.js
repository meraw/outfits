import { describe, it, expect } from 'vitest'
import { rotatePixels } from '../src/lib/rotate.js'

// Pixels are labelled by their red value so positions are easy to follow.
const img = (labels) => new Uint8ClampedArray(labels.flatMap((v) => [v, 0, 0, 255]))
const labels = (data) => [...data].filter((_, i) => i % 4 === 0)

describe('rotatePixels', () => {
  // 3 wide × 2 tall:   1 2 3
  //                    4 5 6
  const src = img([1, 2, 3, 4, 5, 6])

  it('turns a quarter turn clockwise', () => {
    // becomes 2 wide × 3 tall:  4 1
    //                           5 2
    //                           6 3
    expect(labels(rotatePixels(src, 3, 2))).toEqual([4, 1, 5, 2, 6, 3])
  })

  it('keeps transparency', () => {
    const data = img([1, 2])
    data[7] = 0 // second pixel see-through
    const out = rotatePixels(data, 2, 1)
    expect([out[3], out[7]]).toEqual([255, 0])
  })

  it('four turns give back the original', () => {
    let d = src, w = 3, h = 2
    for (let i = 0; i < 4; i++) { d = rotatePixels(d, w, h); [w, h] = [h, w] }
    expect(labels(d)).toEqual([1, 2, 3, 4, 5, 6])
  })
})
