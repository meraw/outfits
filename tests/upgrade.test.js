import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { openDB } from 'idb'

describe('updating the app', () => {
  it('keeps clothes saved by the first version', async () => {
    // A phone that used version 1 of the app's storage
    const old = await openDB('outfits', 1, {
      upgrade(db) {
        db.createObjectStore('items', { keyPath: 'id' })
        db.createObjectStore('images', { keyPath: 'itemId' })
      },
    })
    await old.put('items', { id: 'old-1', category: 'top', createdAt: '2026-10-07T00:00:00Z' })
    old.close()

    const { listItems, getSetting } = await import('../src/db.js')
    expect((await listItems()).map((i) => i.id)).toEqual(['old-1'])
    expect(await getSetting('anything', 'fallback')).toBe('fallback')
  })
})
