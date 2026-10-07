// Sloping, long sleeves and a cropped torso, like a flat-laid sweater.
export const sweaterPolygons = [
  [[60, 15], [80, 8], [100, 15], [102, 95], [58, 95]],
  [[60, 15], [48, 20], [8, 78], [20, 88], [60, 48]],
  [[100, 15], [112, 20], [152, 78], [140, 88], [100, 48]],
]

export function polygonMask(width = 160, height = 110, polygons = sweaterPolygons) {
  const inside = (x, y, polygon) => {
    let on = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i], [xj, yj] = polygon[j]
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) on = !on
    }
    return on
  }
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (polygons.some((p) => inside(x, y, p))) data[(y * width + x) * 4 + 3] = 255
  }
  return data
}
