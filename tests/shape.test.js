import { describe, it, expect } from 'vitest'
import { bodyHalfAt, garmentRows, makeRoom, ROOM } from '../src/lib/shape.js'
import { dollGeometry, DEFAULT_SHAPE } from '../src/lib/doll.js'
import { polygonMask } from './helpers/garment-mask.js'

const W = 100, H = 200
// A straight, narrow dress: same width from top to bottom.
const straightDress = [[[30, 0], [70, 0], [70, 200], [30, 200]]]
// A loose tent dress: much wider than any body.
const tent = [[[5, 0], [95, 0], [95, 200], [5, 200]]]
const wideHips = dollGeometry({ ...DEFAULT_SHAPE, hips: 1.25 })

// Box so the straight dress (0.4 of the picture) is 160 doll units wide,
// about how the app sizes a dress.
const box = (geo) => ({ x: geo.centre - 200, y: 190, width: 400, height: 500 })
const widthAt = (triangles, v) => {
  // destination x of the mesh points on source row v, at the dress's left and right edge
  const xs = triangles.flatMap((t) => t.source.map((p, i) => [p, t.destination[i]]))
    .filter(([p]) => Math.abs(p[1] - v) < 1e-9)
  const at = (u) => xs.filter(([p]) => Math.abs(p[0] - u) < 1e-9).map(([, d]) => d[0])[0]
  return at(0.7) - at(0.3)
}

describe('the doll body width', () => {
  it('follows the shape sliders', () => {
    const base = dollGeometry(DEFAULT_SHAPE)
    expect(bodyHalfAt(wideHips, wideHips.hips.y)).toBeGreaterThan(bodyHalfAt(base, base.hips.y))
    expect(bodyHalfAt(base, base.waist.y)).toBeCloseTo(base.waist.half, 0)
    expect(bodyHalfAt(base, 20)).toBe(0) // above the head
  })
})

describe('garmentRows', () => {
  it('measures the garment body on each row, ignoring sleeves hanging beside it', () => {
    const shirt = [[[40, 10], [60, 10], [60, 190], [40, 190]], [[5, 10], [25, 10], [25, 120], [5, 120]]]
    const rows = garmentRows(polygonMask(W, H, shirt), W, H)
    const r = rows[Math.round(0.5 * (rows.length - 1))]
    expect(r.left).toBeCloseTo(0.4, 1)
    expect(r.right).toBeCloseTo(0.6, 1)
    expect(rows[0]).toBeNull() // nothing on the very top row
  })
})

describe('makeRoom', () => {
  it('widens a narrow dress where wide hips would poke out, and only there', () => {
    const rows = garmentRows(polygonMask(W, H, straightDress), W, H)
    const b = box(wideHips)
    const mesh = makeRoom(null, rows, b, wideHips)
    expect(mesh).not.toBeNull()
    const hipV = (wideHips.hips.y - b.y) / b.height
    const shoulderV = (wideHips.shoulders.y + 2 - b.y) / b.height
    const hipRow = mesh.flatMap((t) => t.source).map((p) => p[1]).reduce((best, v) => (Math.abs(v - hipV) < Math.abs(best - hipV) ? v : best), 0)
    const shoulderRow = mesh.flatMap((t) => t.source).map((p) => p[1]).reduce((best, v) => (Math.abs(v - shoulderV) < Math.abs(best - shoulderV) ? v : best), 0)
    const needed = 2 * (bodyHalfAt(wideHips, b.y + hipRow * b.height) + ROOM)
    expect(widthAt(mesh, hipRow)).toBeGreaterThanOrEqual(needed - 1)
    expect(widthAt(mesh, shoulderRow)).toBeCloseTo(0.4 * b.width, 0) // shoulders untouched
  })

  it('leaves a garment that is already roomier than the body alone', () => {
    const rows = garmentRows(polygonMask(W, H, tent), W, H)
    expect(makeRoom(null, rows, box(wideHips), wideHips)).toBeNull()
  })
})
