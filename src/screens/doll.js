// The paper doll: reshape the body and dress it by tapping clothes.
import { h, svg, blobUrl } from '../ui.js'
import { listItems, getImages, getSetting, setSetting } from '../db.js'
import {
  DOLL_WIDTH, DOLL_TOP, DOLL_HEIGHT, SHAPE_SLIDERS, SHAPE_MIN, SHAPE_MAX, DEFAULT_SHAPE,
  dollGeometry, placeItem, wearItem, sortForDrawing,
} from '../lib/doll.js'
import { CATEGORY_LABELS } from './item-form.js'
import { fitFromBlob, validFit } from '../lib/fit.js'
import { sleeveMesh } from '../lib/garment-mesh.js'
import { warpTriangles } from '../lib/warp.js'

const OUTFIT_KEY = 'dollOutfit' // ids of what the doll is wearing
const BENT_CACHE_SIZE = 24 // bent garment pictures kept per visit

export async function dollScreen(root) {
  const items = await listItems()
  let shape = { ...DEFAULT_SHAPE, ...(await getSetting('dollShape', DEFAULT_SHAPE)) }
  let outfit = loadOutfit().map((id) => items.find((i) => i.id === id)).filter(Boolean)
  const pictures = new Map() // id → { url, aspect, fit }; also deduplicates in-flight reads
  const bent = new Map() // cache key → Promise<{ url, box }>: garments with bent sleeves
  const thumbs = new Map() // id → thumbnail url

  // The drawing
  const body = svg('g', { class: 'doll-body' })
  const clothes = svg('g')
  const stage = svg('svg', {
    class: 'doll-svg', viewBox: `0 ${DOLL_TOP} ${DOLL_WIDTH} ${DOLL_HEIGHT}`,
    preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': 'Paper doll',
  }, body, clothes)

  function drawBody(geo) {
    body.replaceChildren(
      ...geo.arms.map((d) => svg('path', { d, class: 'doll-arm' })),
      ...geo.hands.map(([cx, cy]) => svg('circle', { cx, cy, r: 13 })),
      svg('path', { d: geo.outline }),
      svg('ellipse', geo.head),
    )
  }

  let drawVersion = 0
  async function drawClothes(geo, quality) {
    const version = ++drawVersion
    const drawn = sortForDrawing(outfit)
    const loaded = await Promise.all(drawn.map(picture))
    if (version !== drawVersion) return
    const scale = pixelsPerUnit(quality)
    const pieces = await Promise.all(drawn.map(async (item, index) => {
      const pic = loaded[index]
      if (!pic) return null
      const box = placeItem(item.category, pic.aspect, geo, pic.fit, item.hemLength)
      const mesh = sleeveMesh(pic.fit, box, geo)
      if (!mesh) return svg('image', { href: pic.url, ...box, preserveAspectRatio: 'none', 'data-id': item.id })
      const done = await bentPicture(item, pic, mesh, scale)
      return done && svg('image', { href: done.url, ...done.box, preserveAspectRatio: 'none', 'data-id': item.id, 'data-fitting': 'sleeves' })
    }))
    // Slider input / wardrobe taps can finish out of order while images load.
    if (version !== drawVersion) return
    clothes.replaceChildren(...pieces.filter(Boolean))
  }

  // Sharp enough for this screen when settled; rougher (and much quicker)
  // while a slider is being dragged.
  function pixelsPerUnit(quality) {
    const r = stage.getBoundingClientRect()
    const css = Math.min(r.width / DOLL_WIDTH, r.height / DOLL_HEIGHT) || 1
    const sharp = Math.min(3, Math.max(1, css * (window.devicePixelRatio || 1)))
    return quality === 'draft' ? Math.max(0.6, sharp / 2.5) : sharp
  }

  // A garment with sleeves, bent to the arms as one seamless picture.
  function bentPicture(item, pic, mesh, scale) {
    const key = [item.id, scale.toFixed(2), item.hemLength ?? '', ...Object.values(shape)].join('|')
    if (!bent.has(key)) {
      if (bent.size >= BENT_CACHE_SIZE) {
        const [oldest, old] = bent.entries().next().value
        bent.delete(oldest)
        old.then((b) => b && URL.revokeObjectURL(b.url))
      }
      bent.set(key, (async () => {
        const pixels = await pic.pixels()
        if (!pixels) return null
        const out = warpTriangles(pixels, mesh, scale)
        const canvas = document.createElement('canvas')
        canvas.width = out.width
        canvas.height = out.height
        canvas.getContext('2d').putImageData(new ImageData(out.data, out.width, out.height), 0, 0)
        const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/png'))
        return blob && { url: blobUrl(blob), box: out.box }
      })())
    }
    return bent.get(key)
  }

  function picture(item) {
    if (!pictures.has(item.id)) pictures.set(item.id, (async () => {
      const images = await getImages(item.id)
      if (!images?.cutout) return null
      const bmp = await createImageBitmap(images.cutout)
      const aspect = bmp.width / bmp.height
      bmp.close()
      // Old wardrobe items get fitted lazily, once per screen visit. Avoid
      // rewriting their tags/dates or eagerly scanning hundreds of photos.
      const fit = validFit(item.fit, item.category) ? item.fit : await fitFromBlob(images.cutout, item.category)
      let pixels
      return {
        url: blobUrl(images.cutout), aspect, fit,
        // The cutout's pixels, read only for garments that get bent.
        pixels: () => (pixels ??= readPixels(images.cutout)),
      }
    })())
    return pictures.get(item.id)
  }

  async function redraw(quality = 'sharp') {
    const geo = dollGeometry(shape)
    drawBody(geo)
    await drawClothes(geo, quality)
  }

  // Slider dragging fires many times a second. Draw at most one frame at a
  // time, always the latest shape, and sharpen it when the slider is let go.
  let wanted = null, drawing = false
  async function requestRedraw(quality) {
    wanted = wanted === 'sharp' || quality === 'sharp' ? 'sharp' : 'draft'
    if (drawing) return
    drawing = true
    while (wanted) {
      const q = wanted
      wanted = null
      await redraw(q)
      await new Promise((ok) => requestAnimationFrame(ok))
    }
    drawing = false
  }

  // Clothes to pick from, one category at a time
  const present = Object.keys(CATEGORY_LABELS).filter((c) => items.some((i) => i.category === c))
  let tab = present[0]
  const tabs = h('div', { class: 'chips' })
  const strip = h('div', { class: 'strip' })

  async function renderPicker() {
    tabs.replaceChildren(...present.map((c) => h('button', {
      type: 'button', class: 'chip' + (c === tab ? ' on' : ''),
      onclick: () => { tab = c; renderPicker() },
    }, CATEGORY_LABELS[c])))
    const shown = items.filter((i) => i.category === tab)
    const buttons = []
    for (const item of shown) {
      if (!thumbs.has(item.id)) {
        const images = await getImages(item.id)
        thumbs.set(item.id, images?.thumb ? blobUrl(images.thumb) : null)
      }
      const worn = outfit.some((i) => i.id === item.id)
      buttons.push(h('button', {
        type: 'button', class: 'pick-item' + (worn ? ' on' : ''),
        'aria-pressed': String(worn), 'aria-label': `${item.colour?.name ?? ''} ${CATEGORY_LABELS[item.category]}`.trim(),
        onclick: async () => {
          outfit = wearItem(outfit, item)
          saveOutfit(outfit)
          await redraw()
          renderPicker()
        },
      }, thumbs.get(item.id) ? h('img', { src: thumbs.get(item.id), alt: '' }) : null))
    }
    strip.replaceChildren(...buttons)
  }

  // Body shape sliders
  const sliders = SHAPE_SLIDERS.map(([key, label]) => {
    const input = h('input', {
      type: 'range', min: SHAPE_MIN, max: SHAPE_MAX, step: 0.01, value: shape[key], 'aria-label': label,
      oninput: () => { shape = { ...shape, [key]: Number(input.value) }; requestRedraw('draft') },
      onchange: () => { setSetting('dollShape', shape); requestRedraw('sharp') },
    })
    return h('label', { class: 'slider' }, h('span', {}, label), input)
  })
  const reset = h('button', { type: 'button', class: 'small', onclick: async () => {
    shape = { ...DEFAULT_SHAPE }
    SHAPE_SLIDERS.forEach(([key], i) => { sliders[i].querySelector('input').value = shape[key] })
    await setSetting('dollShape', shape)
    redraw()
  } }, 'Reset shape')

  const undress = h('button', { type: 'button', class: 'small', onclick: async () => {
    outfit = []
    saveOutfit(outfit)
    await redraw()
    renderPicker()
  } }, 'Take everything off')

  root.replaceChildren(
    h('header', { class: 'bar' },
      h('a', { href: '#/', class: 'back', 'aria-label': 'Back' }, '‹'),
      h('h1', {}, 'Doll'),
      undress),
    h('div', { class: 'row model-link' }, h('a', { href: '#/3d', class: 'pill' }, 'Try 3D studio'),
      h('span', { class: 'hint' }, 'A rotatable mannequin with adapted clothes')),
    h('div', { class: 'doll-layout' },
      h('div', { class: 'doll-stage' }, stage),
      h('div', { class: 'doll-controls' },
        items.length
          ? [tabs, strip]
          : h('p', { class: 'muted' }, 'Add some clothes to your wardrobe to dress the doll.'),
        h('details', { class: 'shape' },
          h('summary', {}, 'Body shape'),
          h('p', { class: 'hint' }, 'Adjust once to match your proportions. Torso and leg lengths are saved separately.'),
          ...sliders,
          reset),
      ),
    ),
  )
  await redraw()
  await renderPicker()
}

// Reads a cutout's pixels for bending, capped in size to spare phone memory.
async function readPixels(blob) {
  try {
    const bmp = await createImageBitmap(blob)
    const scale = Math.min(1, 1000 / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bmp.width * scale))
    canvas.height = Math.max(1, Math.round(bmp.height * scale))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    bmp.close()
    return ctx.getImageData(0, 0, canvas.width, canvas.height)
  } catch (err) {
    console.warn('Could not read garment pixels', err)
    return null
  }
}

function loadOutfit() {
  try { return JSON.parse(localStorage.getItem(OUTFIT_KEY)) ?? [] } catch { return [] }
}

function saveOutfit(outfit) {
  try { localStorage.setItem(OUTFIT_KEY, JSON.stringify(outfit.map((i) => i.id))) } catch {}
}
