// Hand adjustments to how a garment sits on the 2D paper doll.
//
// Stored per item as `dollAdjust`, kept apart from the automatic `fit`
// (which is re-measured every time the item is saved):
//   dx, dy  move, as a share of the garment's own width / height
//   scale   size, around the garment's middle
// Sharing of the garment size means an adjustment still fits after the
// body shape sliders change.

export const NO_ADJUST = { dx: 0, dy: 0, scale: 1 }
const MIN_SCALE = 0.5
const MAX_SCALE = 2
const MAX_SHIFT = 1

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export function cleanAdjust(a) {
  const n = (v, fallback) => (Number.isFinite(v) ? v : fallback)
  return {
    dx: clamp(n(a?.dx, 0), -MAX_SHIFT, MAX_SHIFT),
    dy: clamp(n(a?.dy, 0), -MAX_SHIFT, MAX_SHIFT),
    scale: clamp(n(a?.scale, 1), MIN_SCALE, MAX_SCALE),
  }
}

export function isAdjusted(a) {
  const c = cleanAdjust(a)
  return c.dx !== 0 || c.dy !== 0 || c.scale !== 1
}

// The automatic placement box, with the hand adjustment applied.
export function applyAdjust(box, adjust) {
  const { dx, dy, scale } = cleanAdjust(adjust)
  const width = box.width * scale, height = box.height * scale
  const cx = box.x + box.width / 2 + dx * box.width
  const cy = box.y + box.height / 2 + dy * box.height
  return { x: cx - width / 2, y: cy - height / 2, width, height }
}

// A drag (one finger) or pinch (two fingers), from where the fingers started
// to where they are now, all in doll units. `start` is the adjustment when
// the fingers went down; `base` is the unadjusted box.
export function gestureAdjust(start, base, from, to) {
  start = cleanAdjust(start)
  const now = applyAdjust(base, start)
  const c0 = [now.x + now.width / 2, now.y + now.height / 2]
  let scale = start.scale, centre
  if (from.length >= 2 && to.length >= 2) {
    const dist = (p) => Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1])
    const mid = (p) => [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2]
    const d0 = dist(from)
    scale = clamp(d0 > 0 ? start.scale * dist(to) / d0 : start.scale, MIN_SCALE, MAX_SCALE)
    // Grow around the spot between the fingers, which follows the fingers.
    const k = scale / start.scale, m0 = mid(from), m1 = mid(to)
    centre = [m1[0] + (c0[0] - m0[0]) * k, m1[1] + (c0[1] - m0[1]) * k]
  } else {
    centre = [c0[0] + to[0][0] - from[0][0], c0[1] + to[0][1] - from[0][1]]
  }
  return cleanAdjust({
    dx: (centre[0] - (base.x + base.width / 2)) / base.width,
    dy: (centre[1] - (base.y + base.height / 2)) / base.height,
    scale,
  })
}

// Which garment a tap lands on: the top one that is solid there.
// garments: bottom of the pile first, each { id, box, alphaAt(u, v) → 0–1 }.
export function pickGarment(garments, [x, y]) {
  for (let i = garments.length - 1; i >= 0; i--) {
    const { id, box, alphaAt } = garments[i]
    const u = (x - box.x) / box.width, v = (y - box.y) / box.height
    if (u < 0 || u > 1 || v < 0 || v > 1) continue
    if (alphaAt(u, v) > 0.25) return id
  }
  return null
}
