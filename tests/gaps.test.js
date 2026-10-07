import { describe, it, expect } from 'vitest'
import { clearBackgroundGaps } from '../src/lib/gaps.js'
import { analyseSilhouette } from '../src/lib/fit.js'

const FLOOR = [138, 125, 112]
const DENIM = [61, 90, 136]

// Builds the original photo (garment on the floor) and the cutout the
// background remover returns, where `filled` pixels were wrongly kept.
function photo(width, height, isGarment, isFilled, garmentColour = DENIM) {
  const original = new Uint8ClampedArray(width * height * 4)
  const cutout = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4
    const colour = isGarment(x, y) ? garmentColour : FLOOR
    original.set([...colour, 255], i)
    if (isGarment(x, y) || isFilled(x, y)) cutout.set([...colour, 255], i)
  }
  return { original, cutout }
}

// Jeans: waistband across the top, two legs with a narrow gap below the crotch.
const W = 120, H = 300
const jeansShape = (x, y) => x >= 10 && x < 110 && y >= 10 && y < 290 && !(y > 110 && x >= 56 && x < 64)
const gap = (x, y) => y > 110 && y < 290 && x >= 56 && x < 64

describe('clearBackgroundGaps', () => {
  it('clears floor the background remover left between trouser legs', () => {
    const { original, cutout } = photo(W, H, jeansShape, gap)
    clearBackgroundGaps(cutout, original, W, H)
    expect(cutout[(200 * W + 60) * 4 + 3]).toBe(0)   // in the gap
    expect(cutout[(200 * W + 30) * 4 + 3]).toBe(255) // on a leg
    expect(cutout[(50 * W + 60) * 4 + 3]).toBe(255)  // waistband above the gap
  })

  it('lets the fitting recognise those trousers as long', () => {
    const { original, cutout } = photo(W, H, jeansShape, gap)
    expect(analyseSilhouette(cutout, W, H, 'bottom').longLegs).toBe(false) // as the remover returns it
    clearBackgroundGaps(cutout, original, W, H)
    expect(analyseSilhouette(cutout, W, H, 'bottom').longLegs).toBe(true)
  })

  it('keeps a floor-coloured patch in the middle of a garment (like a logo)', () => {
    const logo = (x, y) => x >= 50 && x < 70 && y >= 100 && y < 120
    const shirt = (x, y) => x >= 10 && x < 110 && y >= 10 && y < 290 && !logo(x, y)
    const { original, cutout } = photo(W, H, shirt, logo)
    clearBackgroundGaps(cutout, original, W, H)
    expect(cutout[(110 * W + 60) * 4 + 3]).toBe(255)
  })

  it('does nothing when the garment is close to the floor colour', () => {
    const { original, cutout } = photo(W, H, jeansShape, gap, [128, 118, 104])
    const before = cutout.slice()
    clearBackgroundGaps(cutout, original, W, H)
    let changed = 0
    for (let i = 0; i < before.length; i++) if (cutout[i] !== before[i]) changed++
    expect(changed).toBe(0)
  })
})
