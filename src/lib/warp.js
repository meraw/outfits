// Bends a garment picture along a triangle mesh into one new picture.
//
// Drawing each triangle separately (clipped pieces) leaves hairline seams
// where pieces meet, and the layer underneath shows through. Here every
// output pixel is filled from exactly one triangle, so there is nothing for
// a seam to fall into. Where the mesh folds over itself, the most solid
// layer wins.
//
//   src        { data: RGBA bytes, width, height }  (straight, not premultiplied)
//   triangles  [{ source: 3 × [u, v] in 0–1 of src, destination: 3 × [x, y] doll units }]
//   scale      output pixels per doll unit
// Returns { data, width, height, box } where box is the doll-unit area covered.
export function warpTriangles(src, triangles, scale) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const { destination } of triangles) for (const [x, y] of destination) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const box = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  const width = Math.max(1, Math.ceil(box.width * scale - 1e-9))
  const height = Math.max(1, Math.ceil(box.height * scale - 1e-9))
  const out = new Uint8ClampedArray(width * height * 4)
  const sw = src.width, sh = src.height, sd = src.data

  for (const { source, destination } of triangles) {
    const p = destination.map(([x, y]) => [(x - minX) * scale, (y - minY) * scale])
    const area = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[2][0] - p[0][0]) * (p[1][1] - p[0][1])
    if (Math.abs(area) < 1e-12) continue
    const x0 = Math.max(0, Math.floor(Math.min(p[0][0], p[1][0], p[2][0])))
    const x1 = Math.min(width - 1, Math.ceil(Math.max(p[0][0], p[1][0], p[2][0])))
    const y0 = Math.max(0, Math.floor(Math.min(p[0][1], p[1][1], p[2][1])))
    const y1 = Math.min(height - 1, Math.ceil(Math.max(p[0][1], p[1][1], p[2][1])))
    // Source position in source pixels, for each corner.
    const s = source.map(([u, v]) => [u * sw - 0.5, v * sh - 0.5])
    const eps = -1e-9

    for (let py = y0; py <= y1; py++) {
      const cy = py + 0.5
      for (let px = x0; px <= x1; px++) {
        const cx = px + 0.5
        // Barycentric weights: how much each corner contributes here.
        const w0 = ((p[1][0] - cx) * (p[2][1] - cy) - (p[2][0] - cx) * (p[1][1] - cy)) / area
        const w1 = ((p[2][0] - cx) * (p[0][1] - cy) - (p[0][0] - cx) * (p[2][1] - cy)) / area
        const w2 = 1 - w0 - w1
        if (w0 < eps || w1 < eps || w2 < eps) continue
        sample(sd, sw, sh, w0 * s[0][0] + w1 * s[1][0] + w2 * s[2][0], w0 * s[0][1] + w1 * s[1][1] + w2 * s[2][1], out, (py * width + px) * 4)
      }
    }
  }
  return { data: out, width, height, box }
}

// Smooth (bilinear) read between source pixels. Colours are weighted by
// their opacity so see-through edges don't leave dark fringes.
function sample(sd, sw, sh, x, y, out, o) {
  const fx0 = Math.floor(x), fy0 = Math.floor(y)
  const fx = x - fx0, fy = y - fy0
  let a = 0, r = 0, g = 0, b = 0
  for (let j = 0; j < 2; j++) {
    const yy = Math.min(sh - 1, Math.max(0, fy0 + j))
    const wy = j ? fy : 1 - fy
    for (let i = 0; i < 2; i++) {
      const w = wy * (i ? fx : 1 - fx)
      if (w === 0) continue
      const xx = Math.min(sw - 1, Math.max(0, fx0 + i))
      const k = (yy * sw + xx) * 4
      const wa = w * sd[k + 3]
      a += wa; r += wa * sd[k]; g += wa * sd[k + 1]; b += wa * sd[k + 2]
    }
  }
  // Where the mesh folds over itself (empty padding swung over fabric),
  // keep the most solid layer so padding can never thin out the garment.
  if (a <= out[o + 3]) return
  out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; out[o + 3] = a
}
