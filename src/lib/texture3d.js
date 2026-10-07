import * as THREE from 'three'

// Source rectangles are normalised to the original cutout, never its thumbnail.
export function textureRegions(fit, category) {
  const bounds = fit?.bounds || { x: 0.15, y: 0.05, width: 0.7, height: 0.9 }
  const left = fit?.anchor?.left ?? bounds.x
  const right = fit?.anchor?.right ?? bounds.x + bounds.width
  const width = right - left
  const front = { x: category === 'bottom' ? bounds.x : left, y: bounds.y, width: category === 'bottom' ? bounds.width : width, height: bounds.height * (category === 'bottom' ? 0.27 : 1) }
  const fabric = category === 'bottom'
    ? { x: bounds.x + bounds.width * 0.17, y: bounds.y + bounds.height * 0.36, width: bounds.width * 0.12, height: bounds.height * 0.15 }
    : { x: left + width * 0.18, y: bounds.y + bounds.height * 0.35, width: width * 0.17, height: bounds.height * 0.17 }
  return { front, fabric }
}

// Per-row contour spans let a photographed waistband keep its own shape
// instead of stretching a narrow rectangular waist crop over the hips.
export function silhouetteSpans(data, width, height) {
  const rows = []
  for (let y = 0; y < height; y++) {
    let left = width, right = -1
    for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] >= 96) {
      left = Math.min(left, x); right = x
    }
    rows.push(right > left ? [left / width, (right + 1) / width] : null)
  }
  return rows
}

function canvasMap(bitmap, region, colour, size, rows = null) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')
  context.fillStyle = colour
  context.fillRect(0, 0, size, size)
  if (rows) {
    for (let y = 0; y < size; y++) {
      const sourceY = region.y + (y + 0.5) / size * region.height
      const span = rows[Math.min(rows.length - 1, Math.floor(sourceY * rows.length))]
      if (!span) continue
      context.drawImage(bitmap, span[0] * bitmap.width, sourceY * bitmap.height,
        (span[1] - span[0]) * bitmap.width, Math.max(1, region.height * bitmap.height / size), 0, y, size, 1)
    }
  } else {
    context.drawImage(bitmap, region.x * bitmap.width, region.y * bitmap.height,
      region.width * bitmap.width, region.height * bitmap.height, 0, 0, size, size)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export async function garmentTextures(blob, fit, item) {
  const bitmap = await createImageBitmap(blob)
  try {
    const regions = textureRegions(fit, item.category)
    const colour = /^#[0-9a-f]{6}$/i.test(item.colour?.hex ?? '') ? item.colour.hex : '#736d65'
    let rows = null
    if (item.category === 'bottom') {
      const mask = document.createElement('canvas')
      mask.width = 256
      mask.height = Math.max(1, Math.round(bitmap.height / bitmap.width * 256))
      const context = mask.getContext('2d')
      context.drawImage(bitmap, 0, 0, mask.width, mask.height)
      rows = silhouetteSpans(context.getImageData(0, 0, mask.width, mask.height).data, mask.width, mask.height)
    }
    const front = canvasMap(bitmap, regions.front, colour, 512, rows)
    const fabric = canvasMap(bitmap, regions.fabric, colour, 128)
    fabric.wrapS = fabric.wrapT = THREE.RepeatWrapping
    fabric.repeat.set(2, 3)
    // Reuse the image source and crop away the photographed collar for the
    // shirt template, whose folded collar is now actual geometry.
    const shirtFront = item.category === 'top' ? front.clone() : null
    if (shirtFront) shirtFront.repeat.y = 0.8
    return { front, fabric, shirtFront }
  } finally { bitmap.close() }
}

export function disposeTextures(maps) {
  maps?.front?.dispose()
  maps?.fabric?.dispose()
  maps?.shirtFront?.dispose()
}
