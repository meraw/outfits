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

  // No "share" button: Chrome on Android won't share .zip files from a web
  // page, so the backup goes to Downloads and is uploaded to Drive from there.

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
      count === 0
        ? h('p', { class: 'muted' }, 'Nothing to back up yet.')
        : h('p', { class: 'muted' }, 'To keep it safe in Google Drive: open the Drive app, tap +, then Upload, and pick the file from Downloads.'),
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
