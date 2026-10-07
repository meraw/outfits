import { h, blobUrl } from '../ui.js'
import { listItems, getImages, getSetting, setSetting } from '../db.js'
import { DEFAULT_SHAPE, SHAPE_SLIDERS, SHAPE_MIN, SHAPE_MAX } from '../lib/doll.js'
import { fitFromBlob, validFit } from '../lib/fit.js'
import { garmentOptions, TOP_STYLES, TOP_LENGTHS, LEG_STYLES, LEG_LENGTHS } from '../lib/model3d.js'
import { garmentTextures, disposeTextures } from '../lib/texture3d.js'
import { createModelView } from '../lib/view3d.js'

const OUTFIT_KEY = 'model3dOutfit'
const OPTIONS_KEY = 'model3dGarments'
const DEMO = [
  { id: 'example-top', category: 'top', colour: { hex: '#a15b42' }, example: true },
  { id: 'example-bottom', category: 'bottom', colour: { hex: '#435367' }, example: true },
]

export async function model3dScreen(root, { signal } = {}) {
  const [all, savedShape, savedOptions, ids] = await Promise.all([
    listItems(), getSetting('dollShape', DEFAULT_SHAPE), getSetting(OPTIONS_KEY, {}), getSetting(OUTFIT_KEY, null),
  ])
  if (signal?.aborted) return
  const items = all.filter((item) => ['top', 'bottom'].includes(item.category))
  let shape = { ...DEFAULT_SHAPE, ...savedShape }
  let options = savedOptions && typeof savedOptions === 'object' ? savedOptions : {}
  let outfit = Array.isArray(ids) ? ids.map((id) => [...items, ...DEMO].find((item) => item.id === id)).filter(Boolean) : items.length ? [] : [...DEMO]
  // At most one top and one bottom in this first version.
  outfit = outfit.filter((item, index) => outfit.findLastIndex((other) => other.category === item.category) === index)
  let category = 'top', selected = outfit.find((item) => item.category === category) || null
  let stopped = false, version = 0, pickerVersion = 0, view = null
  const assets = new Map(), thumbs = new Map()
  const stage = h('div', { class: 'model-stage' })
  const status = h('p', { class: 'hint model-status', role: 'status', 'aria-live': 'polite' })
  const tabs = h('div', { class: 'chips' }), strip = h('div', { class: 'strip' })
  const adjustments = h('div', { class: 'model-adjustments' })
  const angle = h('input', { type: 'range', min: 0, max: 360, value: 0, step: 1, 'aria-label': 'Rotate mannequin',
    oninput: () => view?.turn(Number(angle.value)),
  })
  const stop = () => {
    if (stopped) return
    stopped = true
    version++
    pickerVersion++
    view?.dispose()
    assets.forEach((promise) => promise.then((asset) => disposeTextures(asset?.maps)))
    signal?.removeEventListener('abort', stop)
  }
  signal?.addEventListener('abort', stop, { once: true })
  const saveOutfit = () => setSetting(OUTFIT_KEY, outfit.map((item) => item.id))

  function asset(item) {
    if (!assets.has(item.id)) assets.set(item.id, (async () => {
      if (item.example) return { fit: null, maps: {}, failed: false }
      try {
        const images = await getImages(item.id)
        if (!images?.cutout) return { fit: null, maps: {}, failed: true }
        const fit = validFit(item.fit, item.category) ? item.fit : await fitFromBlob(images.cutout, item.category)
        const maps = await garmentTextures(images.cutout, fit, item)
        return { fit, maps, failed: false }
      } catch { return { fit: null, maps: {}, failed: true } }
    })())
    return assets.get(item.id)
  }

  async function redraw() {
    const current = ++version
    const wearing = [...outfit]
    status.textContent = wearing.length ? 'Preparing the outfit…' : ''
    const loaded = await Promise.all(wearing.map(asset))
    if (stopped || current !== version) return
    view?.update(shape, wearing.map((item, i) => ({ item, maps: loaded[i].maps,
      options: garmentOptions(item, loaded[i].fit, options[item.id] || (item.example && item.category === 'top' ? { style: 'long' } : {})),
    })))
    status.textContent = loaded.some((a) => a.failed) ? 'A photo could not be loaded. Its garment is shown in a plain colour.' : ''
  }

  async function renderAdjustments() {
    const item = selected
    if (!item) { adjustments.replaceChildren(h('p', { class: 'hint' }, 'Choose a garment to adjust its 3D shape.')); return }
    const loaded = await asset(item)
    if (stopped || selected !== item) return
    const current = garmentOptions(item, loaded.fit, options[item.id] || (item.example && item.category === 'top' ? { style: 'long' } : {}))
    const persist = (key, value) => {
      options = { ...options, [item.id]: { ...current, ...options[item.id], [key]: value } }
      setSetting(OPTIONS_KEY, options)
      redraw()
    }
    const choose = (label, key, values) => h('label', { class: 'field' }, h('span', { class: 'label' }, label),
      h('select', { 'aria-label': label, onchange: (event) => persist(key, event.target.value) },
        ...values.map(([value, name]) => h('option', { value, selected: value === current[key] }, name))))
    const ease = h('input', { type: 'range', min: 1.02, max: 1.3, step: 0.01, value: current.ease, 'aria-label': 'Garment looseness',
      oninput: () => persist('ease', Number(ease.value)),
    })
    adjustments.replaceChildren(
      h('div', { class: 'model-selects' }, choose('Shape', 'style', item.category === 'top' ? TOP_STYLES : LEG_STYLES),
        choose('Length', 'length', item.category === 'top' ? TOP_LENGTHS : LEG_LENGTHS)),
      h('label', { class: 'slider' }, h('span', {}, 'Looseness'), ease),
    )
  }

  async function renderPicker() {
    const current = ++pickerVersion
    tabs.replaceChildren(...[['top', 'Top'], ['bottom', 'Bottom']].map(([key, label]) => h('button', {
      type: 'button', class: 'chip' + (key === category ? ' on' : ''),
      onclick: () => { category = key; selected = outfit.find((item) => item.category === key) || null; renderPicker(); renderAdjustments() },
    }, label)))
    const shown = items.filter((item) => item.category === category)
    const buttons = await Promise.all(shown.map(async (item) => {
      if (!thumbs.has(item.id)) thumbs.set(item.id, (async () => {
        try {
          const images = await getImages(item.id)
          return images?.thumb && !stopped ? blobUrl(images.thumb) : null
        } catch { return null }
      })())
      const thumb = await thumbs.get(item.id)
      const worn = outfit.some((other) => other.id === item.id)
      return h('button', { type: 'button', class: 'pick-item' + (worn ? ' on' : ''), 'aria-pressed': String(worn),
        'aria-label': `${item.colour?.name || ''} ${category === 'top' ? 'top' : 'bottom'}`.trim(),
        onclick: () => {
          outfit = outfit.filter((other) => other.category !== item.category)
          if (!worn) outfit.push(item)
          selected = worn ? null : item
          saveOutfit(); redraw(); renderPicker(); renderAdjustments()
        },
      }, thumb ? h('img', { src: thumb, alt: '' }) : h('span', { class: 'dot', style: `background:${item.colour?.hex || '#b4a99d'}` }))
    }))
    if (!stopped && current === pickerVersion) strip.replaceChildren(...(buttons.length ? buttons : [h('p', { class: 'hint' }, `No ${category === 'top' ? 'tops' : 'bottoms'} in your wardrobe yet.`)]))
  }

  const sliders = SHAPE_SLIDERS.map(([key, label]) => {
    const input = h('input', { type: 'range', min: SHAPE_MIN, max: SHAPE_MAX, step: 0.01, value: shape[key], 'aria-label': label,
      oninput: () => { shape = { ...shape, [key]: Number(input.value) }; redraw() },
      onchange: () => setSetting('dollShape', shape),
    })
    return h('label', { class: 'slider' }, h('span', {}, label), input)
  })
  root.replaceChildren(
    h('header', { class: 'bar' }, h('a', { href: '#/doll', class: 'back', 'aria-label': 'Back to doll' }, '‹'),
      h('h1', {}, '3D studio'), h('span', { class: 'badge' }, 'Preview')),
    h('p', { class: 'model-intro' }, 'Your clothes, adapted to a 3D mannequin. Drag to turn it; pinch to zoom.'),
    h('div', { class: 'doll-layout' },
      h('div', { class: 'model-view' }, stage,
        h('div', { class: 'model-camera row' },
          h('button', { type: 'button', class: 'small', onclick: () => view?.reset() }, 'Front'),
          angle,
          h('button', { type: 'button', class: 'small', onclick: () => view?.turn(180) }, 'Back')),
        status),
      h('div', { class: 'doll-controls' }, tabs, strip,
        h('div', { class: 'shape' }, h('h2', { class: 'model-heading' }, 'Garment shape'), adjustments),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'small', onclick: () => {
            outfit = [...DEMO]; selected = outfit.find((item) => item.category === category); saveOutfit(); redraw(); renderPicker(); renderAdjustments()
          } }, 'Try example outfit'),
          h('button', { type: 'button', class: 'small', onclick: () => {
            outfit = []; selected = null; saveOutfit(); redraw(); renderPicker(); renderAdjustments()
          } }, 'Take everything off')),
        h('details', { class: 'shape' }, h('summary', {}, 'Body shape'),
          h('p', { class: 'hint' }, 'These proportions are shared with your paper doll.'), ...sliders,
          h('button', { type: 'button', class: 'small', onclick: () => {
            shape = { ...DEFAULT_SHAPE }
            sliders.forEach((label, i) => { label.querySelector('input').value = shape[SHAPE_SLIDERS[i][0]] })
            setSetting('dollShape', shape); redraw()
          } }, 'Reset shape')),
        h('p', { class: 'hint' }, 'Front graphics come from your photo. Sleeves and backs use a fabric sample. Tops and trousers are supported for now; shapes and drape are approximate.'),
      )),
  )
  try { view = createModelView(stage, (degrees) => { angle.value = Math.round(degrees) }) }
  catch {
    stage.replaceChildren(h('div', { class: 'model-fallback' },
      h('p', {}, '3D could not start on this browser.'), h('a', { href: '#/doll', class: 'pill' }, 'Use the paper doll')))
    angle.disabled = true
  }
  await Promise.all([redraw(), renderPicker(), renderAdjustments()])
  return stop
}
