import { h } from '../ui.js'
import { listItems } from '../db.js'
import { makeBackup, restoreBackup, backupFileName } from '../lib/backup.js'

const LAST_KEY = 'lastBackup'

export async function backupScreen(root) {
  const count = (await listItems()).length
  const status = h('p', { class: 'status-line', 'aria-live': 'polite' })
  const last = h('p', { class: 'muted' }, lastBackupText())

  const say = (text, isError = false) => {
    status.textContent = text
    status.classList.toggle('error', isError)
  }

  async function build() {
    say('Packing up your wardrobe…')
    const blob = await makeBackup()
    return new File([blob], backupFileName(), { type: 'application/zip' })
  }

  function remember() {
    try { localStorage.setItem(LAST_KEY, new Date().toISOString()) } catch {}
    last.textContent = lastBackupText()
  }

  const save = h('button', { class: 'primary big', disabled: count === 0, onclick: async () => {
    const file = await build()
    const a = h('a', { href: URL.createObjectURL(file), download: file.name })
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10000)
    remember()
    say(`Saved ${file.name} (${mb(file.size)}) to your Downloads.`)
  } }, 'Save backup')

  // On Android this opens the share sheet, so the file can go straight to
  // Google Drive, email, etc.
  const canShare = !!navigator.canShare?.({ files: [new File([''], 'x.zip', { type: 'application/zip' })] })
  const share = canShare ? h('button', { class: 'big', disabled: count === 0, onclick: async () => {
    const file = await build()
    try {
      await navigator.share({ files: [file], title: 'Outfits backup' })
      remember()
      say('Backup sent.')
    } catch (err) {
      say(err?.name === 'AbortError' ? '' : 'Sharing didn\'t work. Use "Save backup" instead.', err?.name !== 'AbortError')
    }
  } }, 'Send backup to…') : null

  const picker = h('input', { type: 'file', accept: '.zip,application/zip', hidden: true, onchange: async () => {
    const file = picker.files?.[0]
    picker.value = ''
    if (!file) return
    if (!confirm('Restore this backup? Items in it will be put back as they were in the backup. Items not in it stay as they are.')) return
    say('Restoring…')
    try {
      const n = await restoreBackup(file)
      say(n === 1 ? 'Restored 1 item.' : `Restored ${n} items.`)
    } catch (err) {
      say(err.message, true)
    }
  } })

  root.replaceChildren(
    h('header', { class: 'bar' },
      h('a', { href: '#/', class: 'back', 'aria-label': 'Back' }, '‹'),
      h('h1', {}, 'Backup')),
    h('div', { class: 'backup' },
      h('p', {}, 'Your clothes and photos are stored only on this phone. Save a backup now and then, and keep the file somewhere safe, like Google Drive or an email to yourself.'),
      last,
      save,
      share,
      count === 0 ? h('p', { class: 'muted' }, 'Nothing to back up yet.') : null,
      h('hr'),
      h('h2', {}, 'Restore'),
      h('p', { class: 'muted' }, 'Bring back clothes from a backup file, for example on a new phone.'),
      h('button', { class: 'big', onclick: () => picker.click() }, 'Restore from a backup'),
      picker,
      status,
    ),
  )
}

function lastBackupText() {
  let iso = null
  try { iso = localStorage.getItem(LAST_KEY) } catch {}
  if (!iso) return 'Last backup: never'
  return 'Last backup: ' + new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
}

function mb(bytes) {
  return bytes < 1e6 ? `${Math.max(1, Math.round(bytes / 1e3))} KB` : `${(bytes / 1e6).toFixed(1)} MB`
}
