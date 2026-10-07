import { describe, it, expect, vi, afterEach } from 'vitest'
import { analyseSilhouette, fitFromBlob, validFit } from '../src/lib/fit.js'
import { dollGeometry, placeItem } from '../src/lib/doll.js'

// Flat-laid garments with a torso/waist independent of sleeve span and padding.
function mask(width, height, rectangles) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (const [left, top, right, bottom] of rectangles) {
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) data[(y * width + x) * 4 + 3] = 255
  }
  return data
}
const geo = dollGeometry()
const shirt = [[60, 10, 140, 150], [10, 20, 190, 50]]
const shorts = [[20, 10, 140, 40], [10, 40, 75, 120], [85, 40, 150, 120]]

describe('automatic silhouette fitting', () => {
  it('fits a top by torso width rather than sleeve span', () => {
    const fit = analyseSilhouette(mask(200, 160, shirt), 200, 160, 'top')
    expect(validFit(fit, 'top')).toBe(true)
    const r = placeItem('top', 200 / 160, geo, fit)
    expect((fit.anchor.right - fit.anchor.left) * r.width).toBeCloseTo(geo.shoulders.half * 2 * 1.02)
    expect(r.x + (fit.anchor.left + fit.anchor.right) / 2 * r.width).toBeCloseTo(geo.centre)
    expect(r.y + fit.anchor.y * r.height).toBeCloseTo(geo.shoulders.y)
    expect(r.width / r.height).toBeCloseTo(200 / 160)
  })

  it('ignores separated sleeves hanging beside the torso', () => {
    const fit = analyseSilhouette(mask(200, 160, [...shirt, [10, 40, 35, 145], [165, 40, 190, 145]]), 200, 160, 'top')
    expect(fit.anchor.left).toBeCloseTo(0.3)
    expect(fit.anchor.right).toBeCloseTo(0.7)
  })

  it('keeps a narrow sleeveless top narrower than a sleeved image', () => {
    const sleeved = analyseSilhouette(mask(200, 160, shirt), 200, 160, 'top')
    const tank = analyseSilhouette(mask(200, 160, [shirt[0]]), 200, 160, 'top')
    const a = placeItem('top', 1.25, geo, sleeved), b = placeItem('top', 1.25, geo, tank)
    // Empty canvas space is irrelevant: both visible torsos have the same span.
    expect(a.width).toBeCloseTo(b.width)
    expect(tank.bounds.width * b.width).toBeLessThan(sleeved.bounds.width * a.width)
  })

  it('produces identical visible placement despite padding and resolution', () => {
    const base = analyseSilhouette(mask(200, 160, shirt), 200, 160, 'top')
    const paddedRects = shirt.map(([l, t, r, b]) => [l + 90, t + 20, r + 90, b + 20])
    const padded = analyseSilhouette(mask(400, 240, paddedRects), 400, 240, 'top')
    const enlarged = analyseSilhouette(mask(400, 320, shirt.map((r) => r.map((v) => v * 2))), 400, 320, 'top')
    const visible = (fit, aspect) => {
      const box = placeItem('top', aspect, geo, fit), b = fit.bounds
      return [box.x + b.x * box.width, box.y + b.y * box.height, b.width * box.width, b.height * box.height]
    }
    const expected = visible(base, 200 / 160)
    for (const actual of [visible(padded, 400 / 240), visible(enlarged, 400 / 320)]) {
      actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i]))
    }
  })

  it('uses the waistband of shorts and centres asymmetrically padded photos', () => {
    const fit = analyseSilhouette(mask(200, 140, shorts), 200, 140, 'bottom')
    const r = placeItem('bottom', 200 / 140, geo, fit)
    expect(fit.anchor.left).toBeCloseTo(0.1)
    expect(fit.anchor.right).toBeCloseTo(0.7)
    expect(r.x + (fit.anchor.left + fit.anchor.right) / 2 * r.width).toBeCloseTo(geo.centre)
    expect(r.y + fit.anchor.y * r.height).toBeCloseTo(geo.waist.y - 8)
    expect(r.y + (fit.bounds.y + fit.bounds.height) * r.height).toBeLessThan(geo.landmarks.leftKnee[1])
    const wide = dollGeometry({ hips: 1.2 })
    expect(placeItem('bottom', 200 / 140, wide, fit).width).toBeGreaterThan(r.width)
  })

  it('fits trouser length separately from waistband width', () => {
    const data = mask(160, 440, [[20, 10, 140, 60], [10, 60, 75, 430], [85, 60, 150, 430]])
    const fit = analyseSilhouette(data, 160, 440, 'bottom')
    const r = placeItem('bottom', 160 / 440, geo, fit)
    expect(r.y + (fit.bounds.y + fit.bounds.height) * r.height).toBeCloseTo(geo.feet.y - 2)
    const tall = dollGeometry({ legs: 1.2 })
    const longer = placeItem('bottom', 160 / 440, tall, fit)
    expect(longer.height).toBeGreaterThan(r.height)
    expect(longer.width).toBeCloseTo(r.width)
  })

  it('supports dress and outerwear categories', () => {
    for (const category of ['dress', 'outerwear']) {
      const fit = analyseSilhouette(mask(200, 300, [[60, 10, 140, 130], [40, 130, 160, 290], [10, 20, 190, 50]]), 200, 300, category)
      expect(validFit(fit, category)).toBe(true)
      const r = placeItem(category, 2 / 3, geo, fit)
      expect(r.y + fit.anchor.y * r.height).toBeCloseTo(geo.shoulders.y)
    }
  })

  it('does not mistake a narrow skirt for long trousers', () => {
    const fit = analyseSilhouette(mask(160, 440, [[20, 10, 140, 430]]), 160, 440, 'bottom')
    expect(fit.dividedLegs).toBe(false)
    const r = placeItem('bottom', 160 / 440, geo, fit)
    expect(placeItem('bottom', 160 / 440, dollGeometry({ legs: 1.2 }), fit)).toEqual(r)
  })

  it('recognizes wide jeans as full length and keeps their waistband width', () => {
    const fit = analyseSilhouette(mask(220, 320, [[40, 10, 180, 80], [15, 80, 100, 310], [120, 80, 205, 310]]), 220, 320, 'bottom')
    expect(fit.bounds.width * (220 / 320) / fit.bounds.height).toBeGreaterThan(0.6)
    expect(fit.longLegs).toBe(true)
    const full = placeItem('bottom', 220 / 320, geo, fit)
    const ankle = placeItem('bottom', 220 / 320, geo, fit, 'ankle')
    const calf = placeItem('bottom', 220 / 320, geo, fit, 'calf')
    expect(full.y + (fit.bounds.y + fit.bounds.height) * full.height).toBeCloseTo(geo.feet.y - 2)
    expect(ankle.y + (fit.bounds.y + fit.bounds.height) * ankle.height).toBeCloseTo(geo.ankles.y + 2)
    expect(calf.height).toBeLessThan(ankle.height)
    expect(full.width).toBeCloseTo(ankle.width)
    expect(calf.width).toBeCloseTo(full.width)
    expect(placeItem('bottom', 220 / 320, geo, fit, '__proto__')).toEqual(full)
  })

  it('falls back for empty/opaque images, unsupported categories and bad data', () => {
    expect(analyseSilhouette(mask(200, 160, []), 200, 160, 'top')).toBeNull()
    expect(analyseSilhouette(mask(200, 160, [[0, 0, 200, 160]]), 200, 160, 'top')).toBeNull()
    expect(analyseSilhouette(mask(200, 160, shirt), 200, 160, 'shoes')).toBeNull()
    expect(analyseSilhouette(new Uint8ClampedArray(4), 200, 160, 'top')).toBeNull()
    const fit = analyseSilhouette(mask(200, 160, shirt), 200, 160, 'top')
    for (const invalid of [null, {}, { ...fit, version: 0 }, { ...fit, category: 'bottom' },
      { ...fit, anchor: { left: 0.5, right: 0.5, y: 0.2 } },
      { ...fit, bounds: { ...fit.bounds, width: NaN } }]) {
      expect(placeItem('top', 1.25, geo, invalid)).toEqual(placeItem('top', 1.25, geo))
    }
  })
})

describe('cutout analysis in the browser', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
  it('analyses a bounded-size bitmap and closes it', async () => {
    const bitmap = { width: 2000, height: 1600, close: vi.fn() }
    const ctx = { drawImage: vi.fn(), getImageData: vi.fn(() => ({ data: mask(256, 205, [[80, 10, 180, 195]]) })) }
    const canvas = { getContext: () => ctx }
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    vi.stubGlobal('document', { createElement: () => canvas })
    expect(validFit(await fitFromBlob(new Blob(), 'top'), 'top')).toBe(true)
    expect(canvas.width).toBe(256)
    expect(canvas.height).toBe(205)
    expect(bitmap.close).toHaveBeenCalledOnce()
  })
  it('keeps fitting failures recoverable and closes the bitmap', async () => {
    const bitmap = { width: 100, height: 100, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    vi.stubGlobal('document', { createElement: () => { throw new Error('Canvas unavailable') } })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await fitFromBlob(new Blob(), 'top')).toBeNull()
    expect(bitmap.close).toHaveBeenCalledOnce()
  })
})
