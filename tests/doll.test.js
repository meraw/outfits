import { describe, it, expect } from 'vitest'
import { dollGeometry, placeItem, wearItem, DEFAULT_SHAPE } from '../src/lib/doll.js'

describe('dollGeometry', () => {
  const base = dollGeometry(DEFAULT_SHAPE)

  it('puts shoulders above waist above hips above feet', () => {
    expect(base.shoulders.y).toBeLessThan(base.waist.y)
    expect(base.waist.y).toBeLessThan(base.hips.y)
    expect(base.hips.y).toBeLessThan(base.feet.y)
  })

  it('wider hips move only the hips', () => {
    const wide = dollGeometry({ ...DEFAULT_SHAPE, hips: 1.2 })
    expect(wide.hips.half).toBeGreaterThan(base.hips.half)
    expect(wide.waist.half).toBe(base.waist.half)
    expect(wide.shoulders.half).toBe(base.shoulders.half)
  })

  it('longer legs put the feet lower, without moving the waist', () => {
    const tall = dollGeometry({ ...DEFAULT_SHAPE, legs: 1.2 })
    expect(tall.feet.y).toBeGreaterThan(base.feet.y)
    expect(tall.waist.y).toBe(base.waist.y)
  })

  it('keeps the shape within the slider range', () => {
    const silly = dollGeometry({ ...DEFAULT_SHAPE, hips: 9 })
    expect(silly.hips.half).toBe(dollGeometry({ ...DEFAULT_SHAPE, hips: 1.25 }).hips.half)
  })

  it('draws a body outline', () => {
    expect(base.outline).toMatch(/^M[\d.\s,-]+C/)
  })
})

describe('placeItem', () => {
  const geo = dollGeometry(DEFAULT_SHAPE)
  const centre = (r) => r.x + r.width / 2

  it('hangs a top from the shoulders, centred', () => {
    const r = placeItem('top', 1, geo)
    expect(centre(r)).toBeCloseTo(geo.centre)
    expect(Math.abs(r.y - geo.shoulders.y)).toBeLessThan(40)
    expect(r.width).toBeGreaterThan(geo.shoulders.half * 2)
  })

  it('starts a bottom at the waist', () => {
    const r = placeItem('bottom', 0.5, geo)
    expect(centre(r)).toBeCloseTo(geo.centre)
    expect(Math.abs(r.y - geo.waist.y)).toBeLessThan(20)
  })

  it('stands shoes on the floor', () => {
    const r = placeItem('shoes', 2, geo)
    expect(r.y + r.height).toBeGreaterThan(geo.feet.y - 10)
    expect(r.y + r.height).toBeLessThan(geo.feet.y + 15)
  })

  it('makes long trousers reach the ankles', () => {
    const r = placeItem('bottom', 0.38, geo) // typical jeans photo
    expect(r.y + r.height).toBeGreaterThan(geo.ankles.y - 30)
    expect(r.y + r.height).toBeLessThan(geo.feet.y)
  })

  it('makes a top reach about the hips', () => {
    const r = placeItem('top', 1.05, geo) // typical T-shirt photo
    expect(r.y + r.height).toBeGreaterThan(geo.waist.y + 20)
    expect(r.y + r.height).toBeLessThan(geo.hips.y + 40)
  })

  it('keeps the photo shape (no stretching)', () => {
    const r = placeItem('top', 0.8, geo)
    expect(r.width / r.height).toBeCloseTo(0.8)
  })

  it('makes skirts and shorts wider on a doll with wider hips', () => {
    const wide = dollGeometry({ ...DEFAULT_SHAPE, hips: 1.2 })
    expect(placeItem('bottom', 1, wide).width).toBeGreaterThan(placeItem('bottom', 1, geo).width)
  })
})

describe('wearItem', () => {
  const top = { id: 't1', category: 'top', layer: 'base' }
  const top2 = { id: 't2', category: 'top', layer: 'base' }
  const jumper = { id: 't3', category: 'top', layer: 'mid' }
  const jeans = { id: 'b1', category: 'bottom' }
  const dress = { id: 'd1', category: 'dress', layer: 'base' }
  const boots = { id: 's1', category: 'shoes' }
  const ids = (outfit) => outfit.map((i) => i.id).sort()

  it('puts on items from different places together', () => {
    expect(ids(wearItem(wearItem(wearItem([], top), jeans), boots))).toEqual(['b1', 's1', 't1'])
  })

  it('swaps a top for another top of the same layer', () => {
    expect(ids(wearItem([top, jeans], top2))).toEqual(['b1', 't2'])
  })

  it('lets a jumper go over a top', () => {
    expect(ids(wearItem([top], jumper))).toEqual(['t1', 't3'])
  })

  it('takes an item off when tapped again', () => {
    expect(ids(wearItem([top, jeans], jeans))).toEqual(['t1'])
  })

  it('a dress replaces the bottom and the base top', () => {
    expect(ids(wearItem([top, jumper, jeans, boots], dress))).toEqual(['d1', 's1', 't3'])
  })

  it('a bottom replaces a dress', () => {
    expect(ids(wearItem([dress, boots], jeans))).toEqual(['b1', 's1'])
  })
})
