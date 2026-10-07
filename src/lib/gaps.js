// The background remover sometimes keeps bits of floor that are almost
// enclosed by the garment, most often the narrow gap between trouser legs.
// That hides the legs from the fitting (so long trousers were drawn as
// shorts) and shows a strip of floor on the doll.
//
// This clears floor-coloured parts of the cutout, but only ones that open
// out to the garment's edge (so a floor-coloured logo in the middle stays),
// and only when the garment itself is clearly a different colour.
//
//   cutout    RGBA from the background remover (changed in place)
//   original  RGBA of the photo, same size
const NEAR_FLOOR = 36 // how close (in colour) a pixel must be to count as floor
const MIN_CONTRAST = 60 // garment and floor must differ at least this much

export function clearBackgroundGaps(cutout, original, width, height) {
  const floor = borderColour(original, width, height)
  const dist = (i) => Math.hypot(original[i] - floor[0], original[i + 1] - floor[1], original[i + 2] - floor[2])
  const solid = (p) => cutout[p * 4 + 3] >= 128

  // Average colour of the garment as kept by the remover.
  let n = 0, r = 0, g = 0, b = 0
  for (let p = 0; p < width * height; p++) {
    if (!solid(p)) continue
    n++; r += original[p * 4]; g += original[p * 4 + 1]; b += original[p * 4 + 2]
  }
  if (!n || Math.hypot(r / n - floor[0], g / n - floor[1], b / n - floor[2]) < MIN_CONTRAST) return

  // Start from floor-coloured pixels on the garment's edge, and spread
  // through neighbouring floor-coloured pixels.
  const seen = new Uint8Array(width * height)
  const queue = []
  const onEdge = (x, y) => x === 0 || y === 0 || x === width - 1 || y === height - 1
    || !solid(y * width + x - 1) || !solid(y * width + x + 1) || !solid((y - 1) * width + x) || !solid((y + 1) * width + x)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x
    if (solid(p) && dist(p * 4) < NEAR_FLOOR && onEdge(x, y)) { seen[p] = 1; queue.push(p) }
  }
  while (queue.length) {
    const p = queue.pop()
    cutout[p * 4 + 3] = 0
    const x = p % width, y = (p - x) / width
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const q = ny * width + nx
      if (!seen[q] && solid(q) && dist(q * 4) < NEAR_FLOOR) { seen[q] = 1; queue.push(q) }
    }
  }
}

// The floor's colour: the middle value of the photo's outer edge pixels.
function borderColour(rgba, width, height) {
  const reds = [], greens = [], blues = []
  const take = (x, y) => { const i = (y * width + x) * 4; reds.push(rgba[i]); greens.push(rgba[i + 1]); blues.push(rgba[i + 2]) }
  for (let x = 0; x < width; x++) { take(x, 0); take(x, height - 1) }
  for (let y = 1; y < height - 1; y++) { take(0, y); take(width - 1, y) }
  const mid = (v) => v.sort((a, b) => a - b)[v.length >> 1]
  return [mid(reds), mid(greens), mid(blues)]
}
