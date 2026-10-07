// Draws the app icon (a white T-shirt on terracotta) as PNG files in public/.
// Run with: npm run icons
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

// T-shirt outline in a 0–1 box, kept inside the middle so Android's round
// icon mask never clips it.
const SHIRT = [
  [0.36, 0.26], [0.44, 0.26], [0.47, 0.30], [0.53, 0.30], [0.56, 0.26], [0.64, 0.26],
  [0.78, 0.36], [0.72, 0.46], [0.66, 0.42], [0.66, 0.74], [0.34, 0.74], [0.34, 0.42],
  [0.28, 0.46], [0.22, 0.36],
]
const BG = [181, 101, 74], FG = [250, 246, 240]

function inside(x, y) {
  let hit = false
  for (let i = 0, j = SHIRT.length - 1; i < SHIRT.length; j = i++) {
    const [xi, yi] = SHIRT[i], [xj, yj] = SHIRT[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

function icon(size) {
  const rows = []
  const S = 4 // 4×4 samples per pixel for smooth edges
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 3) // first byte: PNG row filter (none)
    for (let px = 0; px < size; px++) {
      let n = 0
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++)
          if (inside((px + (sx + 0.5) / S) / size, (py + (sy + 0.5) / S) / size)) n++
      const t = n / (S * S)
      for (let c = 0; c < 3; c++) row[1 + px * 3 + c] = Math.round(BG[c] + (FG[c] - BG[c]) * t)
    }
    rows.push(row)
  }
  return png(size, size, Buffer.concat(rows))
}

function png(w, h, raw) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(w, 0)
  header.writeUInt32BE(h, 4)
  header.set([8, 2, 0, 0, 0], 8) // 8-bit RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function crc32(buf) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

for (const size of [192, 512]) writeFileSync(`public/icon-${size}.png`, icon(size))
console.log('Icons written to public/')
