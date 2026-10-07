// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ createModelView: vi.fn(), loadModelledSample: vi.fn(), disposeModel: vi.fn() }))
vi.mock('../src/lib/view3d.js', () => ({ createModelView: mocks.createModelView }))
vi.mock('../src/lib/modelled-sample.js', () => ({ loadModelledSample: mocks.loadModelledSample }))
vi.mock('../src/lib/model3d.js', () => ({ disposeModel: mocks.disposeModel }))
import { modelledSampleScreen } from '../src/screens/modelled-sample.js'
let root, view, groups, model
const button = (label) => [...root.querySelectorAll('button')].find((b) => b.textContent === label)
beforeEach(() => {
  vi.resetAllMocks()
  root = document.createElement('main')
  view = { showModel: vi.fn(), refresh: vi.fn(), dispose: vi.fn(), turn: vi.fn(), reset: vi.fn() }
  groups = { 'white-shirt': { visible: true }, 'barrel-jeans': { visible: true } }
  model = { getObjectByName: (name) => groups[name] }
  mocks.createModelView.mockReturnValue(view)
  mocks.loadModelledSample.mockResolvedValue(model)
})
it('shows the sample, removes garments independently and exposes rotation', async () => {
  const stop = await modelledSampleScreen(root)
  expect(view.showModel).toHaveBeenCalledWith(model, 1.85)
  button('White shirt').click()
  expect(groups['white-shirt'].visible).toBe(false)
  expect(groups['barrel-jeans'].visible).toBe(true)
  expect(button('White shirt').getAttribute('aria-pressed')).toBe('false')
  button('White shirt').click()
  expect(groups['white-shirt'].visible).toBe(true)
  expect(view.refresh).toHaveBeenCalledTimes(2)
  button('Turn').click()
  expect(view.turn).toHaveBeenLastCalledWith(45)
  button('Back').click()
  expect(view.turn).toHaveBeenLastCalledWith(180)
  button('Front').click()
  expect(view.reset).toHaveBeenCalledOnce()
  stop(); stop()
  expect(view.dispose).toHaveBeenCalledOnce()
})
it('disposes late loading after navigation and does not show a stale scene', async () => {
  let resolve
  mocks.loadModelledSample.mockReturnValue(new Promise((done) => { resolve = done }))
  const controller = new AbortController()
  const loading = modelledSampleScreen(root, { signal: controller.signal })
  expect(button('White shirt').disabled).toBe(true)
  controller.abort()
  resolve(model)
  const stop = await loading
  stop()
  expect(view.dispose).toHaveBeenCalledOnce()
  expect(mocks.disposeModel).toHaveBeenCalledWith(model)
  expect(view.showModel).not.toHaveBeenCalled()
})
it('provides a WebGL fallback without requesting the asset', async () => {
  mocks.createModelView.mockImplementation(() => { throw new Error('No WebGL') })
  const stop = await modelledSampleScreen(root)
  expect(root.querySelector('.model-fallback a').getAttribute('href')).toBe('#/doll')
  expect(mocks.loadModelledSample).not.toHaveBeenCalled()
  stop()
})
it('reports load failure and cleans up the renderer', async () => {
  mocks.loadModelledSample.mockRejectedValue(new Error('offline'))
  const stop = await modelledSampleScreen(root)
  expect(root.querySelector('[role="status"]').textContent).toContain('could not be loaded')
  expect(button('Barrel jeans').disabled).toBe(true)
  stop()
  expect(view.dispose).toHaveBeenCalledOnce()
})
