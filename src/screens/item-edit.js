import { h } from '../ui.js'
import { getItem, getImages, saveItem, deleteItem } from '../db.js'
import { itemForm } from './item-form.js'

export async function editScreen(root, id) {
  const [item, images] = await Promise.all([getItem(id), getImages(id)])
  const header = h('header', { class: 'bar' },
    h('a', { href: '#/', class: 'back', 'aria-label': 'Back' }, '‹'),
    h('h1', {}, 'Edit item'))

  if (!item || !images) {
    root.replaceChildren(header, h('p', { class: 'empty' }, 'This item no longer exists.'))
    return
  }

  const remove = h('button', { type: 'button', class: 'danger', onclick: async () => {
    if (!confirm('Delete this item and its photos? This cannot be undone.')) return
    await deleteItem(id)
    location.hash = '#/'
  } }, 'Delete')

  root.replaceChildren(header, itemForm({
    item,
    images,
    extra: remove,
    async onSave(edited, turned) {
      await saveItem(edited, turned ?? undefined) // photos only change if rotated
      location.hash = '#/'
    },
  }))
}
