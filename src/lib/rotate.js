// Turns an image's pixels a quarter turn clockwise.
// A w×h image becomes h×w.
export function rotatePixels(rgba, w, h) {
  const out = new Uint8ClampedArray(rgba.length)
  const u32in = new Uint32Array(rgba.buffer, rgba.byteOffset, w * h)
  const u32out = new Uint32Array(out.buffer)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // pixel (x, y) moves to column (h - 1 - y), row x
      u32out[x * h + (h - 1 - y)] = u32in[y * w + x]
    }
  }
  return out
}
