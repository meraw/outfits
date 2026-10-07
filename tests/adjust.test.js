import { describe, it, expect } from 'vitest'
import { NO_ADJUST, applyAdjust, gestureAdjust, pickGarment } from '../src/lib/adjust.js'

const base = { x: 100, y: 200, width: 200, height: 300 }
const centre = (b) => [b.x + b.width / 2, b.y + b.height / 2]

describe('applyAdjust', () => {
  it('leaves the garment where it is without an adjustment', () => {
    expect(applyAdjust(base, NO_ADJUST)).toEqual(base)
    expect(applyAdjust(base, undefined)).toEqual(base)
  })

  it('resizes around the middle and moves by a share of the garment size', () => {
    const r = applyAdjust(base, { dx: 0.1, dy: -0.05, scale: 2 })
    expect([r.width, r.height]).toEqual([400, 600])
    expect(centre(r)).toEqual([200 + 20, 350 - 15])
  })
})

describe('gestureAdjust', () => {
  it('moves the garment exactly as far as one finger drags', () => {
    const a = gestureAdjust(NO_ADJUST, base, [[150, 250]], [[170, 220]])
    const r = applyAdjust(base, a)
    expect(r.x).toBeCloseTo(120)
    expect(r.y).toBeCloseTo(170)
    expect(a.scale).toBe(1)
  })

  it('adds to an earlier adjustment instead of starting over', () => {
    const start = { dx: 0.1, dy: 0, scale: 1.5 }
    const before = applyAdjust(base, start)
    const after = applyAdjust(base, gestureAdjust(start, base, [[0, 0]], [[10, 0]]))
    expect(after.x - before.x).toBeCloseTo(10)
    expect(after.width).toBeCloseTo(before.width)
  })

  it('grows with a pinch and keeps the spot between the fingers under the fingers', () => {
    const from = [[180, 300], [220, 300]] // fingers 40 apart, midpoint (200, 300)
    const to = [[150, 320], [230, 320]]   // 80 apart, midpoint moved to (190, 320)
    const a = gestureAdjust(NO_ADJUST, base, from, to)
    expect(a.scale).toBeCloseTo(2)
    // The garment point that was at the old midpoint is now at the new one.
    const u = (200 - base.x) / base.width, v = (300 - base.y) / base.height
    const r = applyAdjust(base, a)
    expect(r.x + u * r.width).toBeCloseTo(190)
    expect(r.y + v * r.height).toBeCloseTo(320)
  })

  it('keeps the size between half and double', () => {
    expect(gestureAdjust(NO_ADJUST, base, [[0, 0], [10, 0]], [[0, 0], [100, 0]]).scale).toBe(2)
    expect(gestureAdjust(NO_ADJUST, base, [[0, 0], [100, 0]], [[0, 0], [5, 0]]).scale).toBe(0.5)
  })

  it('cannot push a garment far off the doll', () => {
    const a = gestureAdjust(NO_ADJUST, base, [[0, 0]], [[5000, -5000]])
    expect(a.dx).toBe(1)
    expect(a.dy).toBe(-1)
  })
})

describe('pickGarment', () => {
  // Solid only in the left half of each garment box.
  const leftHalf = (u) => (u < 0.5 ? 1 : 0)
  const garments = [ // bottom of the pile first
    { id: 'jeans', box: { x: 0, y: 0, width: 100, height: 100 }, alphaAt: () => 1 },
    { id: 'jumper', box: { x: 0, y: 0, width: 100, height: 50 }, alphaAt: leftHalf },
  ]

  it('picks the garment on top where it is solid', () => {
    expect(pickGarment(garments, [10, 10])).toBe('jumper')
  })

  it('reaches through see-through parts of the top garment', () => {
    expect(pickGarment(garments, [90, 10])).toBe('jeans')
    expect(pickGarment(garments, [50, 80])).toBe('jeans')
  })

  it('picks nothing on empty space', () => {
    expect(pickGarment(garments, [300, 300])).toBeNull()
  })
})
