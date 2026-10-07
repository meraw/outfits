import { h } from '../ui.js'
import { newItem, saveItem } from '../db.js'
import { processPhoto } from '../lib/cutout.js'
import { itemForm } from './item-form.js'

export function intakeScreen(root) {
  const camera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: picked })
  const gallery = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: picked })

  root.replaceChildren(
    header(),
    h('div', { class: 'pick' },
      h('p', { class: 'muted' }, 'Lay the item flat on a plain surface and photograph it from above.'),
      h('button', { class: 'primary big', onclick: () => camera.click() }, 'Take photo'),
      h('button', { class: 'big', onclick: () => gallery.click() }, 'Choose from gallery'),
      camera, gallery),
  )

  async function picked(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const status = h('p', { class: 'status', 'aria-live': 'polite' })
    root.replaceChildren(header(), h('div', { class: 'working' }, h('div', { class: 'spinner' }), status))

    let result
    try {
      result = await processPhoto(file, (msg) => { status.textContent = msg })
    } catch (err) {
      console.error(err)
      status.textContent = "Sorry, that photo couldn't be opened. Try another one."
      root.querySelector('.spinner')?.remove()
      return
    }

    const item = { ...newItem(), colour: result.colour }
    root.replaceChildren(header('Tag it'), itemForm({
      item,
      images: result.images,
      removed: result.removed,
      async onSave(tagged) {
        await saveItem(tagged, result.images)
        location.hash = '#/'
      },
    }))
  }
}

function header(title = 'Add item') {
  return h('header', { class: 'bar' },
    h('a', { href: '#/', class: 'back', 'aria-label': 'Back' }, '‹'),
    h('h1', {}, title))
}
