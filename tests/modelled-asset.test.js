import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { Box3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

describe('authored outfit asset', () => {
  it('loads locally with separately removable garments and finite renderable geometry', async () => {
    const bytes = await readFile(new URL('../src/assets/modelled-outfit.glb', import.meta.url))
    expect(bytes.length).toBeLessThan(2 * 1024 * 1024)
    expect(bytes.toString('ascii', 0, 4)).toBe('glTF')
    expect(bytes.readUInt32LE(4)).toBe(2)
    expect(bytes.readUInt32LE(8)).toBe(bytes.length)
    const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)))
    expect(json.images ?? []).toEqual([])
    expect(json.textures ?? []).toEqual([])
    expect(json.buffers.every((buffer) => !buffer.uri)).toBe(true)
    const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
    for (const name of ['mannequin', 'white-shirt', 'barrel-jeans']) {
      const group = scene.getObjectByName(name)
      expect(group).toBeDefined()
      let faces = 0
      group.traverse((mesh) => {
        if (!mesh.isMesh) return
        const { position, normal } = mesh.geometry.attributes
        expect([...position.array].every(Number.isFinite)).toBe(true)
        expect([...normal.array].every(Number.isFinite)).toBe(true)
        expect(normal.count).toBe(position.count)
        const indices = mesh.geometry.index
        if (indices) expect([...indices.array].every((index) => index < position.count)).toBe(true)
        faces += (indices?.count ?? position.count) / 3
      })
      expect(faces).toBeGreaterThan(1000)
    }
    const bounds = new Box3().setFromObject(scene)
    expect(bounds.min.y).toBeCloseTo(0, 4)
    expect(bounds.max.y).toBeGreaterThan(1.7)
    expect(bounds.max.y).toBeLessThan(1.95)
    expect(bounds.max.x - bounds.min.x).toBeLessThan(1)
    scene.traverse((mesh) => {
      if (!mesh.isMesh) return
      mesh.geometry.dispose()
      mesh.material.dispose()
    })
  })
})
