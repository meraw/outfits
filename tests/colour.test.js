import { describe, it, expect } from 'vitest'
import { dominantColour, nameColour, COLOUR_NAMES } from '../src/lib/colour.js'

// Builds RGBA pixel data from a list of [r, g, b, a, count] runs.
function pixels(runs) {
  const out = []
  for (const [r, g, b, a, n] of runs) for (let i = 0; i < n; i++) out.push(r, g, b, a)
  return new Uint8ClampedArray(out)
}

describe('dominantColour', () => {
  it('finds the colour that covers most of the item', () => {
    const data = pixels([[200, 30, 40, 255, 70], [250, 250, 250, 255, 30]])
    expect(dominantColour(data).hex).toBe('#c81e28')
  })

  it('ignores transparent background pixels', () => {
    const data = pixels([[0, 0, 0, 0, 900], [30, 40, 80, 255, 100]])
    expect(dominantColour(data).hex).toBe('#1e2850')
  })

  it('averages slightly different shades of the same colour', () => {
    const data = pixels([[100, 150, 200, 255, 50], [104, 154, 204, 255, 50], [0, 0, 0, 255, 20]])
    expect(dominantColour(data).hex).toBe('#6698ca')
  })

  it('returns null when there is nothing visible', () => {
    expect(dominantColour(pixels([[10, 10, 10, 0, 50]]))).toBeNull()
  })
})

describe('nameColour', () => {
  const cases = {
    '#111111': 'black',
    '#fafafa': 'white',
    '#8a8a8a': 'grey',
    '#c62828': 'red',
    '#1f2a4d': 'navy',
    '#2b5fb8': 'blue',
    '#a8c8ea': 'light blue',
    '#2e7d32': 'green',
    '#6b6b2f': 'olive',
    '#d8c3a0': 'beige',
    '#6b4226': 'brown',
    '#f4a6c0': 'pink',
    '#6d1a2a': 'burgundy',
    '#f2d03b': 'yellow',
    '#e8772e': 'orange',
    '#6a3d9a': 'purple',
    // Added after the owner's orange item didn't find a good match.
    '#36393f': 'charcoal',
    '#f4ebd3': 'cream',
    '#c09060': 'camel',
    '#b04a25': 'rust',
    '#f4806c': 'coral',
    '#e0338a': 'hot pink',
    '#f8c8a4': 'peach',
    '#ff8c1a': 'orange',
    '#d6a62a': 'mustard',
    '#a89c6a': 'khaki',
    '#9caf88': 'sage',
    '#a8e0c4': 'mint',
    '#1e4a2c': 'forest green',
    '#1b7676': 'teal',
    '#3cc8c4': 'turquoise',
    '#c8a2d0': 'lilac',
  }
  for (const [hex, name] of Object.entries(cases)) {
    it(`${hex} is ${name}`, () => expect(nameColour(hex)).toBe(name))
  }
})

describe('colour list', () => {
  it('offers the colours grouped by family', () => {
    expect(COLOUR_NAMES).toEqual([
      'black', 'charcoal', 'grey', 'white', 'cream', 'beige', 'camel', 'brown',
      'red', 'burgundy', 'rust', 'coral', 'pink', 'hot pink', 'peach',
      'orange', 'mustard', 'yellow',
      'khaki', 'olive', 'sage', 'mint', 'green', 'forest green', 'teal',
      'turquoise', 'light blue', 'blue', 'navy',
      'lilac', 'purple',
    ])
  })
})
