import { h } from '../ui.js'
import { createModelView } from '../lib/view3d.js'
import { loadModelledSample } from '../lib/modelled-sample.js'
import { disposeModel } from '../lib/model3d.js'

export async function modelledSampleScreen(root, { signal } = {}) {
  if (signal?.aborted) return
  let view = null, model = null, stopped = false
  const stage = h('div', { class: 'model-stage modelled-stage' })
  const status = h('p', { class: 'hint model-status', role: 'status', 'aria-live': 'polite' }, 'Loading the model…')
  const angle = h('input', { type: 'range', min: 0, max: 360, step: 1, value: 0, 'aria-label': 'Rotate sample',
    oninput: () => view?.turn(Number(angle.value)),
  })
  const stop = () => {
    if (stopped) return
    stopped = true
    view?.dispose()
    signal?.removeEventListener('abort', stop)
  }
  signal?.addEventListener('abort', stop, { once: true })
  const garments = [['white-shirt', 'White shirt'], ['barrel-jeans', 'Barrel jeans']].map(([name, label]) => {
    const button = h('button', { type: 'button', class: 'chip on', 'aria-pressed': 'true', disabled: true,
      onclick: () => {
        const group = model?.getObjectByName(name)
        if (!group) return
        group.visible = !group.visible
        button.classList.toggle('on', group.visible)
        button.setAttribute('aria-pressed', String(group.visible))
        view?.refresh()
      },
    }, label)
    return button
  })
  root.replaceChildren(
    h('header', { class: 'bar' }, h('a', { href: '#/3d', class: 'back', 'aria-label': 'Back to studio' }, '‹'),
      h('h1', {}, 'Modelled sample')),
    h('p', { class: 'model-intro' }, 'A new clothing style to try: a white button-up and barrel jeans. Drag to turn; pinch to zoom.'),
    stage,
    h('div', { class: 'model-camera row' },
      h('button', { type: 'button', class: 'small', onclick: () => view?.reset() }, 'Front'), angle,
      h('button', { type: 'button', class: 'small', onclick: () => view?.turn(45) }, 'Turn'),
      h('button', { type: 'button', class: 'small', onclick: () => view?.turn(180) }, 'Back')),
    status,
    h('div', { class: 'chips modelled-garments' }, ...garments),
    h('p', { class: 'hint' }, 'Tap a garment to take it off and inspect the model. This sample has a fixed pose and proportions; your wardrobe and saved outfits stay available in the studio.'),
  )
  try {
    view = createModelView(stage, (degrees) => { angle.value = Math.round(degrees) }, { flatFloor: true })
  } catch {
    stage.replaceChildren(h('div', { class: 'model-fallback' }, h('p', {}, '3D could not start on this browser.'),
      h('a', { href: '#/doll', class: 'pill' }, 'Use the paper doll')))
    angle.disabled = true
    status.textContent = ''
    return stop
  }
  try {
    const loaded = await loadModelledSample()
    if (stopped) { disposeModel(loaded); return stop }
    model = loaded
    view.showModel(model, 1.85)
    garments.forEach((button) => { button.disabled = false })
    status.textContent = ''
  } catch {
    if (!stopped) status.textContent = 'The sample could not be loaded. Return to the studio and try again.'
  }
  return stop
}
