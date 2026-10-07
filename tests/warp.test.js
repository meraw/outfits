import { describe, it, expect } from 'vitest'
import { warpTriangles } from '../src/lib/warp.js'

// width × height RGBA picture where every pixel gets colour(x, y).
function picture(width, height, colour) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(colour(x, y), (y * width + x) * 4)
  return { data, width, height }
}

// A cols × rows grid of triangles over the whole source picture, each corner
// sent through move(u, v) → [x, y] in doll units.
function grid(cols, rows, move) {
  const triangles = []
  const at = (i, j) => [i / cols, j / rows]
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1)
    for (const source of [[a, b, c], [a, c, d]]) triangles.push({ source, destination: source.map(([u, v]) => move(u, v)) })
  }
  return triangles
}

describe('warpTriangles', () => {
  it('reproduces the picture exactly when nothing is bent', () => {
    const src = picture(8, 6, (x, y) => [x * 30, y * 40, (x + y) * 10, 255])
    const out = warpTriangles(src, grid(3, 2, (u, v) => [10 + u * 8, 20 + v * 6]), 1)
    expect(out.box).toEqual({ x: 10, y: 20, width: 8, height: 6 })
    expect([out.width, out.height]).toEqual([8, 6])
    expect([...out.data]).toEqual([...src.data])
  })

  it('leaves no gaps or see-through lines inside a bent garment', () => {
    const red = picture(40, 40, () => [200, 30, 40, 255])
    // Bend like a sleeve: the lower part swings sideways, the grid is uneven.
    const bend = (u, v) => [u * 50 + v * v * 30 + Math.sin(u * 7 + v * 5) * 2, v * 60 + u * 8]
    const triangles = grid(7, 9, bend)
    const out = warpTriangles(red, triangles, 2)

    // Check every output pixel well inside the bent outline (≥ 2 px from its edge).
    const inside = (px, py) => {
      const sample = (u, v) => bend(u, v).map((n, axis) => (n - (axis ? out.box.y : out.box.x)) * 2)
      // Point-in-polygon against the bent outline, traced along its 4 edges.
      const outline = []
      for (let t = 0; t <= 1; t += 1 / 40) outline.push(sample(t, 0))
      for (let t = 0; t <= 1; t += 1 / 40) outline.push(sample(1, t))
      for (let t = 1; t >= 0; t -= 1 / 40) outline.push(sample(t, 1))
      for (let t = 1; t >= 0; t -= 1 / 40) outline.push(sample(0, t))
      let on = false
      for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
        const [xi, yi] = outline[i], [xj, yj] = outline[j]
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) on = !on
      }
      if (!on) return false
      return outline.every(([x, y]) => Math.hypot(x - px, y - py) >= 2)
    }
    let checked = 0, holes = 0
    for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue
      checked++
      const i = (y * out.width + x) * 4
      if (out.data[i + 3] !== 255 || out.data[i] !== 200 || out.data[i + 1] !== 30) holes++
    }
    expect(checked).toBeGreaterThan(2000)
    expect(holes).toBe(0)
  })

  it('makes a bigger picture for a higher quality', () => {
    const src = picture(4, 4, () => [0, 0, 0, 255])
    const triangles = grid(1, 1, (u, v) => [u * 10, v * 20])
    expect([warpTriangles(src, triangles, 1).width, warpTriangles(src, triangles, 3).width]).toEqual([10, 30])
  })

  it('never lets folded see-through padding erase the garment underneath it', () => {
    // Left half solid fabric, right half empty padding (like the space below a sleeve).
    const src = picture(4, 4, (x) => (x < 2 ? [200, 30, 40, 255] : [0, 0, 0, 0]))
    const fabric = { source: [[0, 0], [0.35, 0], [0.35, 1]], destination: [[0, 0], [10, 0], [10, 10]] }
    // The padding is folded onto the same spot and drawn afterwards; its edge
    // samples are half see-through, which used to overwrite the fabric.
    const padding = { source: [[0.45, 0], [1, 0], [1, 1]], destination: [[0, 0], [10, 0], [10, 10]] }
    const out = warpTriangles(src, [fabric, padding], 1)
    let thin = 0
    for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
      const i = (y * out.width + x) * 4
      if (x + 0.5 > y + 0.5 + 0.01 && out.data[i + 3] < 255) thin++ // inside the fabric triangle
    }
    expect(thin).toBe(0)
  })

  it('keeps see-through parts of the cutout see-through', () => {
    const src = picture(4, 4, (x) => (x < 2 ? [0, 0, 0, 0] : [10, 20, 30, 255]))
    const out = warpTriangles(src, grid(1, 1, (u, v) => [u * 4, v * 4]), 1)
    expect(out.data[3]).toBe(0)                  // left edge: transparent
    expect(out.data[(0 * 4 + 3) * 4 + 3]).toBe(255) // right edge: solid
  })
})
