import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { saveItem, listItems, getImages, deleteItem, newItem, getSetting, setSetting } from '../src/db.js'
import { zipSync, strToU8 } from 'fflate'
import { makeBackup, restoreBackup } from '../src/lib/backup.js'

const blob = (text, type) => new Blob([text], { type })

async function addItem(fields, tag) {
  const item = { ...newItem(), ...fields }
  await saveItem(item, {
    original: blob(`original-${tag}`, 'image/jpeg'),
    cutout: blob(`cutout-${tag}`, 'image/png'),
    thumb: blob(`thumb-${tag}`, 'image/webp'),
  })
  return item
}

async function wipe() {
  for (const item of await listItems()) await deleteItem(item.id)
}

describe('backup', () => {
  it('brings back every item and photo exactly after the app is cleared', async () => {
    await wipe()
    const a = await addItem({ category: 'top', layer: 'mid', warmth: 4, notes: 'two  spaces\nand a line',
      colour: { hex: '#e8781e', name: 'orange', auto: false }, lastWorn: '2026-10-01', material: 'wool' }, 'a')
    const b = await addItem({ category: 'shoes', material: 'suede' }, 'b')
    const before = await listItems()

    const file = await makeBackup()
    expect(file).toBeInstanceOf(Blob)

    await wipe()
    expect(await listItems()).toEqual([])

    const count = await restoreBackup(file)
    expect(count).toBe(2)
    expect(await listItems()).toEqual(before)

    for (const [item, tag] of [[a, 'a'], [b, 'b']]) {
      const images = await getImages(item.id)
      expect(await images.original.text()).toBe(`original-${tag}`)
      expect(images.original.type).toBe('image/jpeg')
      expect(await images.cutout.text()).toBe(`cutout-${tag}`)
      expect(images.cutout.type).toBe('image/png')
      expect(await images.thumb.text()).toBe(`thumb-${tag}`)
      expect(images.thumb.type).toBe('image/webp')
    }
  })

  it('puts backed-up items back as they were and keeps items not in the backup', async () => {
    await wipe()
    const old = await addItem({ category: 'top', warmth: 2 }, 'old')
    const file = await makeBackup()
    await saveItem({ ...old, warmth: 5 }) // changed after the backup
    const extra = await addItem({ category: 'bottom' }, 'new')

    await restoreBackup(file)
    const after = await listItems()
    expect(after).toHaveLength(2)
    expect(after.find((i) => i.id === old.id).warmth).toBe(2)
    expect(after.map((i) => i.id)).toContain(extra.id)
  })

  it('refuses a file that is not a backup, without changing anything', async () => {
    await wipe()
    await addItem({ category: 'top' }, 'x')
    await expect(restoreBackup(blob('hello', 'text/plain'))).rejects.toThrow(/not an Outfits backup/)
    expect(await listItems()).toHaveLength(1)
  })

  it('brings back the doll’s body shape too', async () => {
    await wipe()
    await addItem({ category: 'top' }, 's')
    await setSetting('dollShape', { shoulders: 1, bust: 1.1, waist: 0.9, hips: 1.2, torso: 1, legs: 0.95 })
    const file = await makeBackup()
    await setSetting('dollShape', { shoulders: 1, bust: 1, waist: 1, hips: 1, torso: 1, legs: 1 })
    await restoreBackup(file)
    expect(await getSetting('dollShape')).toEqual({ shoulders: 1, bust: 1.1, waist: 0.9, hips: 1.2, torso: 1, legs: 0.95 })
  })

  it('restores a backup made before shapes were saved, leaving the shape alone', async () => {
    await wipe()
    const item = { ...newItem(), category: 'top' }
    const old = zipSync({ 'items.json': strToU8(JSON.stringify({ app: 'outfits', version: 1, createdAt: '2026-10-07T00:00:00Z', items: [item] })) })
    await setSetting('dollShape', { hips: 1.1 })
    expect(await restoreBackup(new Blob([old]))).toBe(1)
    expect(await getSetting('dollShape')).toEqual({ hips: 1.1 })
  })
})
