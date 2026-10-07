import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { saveItem, getItem, listItems, getImages, deleteItem, newItem } from '../src/db.js'

const blob = (text) => new Blob([text], { type: 'image/png' })

describe('wardrobe storage', () => {
  it('new items get sensible defaults', () => {
    const item = newItem()
    expect(item.id).toBeTruthy()
    expect(item.warmth).toBe(3)
    expect(item.formality).toBe('casual')
    expect(item.notes).toBe('')
    expect(item.lastWorn).toBeNull()
  })

  it('saves an item with its photos and reads both back', async () => {
    const item = { ...newItem(), category: 'top', layer: 'base', notes: '  keeps its   spacing\nand lines ' }
    await saveItem(item, { original: blob('o'), cutout: blob('c'), thumb: blob('t') })

    const back = await getItem(item.id)
    expect(back.category).toBe('top')
    expect(back.notes).toBe('  keeps its   spacing\nand lines ')

    const images = await getImages(item.id)
    expect(await images.original.text()).toBe('o')
    expect(await images.cutout.text()).toBe('c')
  })

  it('editing tags keeps the photos', async () => {
    const item = { ...newItem(), category: 'shoes' }
    await saveItem(item, { original: blob('o'), cutout: blob('c'), thumb: blob('t') })
    await saveItem({ ...item, warmth: 5 })
    expect((await getItem(item.id)).warmth).toBe(5)
    expect(await (await getImages(item.id)).cutout.text()).toBe('c')
  })

  it('lists newest first and deletes items with their photos', async () => {
    const a = { ...newItem(), category: 'top', createdAt: '2026-01-01T00:00:00Z' }
    const b = { ...newItem(), category: 'bottom', createdAt: '2026-02-01T00:00:00Z' }
    await saveItem(a, { original: blob('a'), cutout: blob('a'), thumb: blob('a') })
    await saveItem(b, { original: blob('b'), cutout: blob('b'), thumb: blob('b') })

    const ids = (await listItems()).map((i) => i.id)
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id))

    await deleteItem(a.id)
    expect(await getItem(a.id)).toBeUndefined()
    expect(await getImages(a.id)).toBeUndefined()
  })
})
