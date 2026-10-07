import './style.css'
import { freeUrls } from './ui.js'
import { askToKeepData } from './db.js'
import { wardrobeScreen } from './screens/wardrobe.js'
import { intakeScreen } from './screens/intake.js'
import { editScreen } from './screens/item-edit.js'

const root = document.getElementById('app')

// Screens are picked from the part of the address after #:
// #/ wardrobe, #/add new item, #/item/<id> edit.
async function route() {
  freeUrls()
  window.scrollTo(0, 0)
  const hash = location.hash.replace(/^#/, '') || '/'
  const edit = hash.match(/^\/item\/(.+)$/)
  if (hash === '/add') intakeScreen(root)
  else if (edit) await editScreen(root, decodeURIComponent(edit[1]))
  else await wardrobeScreen(root)
}

addEventListener('hashchange', route)
route()
askToKeepData()
