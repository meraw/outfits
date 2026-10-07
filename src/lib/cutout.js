// Photo → shrunk original, background-free cutout, small thumbnail, colour.
import { trimBounds } from './trim.js'
import { dominantColour, nameColour } from './colour.js'

const MAX_SIDE = 1600
const THUMB_SIDE = 360

export async function processPhoto(file, onStatus = () => {}) {
  onStatus('Preparing photo…')
  const original = await shrink(file, MAX_SIDE, 'image/jpeg', 0.9)

  let cutout = null
  try {
    const raw = await removeBackground(original, onStatus)
    cutout = await trim(raw)
  } catch (err) {
    console.error('Background removal failed', err)
  }

  onStatus('Finishing up…')
  const picture = cutout ?? original
  const thumb = await shrink(picture, THUMB_SIDE, 'image/webp', 0.85)
  const found = await colourOf(picture)
  const colour = found ? { hex: found.hex, name: nameColour(found.hex), auto: true } : null

  return { images: { original, cutout: picture, thumb }, colour, removed: !!cutout }
}

async function removeBackground(blob, onStatus) {
  onStatus('Removing background…')
  // Loaded only when needed: it's big, and the wardrobe screen doesn't need it.
  const { removeBackground } = await import('@imgly/background-removal')
  return removeBackground(blob, {
    model: 'isnet_fp16',
    output: { format: 'image/png' },
    progress(key, current, total) {
      if (key.startsWith('fetch') && total > 0) {
        const pct = Math.round((current / total) * 100)
        onStatus(`First time only: downloading the background remover… ${pct}%`)
      } else if (key.startsWith('compute')) {
        onStatus('Removing background…')
      }
    },
  })
}

async function load(blob) {
  return createImageBitmap(blob, { imageOrientation: 'from-image' })
}

function canvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

const toBlob = (c, type, quality) => new Promise((ok) => c.toBlob(ok, type, quality))

async function shrink(blob, maxSide, type, quality) {
  const img = await load(blob)
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  const c = canvas(Math.round(img.width * scale), Math.round(img.height * scale))
  const ctx = c.getContext('2d')
  if (type === 'image/jpeg') {
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
  }
  ctx.drawImage(img, 0, 0, c.width, c.height)
  img.close()
  return toBlob(c, type, quality)
}

// Crops away the empty space around the item, leaving a small margin.
async function trim(blob) {
  const img = await load(blob)
  const c = canvas(img.width, img.height)
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  img.close()
  const box = trimBounds(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height)
  if (!box) throw new Error('Nothing left after removing the background')
  const pad = Math.round(Math.max(box.w, box.h) * 0.02)
  const x = Math.max(0, box.x - pad), y = Math.max(0, box.y - pad)
  const w = Math.min(c.width - x, box.w + pad * 2), h = Math.min(c.height - y, box.h + pad * 2)
  const out = canvas(w, h)
  out.getContext('2d').drawImage(c, x, y, w, h, 0, 0, w, h)
  return toBlob(out, 'image/png')
}

async function colourOf(blob) {
  const img = await load(blob)
  const scale = Math.min(1, 200 / Math.max(img.width, img.height))
  const c = canvas(Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)))
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, c.width, c.height)
  img.close()
  return dominantColour(ctx.getImageData(0, 0, c.width, c.height).data)
}
