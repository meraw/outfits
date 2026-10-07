import * as THREE from 'three'

// Source rectangles are normalised to the original cutout, never its thumbnail.
export function textureRegions(fit, category) {
  const bounds = fit?.bounds || { x: 0.15, y: 0.05, width: 0.7, height: 0.9 }
  const left = fit?.anchor?.left ?? bounds.x
  const right = fit?.anchor?.right ?? bounds.x + bounds.width
  const width = right - left
  const front = { x: left, y: bounds.y, width, height: bounds.height * (category === 'bottom' ? 0.27 : 1) }
  const fabric = category === 'bottom'
    ? { x: bounds.x + bounds.width * 0.17, y: bounds.y + bounds.height * 0.36, width: bounds.width * 0.12, height: bounds.height * 0.15 }
    : { x: left + width * 0.18, y: bounds.y + bounds.height * 0.35, width: width * 0.17, height: bounds.height * 0.17 }
  return { front, fabric }
}

function canvasMap(bitmap, region, colour, size) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')
  context.fillStyle = colour
  context.fillRect(0, 0, size, size)
  context.drawImage(bitmap, region.x * bitmap.width, region.y * bitmap.height,
    region.width * bitmap.width, region.height * bitmap.height, 0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export async function garmentTextures(blob, fit, item) {
  const bitmap = await createImageBitmap(blob)
  try {
    const regions = textureRegions(fit, item.category)
    const colour = /^#[0-9a-f]{6}$/i.test(item.colour?.hex ?? '') ? item.colour.hex : '#736d65'
    const front = canvasMap(bitmap, regions.front, colour, 512)
    const fabric = canvasMap(bitmap, regions.fabric, colour, 128)
    fabric.wrapS = fabric.wrapT = THREE.RepeatWrapping
    fabric.repeat.set(2, 3)
    return { front, fabric }
  } finally { bitmap.close() }
}

export function disposeTextures(maps) {
  maps?.front?.dispose()
  maps?.fabric?.dispose()
}
