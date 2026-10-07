// Tucking a top into the trousers or skirt on the 2D doll.
//
// Saved per item as `dollTucked`. A tucked top is drawn underneath the
// bottom and cut off just inside its waistband, so its lower part (sides
// included) disappears into the bottom. Layers worn over it, like a jumper,
// stay on top. With no bottom worn, a tucked top simply looks normal.
import { sortForDrawing } from './doll.js'

const INSIDE_WAISTBAND = 8 // doll units below the top of the waistband

export function canTuck(item) {
  return item?.category === 'top'
}

// What to draw, bottom of the pile first: [{ item, tuckedInto? }].
export function drawingPlan(outfit) {
  const sorted = sortForDrawing(outfit)
  const bottom = sorted.find((i) => i.category === 'bottom')
  if (!bottom) return sorted.map((item) => ({ item }))
  const tucked = sorted.filter((i) => canTuck(i) && i.dollTucked)
  const rest = sorted.filter((i) => !tucked.includes(i))
  const at = rest.indexOf(bottom)
  return [
    ...rest.slice(0, at).map((item) => ({ item })),
    ...tucked.map((item) => ({ item, tuckedInto: bottom.id })),
    ...rest.slice(at).map((item) => ({ item })),
  ]
}

// Where a tucked top is cut off: just inside the bottom's waistband.
// box is where the bottom is placed on the doll (before any leg bending).
export function tuckLine(box, fit) {
  const waistband = Number.isFinite(fit?.anchor?.y) ? fit.anchor.y : 0.04
  return box.y + waistband * box.height + INSIDE_WAISTBAND
}
