// A small continuous sleeve mesh. The torso stays fixed and sleeve rotations
// blend into it at the side seams, avoiding disconnected cut-and-paste pieces.
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const world = (p, box) => [box.x + p[0] * box.width, box.y + p[1] * box.height]

function sleeveTransform(sleeve, side, box, geo, torsoWidth) {
  if (!sleeve || !Array.isArray(sleeve.pivot) || !Array.isArray(sleeve.cuff)
    || sleeve.pivot.length !== 2 || sleeve.cuff.length !== 2
    || ![...sleeve.pivot, ...sleeve.cuff].every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) return null
  const pivot = world(sleeve.pivot, box), cuff = world(sleeve.cuff, box)
  const wrist = geo.landmarks[side + 'Wrist']
  const source = [cuff[0] - pivot[0], cuff[1] - pivot[1]]
  const target = [wrist[0] - pivot[0], wrist[1] - pivot[1]]
  const length = Math.hypot(...source)
  if (length < 8) return null
  const angle = Math.atan2(target[1], target[0]) - Math.atan2(source[1], source[0])
  // Only rotate plausible downward/sideways sleeves. An upside-down garment
  // should be corrected with the existing Rotate button, not silently warped.
  if (Math.abs(angle) > Math.PI * 0.65) return null
  const stretch = length > torsoWidth * 0.95 ? clamp(Math.hypot(...target) / length, 0.75, 1.5) : 1
  const ux = source[0] / length, uy = source[1] / length
  const tx = Math.cos(Math.atan2(target[1], target[0])), ty = Math.sin(Math.atan2(target[1], target[0]))
  return (p) => {
    const q = world(p, box)
    const dx = q[0] - pivot[0], dy = q[1] - pivot[1]
    const along = dx * ux + dy * uy, across = -dx * uy + dy * ux
    const rotated = [pivot[0] + along * stretch * tx - across * ty, pivot[1] + along * stretch * ty + across * tx]
    const distance = side === 'left' ? pivot[0] - q[0] : q[0] - pivot[0]
    const t = clamp(distance / (torsoWidth * 0.16), 0, 1)
    const blend = t * t * (3 - 2 * t)
    return [q[0] + (rotated[0] - q[0]) * blend, q[1] + (rotated[1] - q[1]) * blend]
  }
}

// Returns normalized-source triangles and their destination doll coordinates.
// No mesh is generated when there are no reliable sleeve landmarks.
export function sleeveMesh(fit, box, geo) {
  if (!fit?.sleeves || !fit.anchor || !fit.bounds) return null
  const { left, right } = fit.anchor
  const torsoWidth = (right - left) * box.width
  const transforms = Object.fromEntries(['left', 'right'].map((side) => [side,
    sleeveTransform(fit.sleeves[side], side, box, geo, torsoWidth)]))
  if (!transforms.left && !transforms.right) return null
  const xs = [0, left / 2, left, right, (1 + right) / 2, 1]
  // More rows around the sleeve roots keep seam deformation smooth.
  const ys = [...new Set([0, fit.bounds.y, fit.anchor.y, ...Array.from({ length: 9 }, (_, i) => (i + 1) / 10), 1])].sort((a, b) => a - b)
  const destination = (p) => {
    if (p[0] < left && transforms.left) return transforms.left(p)
    if (p[0] > right && transforms.right) return transforms.right(p)
    return world(p, box)
  }
  const triangles = []
  for (let x = 0; x < xs.length - 1; x++) for (let y = 0; y < ys.length - 1; y++) {
    const a = [xs[x], ys[y]], b = [xs[x + 1], ys[y]], c = [xs[x + 1], ys[y + 1]], d = [xs[x], ys[y + 1]]
    for (const source of [[a, b, c], [a, c, d]]) triangles.push({ source, destination: source.map(destination) })
  }
  return triangles
}

// SVG matrix mapping any non-degenerate source triangle to its destination.
export function triangleMatrix(source, destination) {
  const [[x0, y0], [x1, y1], [x2, y2]] = source
  const [[u0, v0], [u1, v1], [u2, v2]] = destination
  const dx1 = x1 - x0, dy1 = y1 - y0, dx2 = x2 - x0, dy2 = y2 - y0
  const det = dx1 * dy2 - dx2 * dy1
  if (Math.abs(det) < 1e-10) return null
  const a = ((u1 - u0) * dy2 - (u2 - u0) * dy1) / det
  const c = (dx1 * (u2 - u0) - dx2 * (u1 - u0)) / det
  const b = ((v1 - v0) * dy2 - (v2 - v0) * dy1) / det
  const d = (dx1 * (v2 - v0) - dx2 * (v1 - v0)) / det
  return [a, b, c, d, u0 - a * x0 - c * y0, v0 - b * x0 - d * y0]
}

// Expand by a true perpendicular distance, rather than moving each corner a
// fixed amount (which leaves hairline gaps along very skinny triangles).
export function expandedTriangle(points, overlap = 0.35) {
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
  const weights = [distance(points[1], points[2]), distance(points[0], points[2]), distance(points[0], points[1])]
  const perimeter = weights.reduce((n, v) => n + v, 0)
  const area2 = Math.abs((points[1][0] - points[0][0]) * (points[2][1] - points[0][1])
    - (points[2][0] - points[0][0]) * (points[1][1] - points[0][1]))
  if (area2 < 1e-6 || perimeter < 1e-6) return points
  const centre = [0, 1].map((axis) => points.reduce((n, p, i) => n + p[axis] * weights[i], 0) / perimeter)
  const scale = 1 + overlap / (area2 / perimeter)
  return points.map((p) => p.map((v, axis) => centre[axis] + (v - centre[axis]) * scale))
}
