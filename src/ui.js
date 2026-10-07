// Tiny helpers for building the screens.

// h('button', { class: 'x', onclick }, 'Label') → <button class="x">Label</button>
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (k in el && k !== 'list') el[k] = v
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c)
  return el
}

// Same as h(), for SVG drawings.
export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v)
  for (const c of children.flat()) if (c != null && c !== false) el.append(c)
  return el
}

// A row of buttons where one (or none) is selected.
export function chips(options, value, onChange) {
  const row = h('div', { class: 'chips', role: 'radiogroup' })
  const render = () => {
    row.replaceChildren(
      ...options.map(([val, label]) =>
        h('button', {
          type: 'button',
          class: 'chip' + (val === value ? ' on' : ''),
          role: 'radio',
          'aria-checked': String(val === value),
          onclick: () => { value = val; render(); onChange(val) },
        }, label),
      ),
    )
  }
  render()
  return row
}

// Object URLs for photos, freed when the screen changes.
const urls = []
export function blobUrl(blob) {
  const u = URL.createObjectURL(blob)
  urls.push(u)
  return u
}
export function freeUrls() {
  while (urls.length) URL.revokeObjectURL(urls.pop())
}
