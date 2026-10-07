// The paper doll: body shape, where clothes go on it, and what can be worn
// together. Everything is in "doll units": a 400 × 860 drawing starting
// just above the head (y = 30), with room for the longest legs.
import { validFit } from './fit.js'

export const DOLL_WIDTH = 400
export const DOLL_TOP = 30
export const DOLL_HEIGHT = 860
const CX = DOLL_WIDTH / 2

export const SHAPE_SLIDERS = [
  ['shoulders', 'Shoulders'],
  ['bust', 'Bust'],
  ['waist', 'Waist'],
  ['hips', 'Hips'],
  ['torso', 'Torso length'],
  ['legs', 'Leg length'],
]
export const SHAPE_MIN = 0.8
export const SHAPE_MAX = 1.25
export const DEFAULT_SHAPE = { shoulders: 1, bust: 1, waist: 1, hips: 1, torso: 1, legs: 1 }

const clamp = (v) => Math.min(SHAPE_MAX, Math.max(SHAPE_MIN, Number(v) || 1))

export function dollGeometry(shape = DEFAULT_SHAPE) {
  const s = Object.fromEntries(Object.keys(DEFAULT_SHAPE).map((k) => [k, clamp(shape[k] ?? 1)]))
  // Relative front-view proportions, adjustable once for the person's body.
  // These drawing units are not a calibrated physical garment measurement.
  const sh = 72 * s.shoulders
  const bust = 64 * s.bust
  const waist = 50 * s.waist
  const hip = 76 * s.hips
  const bodyY = (y) => 192 + (y - 192) * s.torso
  const legStart = bodyY(488) - 18
  const kneeY = legStart + 150 * s.legs
  const ankleY = legStart + 300 * s.legs
  const floorY = ankleY + 24
  const legX = hip * 0.42 // centre of each leg at the knee
  const footX = hip * 0.36

  // Right half of the body, top to bottom and back up the inside leg.
  // The left half is the mirror image.
  const right = [
    [14, 140], [16, 168], [sh * 0.62, 180], [sh, 196],
    [bust * 0.95, 238], [bust, 268], [bust * 0.9, 298],
    [waist, 340], [hip * 0.93, 388], [hip, 428],
    [hip * 0.86, 505], [legX + 24, kneeY], [legX + 23, kneeY + 65 * s.legs],
    [footX + 10, ankleY], [footX + 18, floorY - 6], [footX + 6, floorY],
    [footX - 14, floorY - 2], [footX - 10, ankleY], [legX - 17, kneeY],
    [9, 520],
  ]
  // Torso proportion changes the body above the legs; leg length stays independent.
  for (const i of [4, 5, 6, 7, 8, 9, 10, 19]) right[i][1] = bodyY(right[i][1])
  // Half the body width down the outside, neck to ankle: [y, half width].
  const profile = right.slice(0, 14).map(([x, y]) => [y, x])
  const points = [...right, [0, bodyY(488)], ...right.slice().reverse().map(([x, y]) => [-x, y])]
    .map(([x, y]) => [CX + x, y])

  // Arms hang slightly out from the body, so flat-laid sleeves line up.
  const arm = (side) => {
    const x = (dx) => CX + side * dx
    return `M${x(sh - 12)} 202 Q${x(sh + 18)} 330 ${x(sh + 32)} 450`
  }

  return {
    centre: CX,
    shape: s,
    head: { cx: CX, cy: 92, rx: 38, ry: 50 },
    outline: smoothClosedPath(points),
    arms: [arm(1), arm(-1)],
    hands: [[CX + sh + 34, 462], [CX - sh - 34, 462]],
    shoulders: { y: 192, half: sh },
    bust: { y: bodyY(268), half: bust },
    waist: { y: bodyY(340), half: waist },
    hips: { y: bodyY(428), half: hip },
    crotch: { y: bodyY(488) },
    ankles: { y: ankleY },
    profile,
    feet: { y: floorY, half: footX },
    landmarks: {
      leftShoulder: [CX - sh, 192], rightShoulder: [CX + sh, 192],
      leftWaist: [CX - waist, bodyY(340)], rightWaist: [CX + waist, bodyY(340)],
      leftHip: [CX - hip, bodyY(428)], rightHip: [CX + hip, bodyY(428)],
      leftWrist: [CX - sh - 32, 450], rightWrist: [CX + sh + 32, 450],
      leftElbow: [CX - sh - 14, 328], rightElbow: [CX + sh + 14, 328],
      leftKnee: [CX - legX, kneeY], rightKnee: [CX + legX, kneeY],
      leftAnkle: [CX - footX, ankleY], rightAnkle: [CX + footX, ankleY],
    },
  }
}

// Where an item's picture goes on the doll before any hand adjustment.
// aspect = picture width ÷ height. Returns a box in doll units.
// Shoes are usually photographed from above, which looks wrong on a doll
// seen from the front: squash them to about this share of their height.
// Boots photographed lying on their side (shoeView 'side') stay as they are.
const SHOE_SQUASH = 0.38

