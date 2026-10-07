import { describe, it, expect } from 'vitest'
import { analyseSilhouette } from '../src/lib/fit.js'
import { dollGeometry, placeItem } from '../src/lib/doll.js'
import { sleeveMesh, triangleMatrix, expandedTriangle } from '../src/lib/garment-mesh.js'
import { polygonMask } from './helpers/garment-mask.js'

const geo = dollGeometry()
const fit = analyseSilhouette(polygonMask(), 160, 110, 'top')
const box = placeItem('top', 160 / 110, geo, fit)
const map = ([a, b, c, d, e, f], [x, y]) => [a * x + c * y + e, b * x + d * y + f]

describe('sleeve mesh', () => {
  it('detects shoulder and cuff landmarks on sloping sleeves', () => {
    expect(fit.sleeves.left.cuff[0]).toBeLessThan(fit.anchor.left)
    expect(fit.sleeves.right.cuff[0]).toBeGreaterThan(fit.anchor.right)
    expect(fit.sleeves.left.cuff[1]).toBeGreaterThan(fit.sleeves.left.pivot[1])
  })

  it('centres sleeve roots between the upper and lower attachment edges', () => {
    for (const sleeve of Object.values(fit.sleeves)) {
      expect(sleeve.pivot[1]).toBeCloseTo((sleeve.attachment.top[1] + sleeve.attachment.bottom[1]) / 2)
      expect(sleeve.attachment.top[1]).toBeLessThan(sleeve.attachment.bottom[1])
      expect(sleeve.fullLength).toBe(true)
      expect(sleeve.extentRatio).toBeGreaterThanOrEqual(1)
    }
  })

  it('distinguishes broad long-sleeved shirts from short sleeves', () => {
    const shirt = (end) => analyseSilhouette(polygonMask(240, 140, [
      [[80, 15], [120, 8], [160, 15], [160, 125], [80, 125]],
      [[80, 15], [80, 55], [end, 65], [end, 25]],
      [[160, 15], [240 - end, 25], [240 - end, 65], [160, 55]],
    ]), 240, 140, 'top')
    const long = shirt(10), short = shirt(60)
    for (const side of ['left', 'right']) {
      expect(long.sleeves[side].fullLength).toBe(true)
      expect(short.sleeves[side].fullLength).toBe(false)
    }
  })

  it('preserves sleeve cross-section width while bending around the elbow', () => {
    const horizontal = { ...fit, sleeves: { left: {
      pivot: [fit.anchor.left, 0.4], cuff: [0.05, 0.4], fullLength: true,
    } } }
    const mesh = sleeveMesh(horizontal, box, geo)
    const vertices = mesh.flatMap((t) => t.source.map((p, i) => ({ p, q: t.destination[i] })))
    const at = (y) => vertices.find(({ p }) => p[0] === fit.anchor.left / 2 && p[1] === y).q
    const a = at(0.4), b = at(0.5)
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeCloseTo(box.height * 0.1)
  })

  it('keeps every torso vertex in its original position', () => {
    const mesh = sleeveMesh(fit, box, geo)
    let torsoVertices = 0
    for (const triangle of mesh) triangle.source.forEach((p, i) => {
      if (p[0] >= fit.anchor.left && p[0] <= fit.anchor.right) {
        torsoVertices++
        expect(triangle.destination[i][0]).toBeCloseTo(box.x + p[0] * box.width)
        expect(triangle.destination[i][1]).toBeCloseTo(box.y + p[1] * box.height)
      }
    })
    expect(torsoVertices).toBeGreaterThan(0)
  })

  it('moves cuff regions inward and down toward the wrists', () => {
    const mesh = sleeveMesh(fit, box, geo)
    for (const side of ['left', 'right']) {
      const extreme = side === 'left' ? 0 : 1
      const triangles = mesh.filter((t) => t.source.some((p) => p[0] === extreme && p[1] >= 0.6 && p[1] <= 0.8))
      for (const t of triangles) t.source.forEach((p, i) => {
        if (p[0] !== extreme || p[1] < 0.6 || p[1] > 0.8) return
        const before = [box.x + p[0] * box.width, box.y + p[1] * box.height]
        expect(Math.abs(t.destination[i][0] - geo.centre)).toBeLessThan(Math.abs(before[0] - geo.centre))
        expect(t.destination[i][1]).toBeGreaterThan(before[1])
      })
    }
  })

  it('shares exactly matching vertices across triangle boundaries', () => {
    const vertices = new Map()
    for (const t of sleeveMesh(fit, box, geo)) t.source.forEach((p, i) => {
      const key = p.join(',')
      if (vertices.has(key)) expect(t.destination[i]).toEqual(vertices.get(key))
      else vertices.set(key, t.destination[i])
    })
  })

  it('maps every triangle corner with a finite SVG affine matrix', () => {
    for (const { source, destination } of sleeveMesh(fit, box, geo)) {
      const matrix = triangleMatrix(source, destination)
      expect(matrix.every(Number.isFinite)).toBe(true)
      source.forEach((p, i) => map(matrix, p).forEach((v, axis) => expect(v).toBeCloseTo(destination[i][axis])))
    }
    expect(triangleMatrix([[0, 0], [0, 0], [1, 1]], [[0, 0], [1, 1], [2, 2]])).toBeNull()
  })

  it('uses rigid placement for sleeveless garments and invalid sleeve data', () => {
    expect(sleeveMesh({ ...fit, sleeves: {} }, box, geo)).toBeNull()
    expect(sleeveMesh({ ...fit, sleeves: { left: { pivot: null, cuff: [NaN, 1] } } }, box, geo)).toBeNull()
    expect(sleeveMesh(null, box, geo)).toBeNull()
  })

  it('does not treat a flared lower hem as sleeves', () => {
    const flared = analyseSilhouette(polygonMask(160, 110, [
      [[60, 8], [100, 8], [100, 60], [150, 105], [10, 105], [60, 60]],
    ]), 160, 110, 'top')
    expect(flared.sleeves).toEqual({})
  })

  it('overlaps skinny clip triangles along their edges without invalid coordinates', () => {
    const expanded = expandedTriangle([[0, 0], [100, 0], [100, 1]])
    expect(expanded.every((p) => p.every(Number.isFinite))).toBe(true)
    expect(expanded).toHaveLength(6)
    const original = [[0, 0], [100, 0], [100, 1]]
    expanded.forEach((p, i) => {
      const vertex = original[Math.floor(i / 2)]
      expect(Math.hypot(p[0] - vertex[0], p[1] - vertex[1])).toBeCloseTo(0.35)
    })
    expect(expanded[1][1]).toBeCloseTo(-0.35)
    expect(expanded[3][0]).toBeCloseTo(100.35)
    expect(expandedTriangle([...original].reverse()).every((p) => p.every(Number.isFinite))).toBe(true)
    const line = [[0, 0], [1, 1], [2, 2]]
    expect(expandedTriangle(line)).toEqual(line)
  })
})
