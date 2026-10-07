import { describe, it, expect } from 'vitest'
import { analyseSilhouette } from '../src/lib/fit.js'
import { legMesh } from '../src/lib/garment-mesh.js'
import { dollGeometry, placeItem } from '../src/lib/doll.js'
import { polygonMask } from './helpers/garment-mask.js'

// Trousers laid out with the legs spread in a V: waistband at the top, legs
// joined down to the crotch (~y 116), then splaying out to the hems.
const W = 300, H = 400
const vTrousers = [
  [[100, 10], [200, 10], [200, 45], [100, 45]],
  [[100, 40], [152, 40], [152, 110], [60, 390], [10, 390]],
  [[148, 40], [200, 40], [290, 390], [240, 390], [148, 110]],
]
const geo = dollGeometry()
const fitOf = (polygons) => analyseSilhouette(polygonMask(W, H, polygons), W, H, 'bottom')
const world = (p, box) => [box.x + p[0] * box.width, box.y + p[1] * box.height]

describe('trouser legs', () => {
  it('finds each leg, from the crotch to the hem', () => {
    const fit = fitOf(vTrousers)
    expect(fit.dividedLegs).toBe(true)
    const { left, right } = fit.legs
    expect(left.hem[0]).toBeLessThan(left.top[0])   // splays out to the left
    expect(right.hem[0]).toBeGreaterThan(right.top[0])
    expect(left.top[1]).toBeGreaterThan(0.2)        // crotch is below the waistband
    expect(left.hem[1]).toBeGreaterThan(0.9)
  })

  it('lets spread legs hang straight down, side by side', () => {
    const fit = fitOf(vTrousers)
    const box = placeItem('bottom', W / H, geo, fit)
    const mesh = legMesh(fit, box, geo)
    expect(mesh).not.toBeNull()
    // Where the middle of each hem ends up, compared with the doll's ankles.
    const mapped = (point) => {
      for (const t of mesh) {
        const [a, b, c] = t.source
        const d = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
        const w0 = d(b, c, point) / d(b, c, a), w1 = d(c, a, point) / d(c, a, b), w2 = 1 - w0 - w1
        if (w0 >= -1e-9 && w1 >= -1e-9 && w2 >= -1e-9) {
          return [0, 1].map((k) => w0 * t.destination[0][k] + w1 * t.destination[1][k] + w2 * t.destination[2][k])
        }
      }
      return null
    }
    for (const side of ['left', 'right']) {
      // Each leg hangs straight down from where it leaves the crotch.
      const topX = world(fit.legs[side].top, box)[0]
      const hem = fit.legs[side].hem
      expect(Math.abs(world(hem, box)[0] - topX)).toBeGreaterThan(20) // spread before
      expect(Math.abs(mapped(hem)[0] - topX)).toBeLessThan(4)          // straight after
    }
    // ...and the two legs don't cross: the left hem stays left of the right one,
    // with the gap between them kept.
    const leftHem = mapped(fit.legs.left.hem), rightHem = mapped(fit.legs.right.hem)
    const legGap = world(fit.legs.right.top, box)[0] - world(fit.legs.left.top, box)[0]
    expect(rightHem[0] - leftHem[0]).toBeGreaterThan(legGap * 0.9)
  })

  it('keeps the waistband exactly where it was', () => {
    const fit = fitOf(vTrousers)
    const box = placeItem('bottom', W / H, geo, fit)
    const crotch = fit.legs.left.top[1]
    for (const t of legMesh(fit, box, geo)) t.source.forEach((p, i) => {
      if (p[1] <= crotch - 0.06) {
        const w = world(p, box)
        expect(t.destination[i][0]).toBeCloseTo(w[0])
        expect(t.destination[i][1]).toBeCloseTo(w[1])
      }
      expect(t.destination[i].every(Number.isFinite)).toBe(true)
    })
  })

  it('leaves skirts and other garments alone', () => {
    const skirt = fitOf([[[90, 10], [210, 10], [260, 390], [40, 390]]])
    expect(skirt.dividedLegs).toBe(false)
    expect(legMesh(skirt, placeItem('bottom', W / H, geo, skirt), geo)).toBeNull()
    const top = analyseSilhouette(polygonMask(W, H, vTrousers), W, H, 'top')
    if (top) expect(legMesh(top, placeItem('top', W / H, geo, top), geo)).toBeNull()
  })
})