export function placeItem(category, aspect, geo, fit = null, hemLength = 'auto', shoeView = 'above') {
  aspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  if (validFit(fit, category)) return placeFittedItem(category, aspect, geo, fit, hemLength)
  let width, top
  switch (category) {
    case 'outerwear':
      width = geo.shoulders.half * 2 * 1.75
      top = geo.shoulders.y - 26
      break
    case 'top':
      width = geo.shoulders.half * 2 * 1.6
      top = geo.shoulders.y - 22
      break
    case 'dress':
      width = geo.shoulders.half * 2 * 1.3
      top = geo.shoulders.y - 22
      break
    case 'bottom': {
      top = geo.waist.y - 8
      const hips = geo.hips.half * 2
      if (aspect < 0.6) {
        // Long trousers: size them to reach the ankles, within reason.
        const height = geo.ankles.y + 10 - top
        width = Math.min(hips * 1.6, Math.max(hips * 1.05, height * aspect))
      } else {
        width = hips * 1.25 // shorts and skirts
      }
      break
    }
    case 'shoes': {
      width = (geo.feet.half * 2 + 44) * 1.3
      const height = width / aspect * (shoeView === 'side' ? 1 : SHOE_SQUASH)
      return { x: geo.centre - width / 2, y: geo.feet.y + 6 - height, width, height }
    }
    default: { // accessory: hangs by the hip
      width = geo.hips.half * 1.1
      const height = width / aspect
      return { x: geo.centre + geo.hips.half + 10, y: geo.hips.y - height / 2, width, height }
    }
  }
  return { x: geo.centre - width / 2, y: top, width, height: width / aspect }
}

function placeFittedItem(category, aspect, geo, fit, hemLength) {
  const { anchor, bounds } = fit
  const bottom = category === 'bottom'
  // A rigid picture cannot match bust, waist and hips independently. Fit its
  // torso span to the shoulders/bust, or waistband to the upper pelvis.
  const targetSpan = bottom ? Math.max(geo.waist.half * 2 * 1.08, geo.hips.half * 2 * 0.88)
    : Math.max(geo.shoulders.half * 2 * 1.02, geo.bust.half * 2 * 1.08) * (category === 'outerwear' ? 1.12 : 1)
  const width = targetSpan / (anchor.right - anchor.left)
  const targetY = bottom ? geo.waist.y - 8 : geo.shoulders.y
  let height = width / aspect
  const hemTargets = {
    short: geo.hips.y + 65,
    knee: geo.landmarks.leftKnee[1],
    calf: (geo.landmarks.leftKnee[1] + geo.ankles.y) / 2,
    ankle: geo.ankles.y + 2,
    floor: geo.feet.y - 2,
  }
  const requestedHem = Object.hasOwn(hemTargets, hemLength) ? hemTargets[hemLength] : null
  const hemY = requestedHem ?? (bottom && fit.longLegs === true ? hemTargets.floor : null)
  if (bottom && hemY != null) {
    // Waist width cannot also determine trouser length, especially for wide
    // legs. Fit those axes separately; an explicit hem choice handles crops.
    height = (hemY - targetY) / (bounds.y + bounds.height - anchor.y)
  }
  return {
    x: geo.centre - (anchor.left + anchor.right) / 2 * width,
    y: targetY - anchor.y * height,
    width, height,
  }
}

// Which "place" on the body an item takes. Two items can't share a place.
export function slotOf(item) {
  if (item.category === 'top') return `top-${item.layer || 'base'}`
  return item.category
}

// Bottom of the pile first, so later items are drawn on top.
export const DRAW_ORDER = ['shoes', 'bottom', 'dress', 'top-base', 'top-mid', 'top-outer', 'outerwear', 'accessory']

// Tapping an item: takes it off if worn, otherwise puts it on and removes
// whatever it replaces.
export function wearItem(outfit, item) {
  if (outfit.some((i) => i.id === item.id)) return outfit.filter((i) => i.id !== item.id)
  const slot = slotOf(item)
  const clashes = new Set([slot])
  if (slot === 'dress') { clashes.add('bottom'); clashes.add('top-base') }
  if (slot === 'bottom' || slot === 'top-base') clashes.add('dress')
  return [...outfit.filter((i) => !clashes.has(slotOf(i))), item]
}

export function sortForDrawing(outfit) {
  const rank = (i) => { const r = DRAW_ORDER.indexOf(slotOf(i)); return r < 0 ? DRAW_ORDER.length : r }
  return outfit.slice().sort((a, b) => rank(a) - rank(b))
}

// Smooth closed curve through points (Catmull-Rom turned into curves).
function smoothClosedPath(pts) {
  const n = pts.length
  const f = (v) => v.toFixed(1)
  let d = `M${f(pts[0][0])} ${f(pts[0][1])} `
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])} `
  }
  return d + 'Z'
}
