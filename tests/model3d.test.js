import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { modelDimensions, garmentOptions, loftGeometry, buildMannequin, buildGarment, disposeModel } from '../src/lib/model3d.js'
import { textureRegions } from '../src/lib/texture3d.js'

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
    ...['wide', 'straight'].flatMap((style) => ['short', 'calf', 'ankle', 'floor'].map((length) =>
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
