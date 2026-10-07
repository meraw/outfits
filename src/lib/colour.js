// Dominant colour of a cutout, and a plain name for it.

// Groups visible pixels into coarse buckets (8 levels per channel), picks the
// fullest bucket and averages the real pixels inside it.
export function dominantColour(rgba) {
  const buckets = new Map()
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2]
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5)
    let s = buckets.get(key)
    if (!s) buckets.set(key, (s = { n: 0, r: 0, g: 0, b: 0 }))
    s.n++; s.r += r; s.g += g; s.b += b
  }
  let best = null
  for (const s of buckets.values()) if (!best || s.n > best.n) best = s
  if (!best) return null
  return { hex: toHex(best.r / best.n, best.g / best.n, best.b / best.n) }
}

// Reference shades for each name. The closest one (by how the eye sees
// difference, not raw numbers) wins.
const PALETTE = {
  black: '#1a1a1a',
  white: '#f5f5f2',
  grey: '#9e9e9e',
  beige: '#cdb894',
  brown: '#7a4b2a',
  red: '#c0232f',
  burgundy: '#74202f',
  pink: '#f0a3bd',
  orange: '#e57a2c',
  yellow: '#edc932',
  olive: '#707035',
  green: '#3a8a40',
  'light blue': '#9dc0e3',
  blue: '#3366b0',
  navy: '#22305a',
  purple: '#70409a',
}
export const COLOUR_NAMES = Object.keys(PALETTE)

const paletteLab = Object.entries(PALETTE).map(([name, hex]) => [name, hexToLab(hex)])

export function nameColour(hex) {
  const [L, a, b] = hexToLab(hex)
  let best = null, bestD = Infinity
  for (const [name, [L2, a2, b2]] of paletteLab) {
    // Lightness counts a bit less, so shadows in a photo don't change the name.
    const d = (0.75 * (L - L2)) ** 2 + (a - a2) ** 2 + (b - b2) ** 2
    if (d < bestD) { bestD = d; best = name }
  }
  return best
}

function toHex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

function hexToLab(hex) {
  const n = parseInt(hex.slice(1), 16)
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const r = lin(n >> 16), g = lin((n >> 8) & 255), b = lin(n & 255)
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}
