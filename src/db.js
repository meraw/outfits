// Everything stored on the phone lives here (IndexedDB).
// "items" holds the tags, "images" holds the photos, kept apart so the
// wardrobe list loads without pulling every full-size photo.
// "settings" holds small app-wide values, like the doll's shape.
import { openDB } from 'idb'

const dbPromise = openDB('outfits', 2, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      db.createObjectStore('items', { keyPath: 'id' })
      db.createObjectStore('images', { keyPath: 'itemId' })
    }
    if (oldVersion < 2) db.createObjectStore('settings')
  },
  // Another open tab of the app (an older version) holding the database
  // would block the upgrade; close our side so it can go ahead.
  blocking() { dbPromise.then((db) => db.close()) },
})

export async function getSetting(key, fallback) {
  const value = await (await dbPromise).get('settings', key)
  return value === undefined ? fallback : value
}

export async function setSetting(key, value) {
  await (await dbPromise).put('settings', value, key)
}

export function newItem() {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    category: null,
    layer: null,
    warmth: 3,
    colour: null, // { hex, name, auto }
    formality: 'casual',
    material: null,
    lastWorn: null, // 'YYYY-MM-DD'
    notes: '',
    fit: null, // versioned, normalized silhouette anchors for the paper doll
  }
}

// images is optional: leave it out when only the tags changed.
export async function saveItem(item, images) {
  const db = await dbPromise
  const tx = db.transaction(['items', 'images'], 'readwrite')
  tx.objectStore('items').put({ ...item, updatedAt: new Date().toISOString() })
  if (images) tx.objectStore('images').put({ itemId: item.id, ...images })
  await tx.done
}

export async function getItem(id) {
  return (await dbPromise).get('items', id)
}

export async function listItems() {
  const items = await (await dbPromise).getAll('items')
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getImages(id) {
  return (await dbPromise).get('images', id)
}

// Restoring a backup: writes items exactly as given (dates untouched),
// all in one go, so a failure halfway leaves nothing half-restored.
export async function putItemsWithImages(entries) {
  const db = await dbPromise
  const tx = db.transaction(['items', 'images'], 'readwrite')
  for (const { item, images } of entries) {
    tx.objectStore('items').put(item)
    tx.objectStore('images').put({ itemId: item.id, ...images })
  }
  await tx.done
}

export async function deleteItem(id) {
  const db = await dbPromise
  const tx = db.transaction(['items', 'images'], 'readwrite')
  tx.objectStore('items').delete(id)
  tx.objectStore('images').delete(id)
  await tx.done
}

// Asks the browser not to clear our data when the phone is low on space.
export async function askToKeepData() {
  try { return await navigator.storage?.persist?.() } catch { return false }
}
