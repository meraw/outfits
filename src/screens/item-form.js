// The tag form, shared by "add" and "edit".
import { h, chips, blobUrl } from '../ui.js'
import { COLOUR_NAMES, paletteColour } from '../lib/colour.js'
import { rotateImages } from '../lib/cutout.js'

export const CATEGORY_LABELS = {
  top: 'Top', bottom: 'Bottom', dress: 'Dress', outerwear: 'Outerwear', shoes: 'Shoes', accessory: 'Accessory',
}
const DEFAULT_LAYER = { top: 'base', dress: 'base', outerwear: 'outer' }
const MATERIALS = ['cotton', 'linen', 'wool', 'cashmere', 'knit', 'denim', 'silk', 'synthetic',
  'leather', 'suede', 'canvas', 'rubber', 'other']

export function itemForm({ item, images, removed = true, onSave, extra }) {
  item = structuredClone(item)
  const err = h('p', { class: 'error', role: 'alert' })

  // Picture, with a switch between cutout and original photo, and a
  // quarter-turn button for photos that came out sideways.
  let showOriginal = false
  let rotated = false
  const pic = h('img', { class: 'pic', alt: '' })
  let cutoutUrl, originalUrl
  const setUrls = () => { cutoutUrl = blobUrl(images.cutout); originalUrl = blobUrl(images.original) }
  setUrls()
  const flip = h('button', { type: 'button', class: 'small', onclick: () => { showOriginal = !showOriginal; showPic() } })
  const turn = h('button', { type: 'button', class: 'small', 'aria-label': 'Rotate a quarter turn', onclick: async () => {
    turn.disabled = save.disabled = true
    images = await rotateImages(images)
    rotated = true
    setUrls()
    showPic()
    turn.disabled = save.disabled = false
  } }, '↻ Rotate')
  const showPic = () => {
    pic.src = showOriginal ? originalUrl : cutoutUrl
    flip.textContent = showOriginal ? 'Show cutout' : 'Show original'
  }
  showPic()
  const picBox = h('div', { class: 'pic-box' }, pic, h('div', { class: 'pic-buttons' }, turn, flip))

  // Layer only matters for things you wear in layers.
  const layerField = h('div', { class: 'field' })
  const renderLayer = () => {
    const wanted = item.category in DEFAULT_LAYER
    if (!wanted) item.layer = null
    else if (!item.layer) item.layer = DEFAULT_LAYER[item.category]
    layerField.hidden = !wanted
    layerField.replaceChildren(h('div', { class: 'label' }, 'Layer'),
      chips([['base', 'Base'], ['mid', 'Mid'], ['outer', 'Outer']], item.layer, (v) => { item.layer = v }))
  }
  renderLayer()

  const categoryChips = chips(Object.entries(CATEGORY_LABELS), item.category, (v) => {
    item.category = v
    err.textContent = ''
    renderLayer()
  })

  // Colour: detected automatically; tap a square to choose another.
  let colour = item.colour ?? paletteColour('grey')
  const current = h('div', { class: 'row colour-now' })
  const squares = h('div', { class: 'colour-grid', role: 'radiogroup', 'aria-label': 'Colour' })
  const renderColour = () => {
    current.replaceChildren(
      h('span', { class: 'dot big', style: `background:${colour.hex}` }),
      h('span', {}, colour.name),
      ...(colour.auto ? [h('span', { class: 'badge' }, 'detected')] : []))
    squares.replaceChildren(...COLOUR_NAMES.map((name) => {
      const { hex } = paletteColour(name)
      const on = name === colour.name
      return h('button', {
        type: 'button', class: 'square' + (on ? ' on' : ''), style: `background:${hex}`,
        role: 'radio', 'aria-checked': String(on), 'aria-label': name, title: name,
        onclick: () => { colour = paletteColour(name); renderColour() },
      })
    }))
  }
  renderColour()

  const material = h('select', { onchange: () => { item.material = material.value || null } },
    h('option', { value: '' }, '—'),
    MATERIALS.map((m) => h('option', { value: m, selected: m === item.material }, m)))

  const lastWorn = h('input', { type: 'date', value: item.lastWorn ?? '',
    onchange: () => { item.lastWorn = lastWorn.value || null } })

  const notes = h('textarea', { rows: 3, placeholder: 'Anything you want to remember about it',
    oninput: () => { item.notes = notes.value } })
  notes.value = item.notes

  const save = h('button', { type: 'submit', class: 'primary' }, 'Save')

  return h('form', { class: 'item-form', onsubmit: async (e) => {
    e.preventDefault()
    if (!item.category) {
      err.textContent = 'Pick a category first.'
      categoryChips.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    save.disabled = true
    item.colour = { ...colour }
    await onSave(item, rotated ? images : null) // new pictures only if they were turned
  } },
    picBox,
    h('div', { class: 'fields' },
    removed ? null : h('p', { class: 'note' },
      "The background couldn't be removed from this photo, so the full photo is used. Try again with the item on a plain, contrasting surface."),
    field('Category', categoryChips),
    layerField,
    field('Warmth', chips([1, 2, 3, 4, 5].map((n) => [n, String(n)]), item.warmth, (v) => { item.warmth = v }),
      h('span', { class: 'hint' }, '1 = very light, 5 = very warm')),
    field('Colour', current, squares),
    field('Formality', chips([['casual', 'Casual'], ['smart', 'Smart'], ['formal', 'Formal']],
      item.formality, (v) => { item.formality = v })),
    field('Material', material),
    field('Last worn', h('div', { class: 'row' }, lastWorn,
      h('button', { type: 'button', class: 'small', onclick: () => {
        lastWorn.value = new Date().toLocaleDateString('en-CA')
        item.lastWorn = lastWorn.value
      } }, 'Today'))),
    field('Notes', notes),
    err,
    h('div', { class: 'actions' }, extra, save),
    ),
  )
}

function field(label, ...content) {
  return h('div', { class: 'field' }, h('div', { class: 'label' }, label), ...content)
}
