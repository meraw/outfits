import { h, blobUrl } from '../ui.js'
import { listItems, getImages } from '../db.js'
import { CATEGORY_LABELS } from './item-form.js'

export async function wardrobeScreen(root) {
  const items = await listItems()
  const grid = h('div', { class: 'grid' })

  for (const item of items) {
    const images = await getImages(item.id)
    grid.append(
      h('a', { class: 'card', href: `#/item/${item.id}` },
        h('div', { class: 'card-pic' },
          images?.thumb ? h('img', { src: blobUrl(images.thumb), alt: '' }) : null),
        h('div', { class: 'card-label' },
          item.colour ? h('span', { class: 'dot', style: `background:${item.colour.hex}` }) : null,
          CATEGORY_LABELS[item.category] ?? 'Untagged'),
      ),
    )
  }

  root.replaceChildren(
    h('header', { class: 'bar' },
      h('h1', {}, 'Wardrobe'),
      h('span', { class: 'muted' }, items.length === 1 ? '1 item' : `${items.length} items`)),
    items.length
      ? grid
      : h('p', { class: 'empty' }, 'No clothes yet. Tap + to photograph your first item.'),
    h('a', { class: 'fab', href: '#/add', 'aria-label': 'Add item' }, '+'),
  )
}
