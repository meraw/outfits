// Backup file: one .zip holding items.json and every photo.
//   items.json                     { app, version, createdAt, items: [...], settings: {...} }
//                                  (settings, like the doll's shape, since Oct 2026;
//                                  older backups simply don't have them)
//   images/<id>/original.jpg       (and cutout.png, thumb.webp)
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'
import { listItems, getImages, putItemsWithImages, getAllSettings, setSetting } from '../db.js'

const APP = 'outfits'
const VERSION = 1
const KINDS = ['original', 'cutout', 'thumb']
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const TYPE = Object.fromEntries(Object.entries(EXT).map(([t, e]) => [e, t]))

export async function makeBackup() {
  const items = await listItems()
  const settings = await getAllSettings()
  const files = {
    'items.json': strToU8(JSON.stringify({ app: APP, version: VERSION, createdAt: new Date().toISOString(), items, settings }, null, 1)),
  }
  for (const item of items) {
    const images = await getImages(item.id)
    if (!images) continue
    for (const kind of KINDS) {
      const blob = images[kind]
      if (!blob) continue
      const ext = EXT[blob.type] ?? 'bin'
      // Photos are already compressed; zipping them again only costs time.
      files[`images/${item.id}/${kind}.${ext}`] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }]
    }
  }
  return new Blob([zipSync(files)], { type: 'application/zip' })
}

// Adds the backup's items to the wardrobe (replacing ones with the same id).
// Returns how many items were restored.
export async function restoreBackup(file) {
  let files, data
  try {
    files = unzipSync(new Uint8Array(await file.arrayBuffer()))
    data = JSON.parse(strFromU8(files['items.json']))
  } catch {
    throw new Error('This file is not an Outfits backup.')
  }
  if (data?.app !== APP || !Array.isArray(data.items)) throw new Error('This file is not an Outfits backup.')
  if (data.version > VERSION) throw new Error('This backup was made by a newer version of the app. Update the app first.')

  const entries = data.items.map((item) => {
    const images = {}
    for (const kind of KINDS) {
      const path = Object.keys(files).find((p) => p.startsWith(`images/${item.id}/${kind}.`))
      if (path) images[kind] = new Blob([files[path]], { type: TYPE[path.split('.').pop()] ?? '' })
    }
    return { item, images }
  })
  await putItemsWithImages(entries)
  if (data.settings && typeof data.settings === 'object') {
    for (const [key, value] of Object.entries(data.settings)) await setSetting(key, value)
  }
  return entries.length
}

export function backupFileName(date = new Date()) {
  return `outfits-backup-${date.toLocaleDateString('en-CA')}.zip`
}
