import './style.css'
import { freeUrls } from './ui.js'
import { askToKeepData } from './db.js'
import { wardrobeScreen } from './screens/wardrobe.js'
import { intakeScreen } from './screens/intake.js'
import { editScreen } from './screens/item-edit.js'
import { backupScreen } from './screens/backup.js'
import { dollScreen } from './screens/doll.js'

const root = document.getElementById('app')

// Screens are picked from the part of the address after #:
// #/ wardrobe, #/add new item, #/item/<id> edit, #/backup backup and restore,
// #/doll the paper doll.
async function route() {
  freeUrls()
  window.scrollTo(0, 0)
  // Each visit owns its host, so a slower previous screen cannot replace it.
  const screen = document.createElement('div')
  root.replaceChildren(screen)
  const hash = location.hash.replace(/^#/, '') || '/'
  const edit = hash.match(/^\/item\/(.+)$/)
  if (hash === '/add') intakeScreen(screen)
  else if (hash === '/backup') await backupScreen(screen)
  else if (hash === '/doll') await dollScreen(screen)
  else if (edit) await editScreen(screen, decodeURIComponent(edit[1]))
  else await wardrobeScreen(screen)
}

addEventListener('hashchange', route)
route()
askToKeepData()
