// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listItems: vi.fn(), getImages: vi.fn(), getSetting: vi.fn(), setSetting: vi.fn(),
  createModelView: vi.fn(), garmentTextures: vi.fn(), disposeTextures: vi.fn(), fitFromBlob: vi.fn(),
}))
vi.mock('../src/db.js', () => mocks)
vi.mock('../src/lib/view3d.js', () => ({ createModelView: mocks.createModelView }))
vi.mock('../src/lib/texture3d.js', () => ({ garmentTextures: mocks.garmentTextures, disposeTextures: mocks.disposeTextures }))
vi.mock('../src/lib/fit.js', () => ({ fitFromBlob: mocks.fitFromBlob, validFit: () => false }))
import { model3dScreen } from '../src/screens/model3d.js'

const shirt = { id: 'shirt', category: 'top', colour: { hex: '#a05030', name: 'Rust' } }
const jeans = { id: 'jeans', category: 'bottom' }
let root, view
const click = (text) => [...root.querySelectorAll('button')].find((b) => b.textContent === text).click()
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }

beforeEach(() => {
  vi.resetAllMocks()
  document.body.innerHTML = '<main></main>'
  root = document.querySelector('main')
  view = { update: vi.fn(), dispose: vi.fn(), turn: vi.fn(), reset: vi.fn() }
  mocks.createModelView.mockReturnValue(view)
  mocks.listItems.mockResolvedValue([])
  mocks.getSetting.mockImplementation(async (_, fallback) => fallback)
  mocks.getImages.mockResolvedValue({ cutout: new Blob(['image']) })
  mocks.garmentTextures.mockResolvedValue({ front: {}, fabric: {} })
  mocks.fitFromBlob.mockResolvedValue(null)
  mocks.setSetting.mockResolvedValue()
})

describe('3D studio wardrobe and lifecycle', () => {
  it('starts with editable examples for an empty wardrobe and supports undressing', async () => {
    const stop = await model3dScreen(root)
    expect(view.update.mock.lastCall[1]).toHaveLength(2)
    const styles = root.querySelectorAll('select')
    expect(styles[0].value).toBe('long')
    styles[0].value = 'shirt'
    styles[0].dispatchEvent(new Event('change'))
    await settle()
    expect(mocks.setSetting).toHaveBeenCalledWith('model3dGarments', { 'example-top': { style: 'shirt' } })
    expect(root.querySelectorAll('select')[1].value).toBe('hip')
    expect(view.update.mock.lastCall[1][0].options.ease).toBe(1.14)
    click('Take everything off')
    await settle()
    expect(view.update.mock.lastCall[1]).toEqual([])
    stop()
    stop()
    expect(view.dispose).toHaveBeenCalledTimes(1)
  })

  it('loads saved real clothes, preserves 2D outfit state, and replaces only the selected category', async () => {
    mocks.listItems.mockResolvedValue([shirt, jeans, { id: 'other', category: 'top' }, { id: 'dress', category: 'dress' }])
    mocks.getSetting.mockImplementation(async (key, fallback) => key === 'model3dOutfit' ? ['shirt', 'jeans'] : fallback)
    const stop = await model3dScreen(root)
    expect(view.update.mock.lastCall[1].map(({ item }) => item.id)).toEqual(['shirt', 'jeans'])
    const picks = root.querySelectorAll('.pick-item')
    picks[1].click()
    await settle()
    expect(view.update.mock.lastCall[1].map(({ item }) => item.id)).toEqual(['jeans', 'other'])
    expect(mocks.setSetting).toHaveBeenCalledWith('model3dOutfit', ['jeans', 'other'])
    expect(localStorage.getItem('dollOutfit')).toBeNull()
    stop()
  })

  it('uses a plain garment when a photo fails and exposes the browser fallback', async () => {
    mocks.listItems.mockResolvedValue([shirt])
    mocks.getSetting.mockImplementation(async (key, fallback) => key === 'model3dOutfit' ? ['shirt'] : fallback)
    mocks.getImages.mockRejectedValue(new Error('missing image'))
    const stop = await model3dScreen(root)
    expect(root.querySelector('[role="status"]').textContent).toContain('plain colour')
    expect(view.update.mock.lastCall[1][0].maps).toEqual({})
    stop()
    mocks.createModelView.mockImplementation(() => { throw new Error('No WebGL') })
    const stopFallback = await model3dScreen(root)
    expect(root.querySelector('.model-fallback a').getAttribute('href')).toBe('#/doll')
    expect(root.querySelector('[aria-label="Rotate mannequin"]').disabled).toBe(true)
    stopFallback()
  })

  it('disposes textures that finish loading after navigation without rendering a stale scene', async () => {
    mocks.listItems.mockResolvedValue([shirt])
    mocks.getSetting.mockImplementation(async (key, fallback) => key === 'model3dOutfit' ? ['shirt'] : fallback)
    let resolveTexture
    mocks.garmentTextures.mockImplementation(() => new Promise((resolve) => { resolveTexture = resolve }))
    const controller = new AbortController()
    const rendering = model3dScreen(root, { signal: controller.signal })
    await settle()
    expect(resolveTexture).toBeTypeOf('function')
    controller.abort()
    const maps = { front: {}, fabric: {} }
    resolveTexture(maps)
    await rendering
    await settle()
    expect(view.dispose).toHaveBeenCalledTimes(1)
    expect(view.update).not.toHaveBeenCalled()
    expect(mocks.disposeTextures).toHaveBeenCalledWith(maps)
  })
})
