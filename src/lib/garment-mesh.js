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
  const extent = length * clamp(Number.isFinite(sleeve.extentRatio) ? sleeve.extentRatio : 1, 1, 1.2)
  const angle = Math.atan2(target[1], target[0]) - Math.atan2(source[1], source[0])
  // Only rotate plausible downward/sideways sleeves. An upside-down garment
  // should be corrected with the existing Rotate button, not silently warped.
  if (Math.abs(angle) > Math.PI * 0.65) return null
  const elbow = geo.landmarks[side + 'Elbow']
  const control = [2 * elbow[0] - (pivot[0] + wrist[0]) / 2, 2 * elbow[1] - (pivot[1] + wrist[1]) / 2]
  const armLength = Math.hypot(elbow[0] - pivot[0], elbow[1] - pivot[1]) + Math.hypot(wrist[0] - elbow[0], wrist[1] - elbow[1])
  // Short sleeves keep their extent; a plausible long sleeve reaches the wrist.
  const fraction = sleeve.fullLength === true ? Math.min(1, extent * 2.25 / armLength) : Math.min(1, extent / armLength)
  const ux = source[0] / length, uy = source[1] / length
  const centreAt = (t) => {
    if (t < 0 || t > 1) {
      const atEnd = t > 1, base = atEnd ? wrist : pivot
      const tangent = atEnd ? [wrist[0] - control[0], wrist[1] - control[1]] : [control[0] - pivot[0], control[1] - pivot[1]]
      return { centre: base.map((v, axis) => v + (atEnd ? t - 1 : t) * tangent[axis] * 2), tangent }
    }
    return {
      centre: [0, 1].map((axis) => (1 - t) ** 2 * pivot[axis] + 2 * (1 - t) * t * control[axis] + t ** 2 * wrist[axis]),
      tangent: [0, 1].map((axis) => 2 * (1 - t) * (control[axis] - pivot[axis]) + 2 * t * (wrist[axis] - control[axis])),
    }
  }
  return (p) => {
    const q = world(p, box)
    const dx = q[0] - pivot[0], dy = q[1] - pivot[1]
    const along = dx * ux + dy * uy, across = -dx * uy + dy * ux
    const { centre, tangent } = centreAt(along / extent * fraction)
    const tangentLength = Math.hypot(...tangent) || 1
    // Transport the cross-section on a unit normal: bending never scales
    // sleeve width. Only its centreline length changes for long sleeves.
    const rotated = [centre[0] - across * tangent[1] / tangentLength, centre[1] + across * tangent[0] / tangentLength]
    const distance = side === 'left' ? pivot[0] - q[0] : q[0] - pivot[0]
    const t = clamp(distance / (torsoWidth * 0.05), 0, 1)
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
  const seam = (right - left) * 0.05
  const xs = [0, left / 2, Math.max(left / 2, left - seam), left, right, Math.min((1 + right) / 2, right + seam), (1 + right) / 2, 1]
  // More rows around the sleeve roots keep seam deformation smooth.
  const details = Object.values(fit.sleeves).flatMap((s) => [s.pivot?.[1], s.cuff?.[1], s.attachment?.top?.[1], s.attachment?.bottom?.[1]]).filter((v) => Number.isFinite(v) && v > 0 && v < 1)
  const ys = [...new Set([0, fit.bounds.y, fit.anchor.y, ...details, ...Array.from({ length: 9 }, (_, i) => (i + 1) / 10), 1])].sort((a, b) => a - b)
  const destination = (p) => {
    if (p[0] < left && transforms.left) return transforms.left(p)
    if (p[0] > right && transforms.right) return transforms.right(p)
    return world(p, box)
  }
  const triangles = []
  for (let x = 0; x < xs.length - 1; x++) {
    const rows = xs[x] === left && xs[x + 1] === right ? [0, 1] : ys
    for (let y = 0; y < rows.length - 1; y++) {
      const a = [xs[x], rows[y]], b = [xs[x + 1], rows[y]], c = [xs[x + 1], rows[y + 1]], d = [xs[x], rows[y + 1]]
      for (const source of [[a, b, c], [a, c, d]]) triangles.push({ source, destination: source.map(destination) })
    }
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

// A bevelled clip expansion closes triangle seams without huge miter spikes
// when attachment landmarks produce very thin mesh triangles.
export function expandedTriangle(points, overlap = 0.35) {
  const area2 = (points[1][0] - points[0][0]) * (points[2][1] - points[0][1])
    - (points[2][0] - points[0][0]) * (points[1][1] - points[0][1])
  if (Math.abs(area2) < 1e-6) return points
  const sign = Math.sign(area2)
  const normal = (a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy)
    return [sign * dy / length, -sign * dx / length]
  }
  return points.flatMap((p, i) => {
    const previous = normal(points[(i + 2) % 3], p), next = normal(p, points[(i + 1) % 3])
    return [previous, next].map((n) => p.map((v, axis) => v + n[axis] * overlap))
  })
}
