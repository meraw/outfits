// The paper doll: reshape the body and dress it by tapping clothes.
import { h, svg, blobUrl } from '../ui.js'
import { listItems, getImages, getSetting, setSetting, saveItem } from '../db.js'
import {
  DOLL_WIDTH, DOLL_TOP, DOLL_HEIGHT, SHAPE_SLIDERS, SHAPE_MIN, SHAPE_MAX, DEFAULT_SHAPE,
  dollGeometry, placeItem, wearItem,
} from '../lib/doll.js'
import { CATEGORY_LABELS } from './item-form.js'
import { fitFromBlob, validFit } from '../lib/fit.js'
import { sleeveMesh, legMesh } from '../lib/garment-mesh.js'
import { warpTriangles } from '../lib/warp.js'
import { canTuck, drawingPlan, tuckLine } from '../lib/tuck.js'
import { applyAdjust, cleanAdjust, gestureAdjust, isAdjusted, pickGarment } from '../lib/adjust.js'

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
  const marks = svg('g', { 'pointer-events': 'none' }) // outline of the garment being adjusted
  const stage = svg('svg', {
    class: 'doll-svg', viewBox: `0 ${DOLL_TOP} ${DOLL_WIDTH} ${DOLL_HEIGHT}`,
    preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': 'Paper doll',
    // Fingers on the doll move and pinch clothes instead of scrolling the page.
    style: 'touch-action: none',
  }, body, clothes, marks)
  let garments = [] // as drawn, bottom first: { id, item, base, box, alphaAt }
  let selected = null // id of the garment being adjusted

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
    const plan = drawingPlan(outfit) // bottom of the pile first; tucked tops go under the bottom
    const drawn = plan.map((p) => p.item)
    const loaded = await Promise.all(drawn.map(picture))
    if (version !== drawVersion) return
    const scale = pixelsPerUnit(quality)
    const placed = await Promise.all(drawn.map(async (item, index) => {
      const pic = loaded[index]
      if (!pic) return null
      const base = placeItem(item.category, pic.aspect, geo, pic.fit, item.hemLength)
      const box = applyAdjust(base, item.dollAdjust) // the hand adjustment, if any
      const mesh = sleeveMesh(pic.fit, box, geo) ?? legMesh(pic.fit, box, geo)
      if (!mesh) {
        pic.pixels().then((p) => { pic.pixelData = p }) // for picking by tap
        return {
          item, base, placedBox: box, fit: pic.fit, box, alphaAt: (u, v) => alphaIn(pic.pixelData, u, v),
          node: svg('image', { href: pic.url, ...box, preserveAspectRatio: 'none', 'data-id': item.id }),
        }
      }
      const done = await bentPicture(item, pic, mesh, scale)
      return done && {
        item, base, placedBox: box, fit: pic.fit, box: done.box, alphaAt: (u, v) => alphaIn(done.alpha, u, v),
        node: svg('image', { href: done.url, ...done.box, preserveAspectRatio: 'none', 'data-id': item.id, 'data-fitting': 'bent' }),
      }
    }))
    // Slider input / wardrobe taps can finish out of order while images load.
    if (version !== drawVersion) return
    garments = placed.filter(Boolean).map((g) => ({ ...g, id: g.item.id }))
    // Tucked tops: cut off just inside the waistband of the bottom they go into.
    const defs = svg('defs')
    plan.forEach(({ item, tuckedInto }) => {
      const top = garments.find((g) => g.id === item.id)
      const bottom = tuckedInto && garments.find((g) => g.id === tuckedInto)
      if (!top || !bottom) return
      const line = tuckLine(bottom.placedBox, bottom.fit)
      const id = `tuck-${item.id}`
      defs.append(svg('clipPath', { id }, svg('rect', { x: -2000, y: -2000, width: 5000, height: line + 2000 })))
      top.node = svg('g', { 'clip-path': `url(#${id})`, 'data-tucked': item.id }, top.node)
      const solid = top.alphaAt
      top.alphaAt = (u, v) => (top.box.y + v * top.box.height > line ? 0 : solid(u, v))
    })
    clothes.replaceChildren(defs, ...garments.map((g) => g.node))
    drawMarks()
  }

  function drawMarks() {
    const g = garments.find((x) => x.id === selected)
    marks.replaceChildren(...(g ? [svg('rect', {
      x: g.box.x - 4, y: g.box.y - 4, width: g.box.width + 8, height: g.box.height + 8, rx: 8,
      fill: 'none', stroke: '#b5654a', 'stroke-width': 2.5, 'stroke-dasharray': '8 6',
    })] : []))
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
    const a = cleanAdjust(item.dollAdjust)
    const key = [item.id, scale.toFixed(2), item.hemLength ?? '', a.dx, a.dy, a.scale, ...Object.values(shape)].join('|')
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
        return blob && { url: blobUrl(blob), box: out.box, alpha: out }
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

  // Adjusting a garment by hand: tap it on the doll, then drag / pinch.
  const pointers = new Map() // pointerId → [x, y] in doll units
  let gesture = null // { item, original, start, base, ids, from }
  const toDoll = (e) => {
    const m = stage.getScreenCTM()
    if (!m) return [0, 0]
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return [p.x, p.y]
  }
  function beginGesture(item) {
    const g = garments.find((x) => x.id === item.id)
    if (!g) { gesture = null; return }
    const ids = [...pointers.keys()].slice(0, 2)
    // original: before the first finger landed, to know whether to save.
    const original = gesture?.item === item ? gesture.original : cleanAdjust(item.dollAdjust)
    gesture = { item, original, start: cleanAdjust(item.dollAdjust), base: g.base, ids, from: ids.map((id) => pointers.get(id)) }
  }
  async function finishGesture() {
    const item = gesture?.item
    const moved = item && JSON.stringify(cleanAdjust(item.dollAdjust)) !== JSON.stringify(gesture.original)
    gesture = null
    if (moved) await saveItem(item)
    renderBar()
    requestRedraw('sharp')
  }
  stage.addEventListener('pointerdown', (e) => {
    const p = toDoll(e)
    pointers.set(e.pointerId, p)
    try { stage.setPointerCapture(e.pointerId) } catch {} // keep following a finger that slides off the doll
    if (pointers.size === 1) {
      const hit = pickGarment(garments, p)
      if (hit !== selected) { selected = hit; renderBar(); drawMarks() }
    }
    const item = outfit.find((i) => i.id === selected)
    if (item) beginGesture(item) // restarts cleanly when a second finger lands
  })
  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, toDoll(e))
    if (!gesture) return
    const to = gesture.ids.map((id) => pointers.get(id))
    if (to.some((p) => !p)) return
    gesture.item.dollAdjust = gestureAdjust(gesture.start, gesture.base, gesture.from, to)
    requestRedraw('draft')
  })
  const lift = (e) => {
    if (!pointers.delete(e.pointerId)) return
    if (!gesture) return
    // One finger left: carry on dragging from where the garment is now.
    if (pointers.size > 0) beginGesture(gesture.item)
    else finishGesture()
  }
  stage.addEventListener('pointerup', lift)
  stage.addEventListener('pointercancel', lift)
  // Mouse wheel resizes on a computer (around the pointer).
  let wheelSave = null
  stage.addEventListener('wheel', (e) => {
    const item = outfit.find((i) => i.id === selected)
    const g = garments.find((x) => x.id === selected)
    if (!item || !g) return
    e.preventDefault()
    const [x, y] = toDoll(e)
    const k = Math.exp(-e.deltaY * 0.0015)
    item.dollAdjust = gestureAdjust(item.dollAdjust, g.base, [[x - 50, y], [x + 50, y]], [[x - 50 * k, y], [x + 50 * k, y]])
    requestRedraw('draft')
    clearTimeout(wheelSave)
    wheelSave = setTimeout(async () => { await saveItem(item); renderBar(); requestRedraw('sharp') }, 400)
  }, { passive: false })

  const bar = h('div', { class: 'adjust-bar' })
  function renderBar() {
    const item = outfit.find((i) => i.id === selected)
    if (!item) {
      selected = null
      bar.replaceChildren(h('p', { class: 'hint' }, 'Tip: tap a garment on the doll to adjust how it sits.'))
      return
    }
    const name = `${item.colour?.name ?? ''} ${CATEGORY_LABELS[item.category] ?? ''}`.trim()
    bar.replaceChildren(
      h('p', { class: 'hint' }, `Adjusting ${name}: drag to move, pinch to resize.`),
      h('div', { class: 'row' },
        canTuck(item) ? h('button', { type: 'button', class: 'small', onclick: async () => {
          if (item.dollTucked) delete item.dollTucked
          else item.dollTucked = true
          await saveItem(item)
          renderBar()
          requestRedraw('sharp')
        } }, item.dollTucked ? 'Untuck' : 'Tuck in') : null,
        h('button', { type: 'button', class: 'small', disabled: !isAdjusted(item.dollAdjust), onclick: async () => {
          delete item.dollAdjust
          await saveItem(item)
          renderBar()
          requestRedraw('sharp')
        } }, 'Reset fit'),
        h('button', { type: 'button', class: 'small', onclick: () => { selected = null; renderBar(); drawMarks() } }, 'Done')),
    )
  }
  renderBar()

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
          renderBar()
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
    h('div', { class: 'doll-layout' },
      h('div', { class: 'doll-stage' }, stage),
      h('div', { class: 'doll-controls' },
        bar,
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

// How solid a picture is at (u, v), 0–1 across it. Unknown counts as solid.
function alphaIn(img, u, v) {
  if (!img?.data) return 1
  const x = Math.min(img.width - 1, Math.max(0, Math.floor(u * img.width)))
  const y = Math.min(img.height - 1, Math.max(0, Math.floor(v * img.height)))
  return img.data[(y * img.width + x) * 4 + 3] / 255
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
