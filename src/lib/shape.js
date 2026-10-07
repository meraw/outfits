// Making room for the body: where the doll's body is wider than a garment
// (wide hips under a straight dress, say), the garment widens just enough
// at that height that the body doesn't poke out beside it. Garments are
// never narrowed: real clothes can be roomier than the body, never tighter.

export const ROOM = 4 // doll units of fabric kept beyond the body on each side
const MAX_WIDEN = 1.6
const SMOOTH = 0.03 // share of the garment height the widening is eased over

// Half the doll's body width at height y (0 above the neck / below the ankles).
export function bodyHalfAt(geo, y) {
  const p = geo.profile
  if (!p || y < p[0][0] || y > p.at(-1)[0]) return 0
  for (let i = 0; i < p.length - 1; i++) {
    const [y0, h0] = p[i], [y1, h1] = p[i + 1]
    if (y <= y1) return y1 === y0 ? h1 : h0 + (h1 - h0) * (y - y0) / (y1 - y0)
  }
  return 0
}

// The garment's own body on each pixel row: { left, right } as shares of the
// picture width, using the solid stretch through the garment's middle (so
// sleeves hanging beside it don't count), or null where there is none.
export function garmentRows(rgba, width, height) {
  // The garment's middle: the stretch of columns holding the most fabric
  // (a sleeve on one side doesn't pull it off the garment's body).
  const counts = new Uint32Array(width)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (rgba[(y * width + x) * 4 + 3] >= 96) counts[x]++
  }
  const most = Math.max(...counts)
  let first = -1, last = -1
  for (let x = 0; x < width; x++) if (most && counts[x] >= most * 0.9) { if (first < 0) first = x; last = x }
  const middle = (first + last) / 2
  const rows = []
  for (let y = 0; y < height; y++) {
    const solid = (x) => rgba[(y * width + Math.round(x)) * 4 + 3] >= 96
    if (first < 0 || !solid(middle)) { rows.push(null); continue }
    let l = Math.round(middle), r = Math.round(middle)
    while (l > 0 && solid(l - 1)) l--
    while (r < width - 1 && solid(r + 1)) r++
    rows.push({ left: l / width, right: (r + 1) / width })
  }
  return rows
}

// Widens a garment's triangle mesh where needed (or makes a plain grid for
// an unbent garment). Returns the triangles unchanged — or null when given
// none — if the garment is already roomy enough everywhere.
export function makeRoom(triangles, rows, box, geo) {
  const n = rows.length
  if (!n) return triangles ?? null
  const widen = new Float64Array(n).fill(1)
  const centre = new Float64Array(n).fill(box.x + box.width / 2)
  const half = new Float64Array(n)
  let any = false
  rows.forEach((r, i) => {
    if (!r) return
    centre[i] = box.x + (r.left + r.right) / 2 * box.width
    half[i] = (r.right - r.left) / 2 * box.width
    const body = bodyHalfAt(geo, box.y + (i + 0.5) / n * box.height)
    if (!body || half[i] <= 0) return
    const need = (body + ROOM) / half[i]
    if (need > 1) { widen[i] = Math.min(MAX_WIDEN, need); any = true }
  })
  if (!any) return triangles ?? null

  // Ease the widening in and out so the outline curves instead of stepping.
  const k = Math.max(1, Math.round(n * SMOOTH))
  const peak = widen.map((_, i) => Math.max(...widen.subarray(Math.max(0, i - k), Math.min(n, i + k + 1))))
  const eased = peak.map((_, i) => {
    const part = peak.subarray(Math.max(0, i - k), Math.min(n, i + k + 1))
    return part.reduce((a, b) => a + b, 0) / part.length
  })
  for (let i = 0; i < n; i++) if (!rows[i]) eased[i] = 1 // nothing to widen (e.g. between trouser legs)
  const at = (arr, v) => arr[Math.min(n - 1, Math.max(0, Math.round(v * n - 0.5)))]

  // Inside the garment's body, stretch out from its middle; beside it
  // (sleeves), move out by as much as the body's edge did.
  const move = (p, d) => {
    const s = at(eased, p[1])
    if (s === 1) return d
    const c = at(centre, p[1]), reach = at(half, p[1])
    const off = d[0] - c
    return [d[0] + Math.sign(off) * Math.min(Math.abs(off), reach) * (s - 1), d[1]]
  }
  const world = (p) => [box.x + p[0] * box.width, box.y + p[1] * box.height]
  const base = triangles ?? grid(world)
  return base.map(({ source, destination }) => ({ source, destination: source.map((p, i) => move(p, destination[i])) }))
}

function grid(world) {
  const xs = Array.from({ length: 11 }, (_, i) => i / 10)
  const ys = Array.from({ length: 49 }, (_, i) => i / 48)
  const triangles = []
  for (let x = 0; x < xs.length - 1; x++) for (let y = 0; y < ys.length - 1; y++) {
    const a = [xs[x], ys[y]], b = [xs[x + 1], ys[y]], c = [xs[x + 1], ys[y + 1]], d = [xs[x], ys[y + 1]]
    for (const source of [[a, b, c], [a, c, d]]) triangles.push({ source, destination: source.map(world) })
  }
  return triangles
}
