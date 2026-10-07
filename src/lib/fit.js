// Local, approximate fitting for upright, flat-laid garment cutouts.
// Coordinates are fractions of the image, including its transparent padding.
export const FIT_VERSION = 2
const CATEGORIES = ['top', 'outerwear', 'dress', 'bottom']
const median = (values) => {
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

export function validFit(fit, category) {
  if (!fit || fit.version !== FIT_VERSION || fit.category !== category || !CATEGORIES.includes(category)) return false
  const { bounds: b, anchor: a } = fit
  return !!b && !!a && [b.x, b.y, b.width, b.height, a.left, a.right, a.y].every(Number.isFinite)
    && b.x >= 0 && b.y >= 0 && b.width > 0 && b.height > 0
    && b.x + b.width <= 1.001 && b.y + b.height <= 1.001
    && a.left >= b.x && a.right <= b.x + b.width && a.right - a.left >= b.width * 0.15
    && a.y >= b.y && a.y <= b.y + b.height
}

// Kept independent of Canvas so the geometry can be tested with synthetic masks.
export function analyseSilhouette(data, width, height, category) {
  if (!CATEGORIES.includes(category) || width < 8 || height < 8 || data.length !== width * height * 4) return null
  const rows = []
  let minX = width, maxX = -1, minY = height, maxY = -1, opaque = 0
  for (let y = 0; y < height; y++) {
    const runs = []
    let start = -1
    for (let x = 0; x <= width; x++) {
      const on = x < width && data[(y * width + x) * 4 + 3] >= 96
      if (on) { opaque++; if (start < 0) start = x }
      else if (start >= 0) {
        // Ignore isolated mask specks, but keep narrow straps and pant legs.
        if (x - start >= Math.max(2, width * 0.01)) runs.push([start, x])
        start = -1
      }
    }
    if (runs.length) {
      const left = runs[0][0], right = runs.at(-1)[1]
      minX = Math.min(minX, left); maxX = Math.max(maxX, right)
      minY = Math.min(minY, y); maxY = y + 1
      rows[y] = runs
    }
  }
  // An opaque original photo (background removal failed) has no silhouette.
  if (maxX <= minX || maxY <= minY || opaque / (width * height) > 0.97) return null
  const w = maxX - minX, h = maxY - minY, centre = (minX + maxX) / 2
  const bottom = category === 'bottom'
  const [from, to] = bottom ? [0.02, 0.14] : category === 'dress' ? [0.23, 0.42] : [0.45, 0.72]
  const spans = []
  for (let y = Math.ceil(minY + h * from); y < minY + h * to; y++) {
    const runs = rows[y]
    if (!runs) continue
    // Sleeves can hang beside the torso: use the central connected run.
    // Waistbands may have small alpha holes, so use their whole row span.
    const run = bottom ? [runs[0][0], runs.at(-1)[1]]
      : runs.find(([left, right]) => left <= centre && right >= centre)
    if (run && run[1] - run[0] >= w * 0.15) spans.push(run)
  }
  if (spans.length < Math.max(3, h * (to - from) * 0.4)) return null
  const left = median(spans.map((r) => r[0])), right = median(spans.map((r) => r[1]))
  let splitRows = 0
  if (bottom) for (let y = Math.ceil(minY + h * 0.55); y < minY + h * 0.95; y++) {
    const runs = rows[y]
    if (runs?.some((r) => r[1] < centre) && runs.some((r) => r[0] > centre)) {
      splitRows++
    }
  }
  const fit = {
    version: FIT_VERSION, category,
    dividedLegs: bottom && splitRows >= h * 0.08,
    longLegs: bottom && splitRows >= h * 0.08 && h / (right - left) > 1.65,
    bounds: { x: minX / width, y: minY / height, width: w / width, height: h / height },
    // Horizontal span sets scale; the upper anchor sets where it hangs.
    anchor: { left: left / width, right: right / width, y: (minY + h * (bottom ? 0.04 : 0.12)) / height },
  }
  if (category === 'top' || category === 'outerwear') {
    fit.sleeves = {}
    for (const side of ['left', 'right']) {
      const edge = side === 'left' ? left : right
      const pivot = [edge, minY + h * 0.12]
      const points = []
      for (let y = minY; y < maxY; y++) for (const [l, r] of rows[y] ?? []) {
        for (let x = l; x < r; x++) {
          if (side === 'left' ? x < edge - (right - left) * 0.08 : x > edge + (right - left) * 0.08) {
            points.push([x, y, Math.hypot(x - pivot[0], y - pivot[1])])
          }
        }
      }
      const reach = side === 'left' ? edge - minX : maxX - edge
      if (reach < (right - left) * 0.2 || points.length < w * h * 0.015) continue
      if (points.filter((p) => p[1] < minY + h * 0.35).length < w * h * 0.003) continue
      const longest = points.reduce((n, p) => Math.max(n, p[2]), 0)
      const tip = points.filter((p) => p[2] >= longest * 0.9)
      const cuff = [tip.reduce((n, p) => n + p[0], 0) / tip.length, tip.reduce((n, p) => n + p[1], 0) / tip.length]
      // Lower flared hems and near-vertical side panels are not sleeves.
      if (Math.abs(cuff[0] - edge) < (right - left) * 0.2) continue
      fit.sleeves[side] = { pivot: [pivot[0] / width, pivot[1] / height], cuff: [cuff[0] / width, cuff[1] / height] }
    }
  }
  return validFit(fit, category) ? fit : null
}

export async function fitFromBlob(blob, category) {
  if (!blob || !CATEGORIES.includes(category)) return null
  let bitmap
  try {
    bitmap = await createImageBitmap(blob)
    // Small masks are enough for fitting; cap phone CPU and memory use.
    const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return analyseSilhouette(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, category)
  } catch (err) {
    console.warn('Garment fitting unavailable; using default placement', err)
    return null
  } finally {
    bitmap?.close()
  }
}
