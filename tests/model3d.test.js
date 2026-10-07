import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { modelDimensions, garmentOptions, loftGeometry, buildMannequin, buildGarment, disposeModel } from '../src/lib/model3d.js'
import { trousersGeometry } from '../src/lib/trousers3d.js'
import { textureRegions, silhouetteSpans } from '../src/lib/texture3d.js'

const top = { id: 'top', category: 'top' }, bottom = { id: 'bottom', category: 'bottom' }
const boundsOf = (model) => new THREE.Box3().setFromObject(model)

describe('3D mannequin and garment templates', () => {
  it('changes torso and leg lengths independently and clamps stored proportions', () => {
    const base = modelDimensions(), torso = modelDimensions({ torso: 1.25 }), legs = modelDimensions({ legs: 1.25 })
    expect(torso.waist).toBe(base.waist)
    expect(torso.shoulder).toBeGreaterThan(base.shoulder)
    expect(legs.shoulder - legs.waist).toBeCloseTo(base.shoulder - base.waist)
    expect(legs.waist).toBeGreaterThan(base.waist)
    expect(modelDimensions({ bust: 100, waist: -2 }).s).toMatchObject({ bust: 1.25, waist: 0.8 })
  })

  it('accepts only known garment settings and bounded looseness', () => {
    expect(garmentOptions(top, { sleeves: { left: { fullLength: true } } })).toMatchObject({ style: 'long' })
    expect(garmentOptions(top, null, { style: 'bad', length: 'floor', ease: 400 })).toEqual({ style: 'tee', length: 'waist', ease: 1.3 })
    expect(garmentOptions({ ...bottom, hemLength: 'calf' }, null)).toMatchObject({ length: 'calf' })
  })

  it('generates finite, nondegenerate surfaces and UVs with outward front normals', () => {
    const models = [buildMannequin(), ...['tee', 'long', 'shirt'].flatMap((style) =>
      ['cropped', 'waist', 'hip'].map((length) => buildGarment(top, { style, length, ease: 1.08 }))),
    ...['wide', 'straight', 'barrel'].flatMap((style) => ['short', 'calf', 'ankle', 'floor'].map((length) =>
      buildGarment(bottom, { style, length, ease: 1.08 })))]
    for (const model of models) {
      model.traverse((obj) => {
        if (!obj.geometry) return
        for (const key of ['position', 'normal', 'uv']) expect([...obj.geometry.getAttribute(key).array].every(Number.isFinite)).toBe(true)
      })
      expect(boundsOf(model).isEmpty()).toBe(false)
      disposeModel(model)
    }
    const geometry = loftGeometry([[0, 1, 0.2, 0.1], [0, 0, 0.2, 0.1]])
    expect(geometry.getAttribute('normal').getZ(8)).toBeGreaterThan(0.9)
    expect(geometry.groups).toHaveLength(2)
  })

  it('keeps wide trousers broader and floor hems lower than cropped ones', () => {
    const wide = boundsOf(buildGarment(bottom, { style: 'wide', length: 'floor', ease: 1.08 }))
    const short = boundsOf(buildGarment(bottom, { style: 'straight', length: 'short', ease: 1.08 }))
    expect(wide.min.y).toBeCloseTo(0.06)
    expect(short.min.y).toBeGreaterThan(0.6)
    const long = boundsOf(buildGarment(top, { style: 'long', length: 'waist', ease: 1.08 }))
    const tee = boundsOf(buildGarment(top, { style: 'tee', length: 'waist', ease: 1.08 }))
    expect(long.min.y).toBeLessThan(tee.min.y)
  })

  it('covers the mannequin at sleeve attachments and the trouser crotch', () => {
    for (const shape of [{}, { shoulders: 1.25, hips: 1.25, torso: 0.8, legs: 1.25 }]) {
      const d = modelDimensions(shape), body = buildMannequin(shape)
      const shirt = buildGarment(top, { style: 'long', length: 'waist', ease: 1.02 }, shape)
      const pants = buildGarment(bottom, { style: 'wide', length: 'floor', ease: 1.02 }, shape)
      for (const [clothes, x, y] of [[shirt, d.shoulders - 0.015, d.shoulder + 0.025], [pants, 0, d.crotch + 0.015]]) {
        body.updateMatrixWorld(true)
        clothes.updateMatrixWorld(true)
        const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 2), new THREE.Vector3(0, 0, -1))
        const bodyHit = ray.intersectObject(body, true)[0]
        const clothHit = ray.intersectObject(clothes, true)[0]
        expect(bodyHit).toBeDefined()
        expect(clothHit).toBeDefined()
        expect(clothHit.distance).toBeLessThan(bodyHit.distance)
      }
      disposeModel(body); disposeModel(shirt); disposeModel(pants)
    }
  })

  it('maps the entire waistband photo onto one continuous trouser surface', () => {
    const d = modelDimensions(), geometry = trousersGeometry(d, { style: 'barrel', length: 'floor', ease: 1.08 })
    const uv = geometry.getAttribute('uv'), front = geometry.groups[0], index = geometry.getIndex()
    const samples = []
    for (let i = front.start; i < front.start + front.count; i++) samples.push(uv.getY(index.getX(i)))
    expect(Math.min(...samples)).toBeCloseTo(0)
    expect(Math.max(...samples)).toBeCloseTo(1)
    const pants = buildGarment(bottom, { style: 'barrel', length: 'floor', ease: 1.08 })
    expect(pants.children).toHaveLength(1)
    pants.updateMatrixWorld(true)
    for (const y of [d.waist, d.hip, d.crotch + 0.01]) {
      const hits = new THREE.Raycaster(new THREE.Vector3(0.015, y, 2), new THREE.Vector3(0, 0, -1)).intersectObject(pants, true)
      expect(hits[0].face.normal.z).toBeGreaterThan(0)
    }
    disposeModel(pants); geometry.dispose()
  })

  it('gives barrel trousers volume through the leg and a narrower hem', () => {
    const g = trousersGeometry(modelDimensions(), { style: 'barrel', length: 'floor', ease: 1.08 })
    const p = g.getAttribute('position'), widths = new Map()
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i)
      widths.set(y, Math.max(widths.get(y) || 0, Math.abs(p.getX(i))))
    }
    const rows = [...widths].sort((a, b) => a[0] - b[0])
    expect(rows[1][1]).toBeGreaterThan(rows[0][1] * 1.2)
    g.dispose()
  })

  it('gives shirts a relaxed hip-length default and uses a single photographed button row', () => {
    expect(garmentOptions(top, null, { style: 'shirt' })).toMatchObject({ style: 'shirt', length: 'hip', ease: 1.14 })
    expect(garmentOptions(top, null, { style: 'shirt', length: 'cropped', ease: 1.03 })).toMatchObject({ length: 'cropped', ease: 1.03 })
    const photo = new THREE.Texture()
    const shirt = buildGarment(top, garmentOptions(top, null, { style: 'shirt' }), {}, { front: photo, shirtFront: photo })
    const buttonSpheres = shirt.children.filter((m) => m.geometry.type === 'SphereGeometry' && m.scale.x < 0.01)
    expect(buttonSpheres).toHaveLength(0)
    const knitted = buildGarment(top, garmentOptions(top, null, { style: 'long', length: 'hip' }))
    const widthAt = (model, y) => {
      const p = model.children[0].geometry.getAttribute('position')
      let width = 0
      for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i) - y) < 0.001) width = Math.max(width, Math.abs(p.getX(i)))
      return width
    }
    expect(widthAt(shirt, modelDimensions().waist + 0.1)).toBeGreaterThan(widthAt(knitted, modelDimensions().waist + 0.1))
    disposeModel(shirt); disposeModel(knitted); photo.dispose()
  })

  it('keeps an untucked button-up in front of loose trousers', () => {
    const d = modelDimensions()
    const shirt = buildGarment(top, { style: 'shirt', length: 'hip', ease: 1.02, lowerEase: 1.3 })
    const pants = buildGarment(bottom, { style: 'barrel', length: 'floor', ease: 1.3 })
    shirt.updateMatrixWorld(true); pants.updateMatrixWorld(true)
    for (const [x, y] of [[0, d.hip], [0.14, d.hip], [0, d.waist]]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 2), new THREE.Vector3(0, 0, -1))
      const topHit = ray.intersectObject(shirt, true)[0], bottomHit = ray.intersectObject(pants, true)[0]
      expect(topHit).toBeDefined(); expect(bottomHit).toBeDefined()
      expect(topHit.distance).toBeLessThan(bottomHit.distance)
    }
    disposeModel(shirt); disposeModel(pants)
  })

  it('follows a narrow waistband and broader hips when sampling a flat trouser photo', () => {
    const data = new Uint8ClampedArray(20 * 3 * 4)
    for (const [y, l, r] of [[0, 6, 14], [1, 2, 18]]) for (let x = l; x < r; x++) data[(y * 20 + x) * 4 + 3] = 255
    expect(silhouetteSpans(data, 20, 3)).toEqual([[0.3, 0.7], [0.1, 0.9], null])
    const regions = textureRegions({ anchor: { left: 0.3, right: 0.7 }, bounds: { x: 0.1, y: 0, width: 0.8, height: 1 } }, 'bottom')
    expect(regions.front.width).toBeCloseTo(0.8)
  })

  it('disposes shared model resources once while preserving cached textures', () => {
    const group = new THREE.Group(), geometry = new THREE.BoxGeometry(), texture = new THREE.Texture()
    const material = new THREE.MeshStandardMaterial({ map: texture })
    group.add(new THREE.Mesh(geometry, [material, material]), new THREE.Mesh(geometry, material))
    const g = vi.spyOn(geometry, 'dispose'), m = vi.spyOn(material, 'dispose'), t = vi.spyOn(texture, 'dispose')
    disposeModel(group)
    expect(g).toHaveBeenCalledTimes(1)
    expect(m).toHaveBeenCalledTimes(1)
    expect(t).not.toHaveBeenCalled()
  })

  it('uses the torso for top graphics rather than stretching sleeves across the front', () => {
    const fit = { anchor: { left: 0.3, right: 0.7 }, bounds: { x: 0.02, y: 0.03, width: 0.96, height: 0.94 } }
    const regions = textureRegions(fit, 'top')
    expect(regions.front).toMatchObject({ x: 0.3, y: 0.03, height: 0.94 })
    expect(regions.front.width).toBeCloseTo(0.4)
    expect(regions.fabric.x).toBeGreaterThan(0.3)
    expect(regions.fabric.x + regions.fabric.width).toBeLessThan(0.7)
    expect(textureRegions(fit, 'bottom').front.height).toBeLessThan(0.3)
  })
})
