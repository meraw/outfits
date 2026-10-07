// The paper doll: reshape the body and dress it by tapping clothes.
import { h, svg, blobUrl } from '../ui.js'
import { listItems, getImages, getSetting, setSetting } from '../db.js'
import {
  DOLL_WIDTH, DOLL_TOP, DOLL_HEIGHT, SHAPE_SLIDERS, SHAPE_MIN, SHAPE_MAX, DEFAULT_SHAPE,
  dollGeometry, placeItem, wearItem, sortForDrawing,
} from '../lib/doll.js'
import { CATEGORY_LABELS } from './item-form.js'
import { fitFromBlob, validFit } from '../lib/fit.js'

const OUTFIT_KEY = 'dollOutfit' // ids of what the doll is wearing

export async function dollScreen(root) {
  const items = await listItems()
  let shape = { ...DEFAULT_SHAPE, ...(await getSetting('dollShape', DEFAULT_SHAPE)) }
  let outfit = loadOutfit().map((id) => items.find((i) => i.id === id)).filter(Boolean)
  const pictures = new Map() // id → { url, aspect, fit }; also deduplicates in-flight reads
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
  async function drawClothes(geo) {
    const version = ++drawVersion
    const drawn = sortForDrawing(outfit)
    const loaded = await Promise.all(drawn.map(picture))
    // Slider input / wardrobe taps can finish out of order while images load.
    if (version !== drawVersion) return
    clothes.replaceChildren(...drawn.flatMap((item, index) => {
      const pic = loaded[index]
      if (!pic) return []
      const r = placeItem(item.category, pic.aspect, geo, pic.fit)
      return svg('image', { href: pic.url, x: r.x, y: r.y, width: r.width, height: r.height, 'data-id': item.id })
    }))
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
      return { url: blobUrl(images.cutout), aspect, fit }
    })())
    return pictures.get(item.id)
  }

  async function redraw() {
    const geo = dollGeometry(shape)
    drawBody(geo)
    await drawClothes(geo)
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
      oninput: () => { shape = { ...shape, [key]: Number(input.value) }; redraw() },
      onchange: () => setSetting('dollShape', shape),
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
        items.length
          ? [tabs, strip]
          : h('p', { class: 'muted' }, 'Add some clothes to your wardrobe to dress the doll.'),
        h('details', { class: 'shape' },
          h('summary', {}, 'Body shape'),
          ...sliders,
          reset),
      ),
    ),
  )
  await redraw()
  await renderPicker()
}

function loadOutfit() {
  try { return JSON.parse(localStorage.getItem(OUTFIT_KEY)) ?? [] } catch { return [] }
}

function saveOutfit(outfit) {
  try { localStorage.setItem(OUTFIT_KEY, JSON.stringify(outfit.map((i) => i.id))) } catch {}
}
