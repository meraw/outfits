import * as THREE from 'three'
import { DEFAULT_SHAPE, SHAPE_MIN, SHAPE_MAX } from './doll.js'

const clamp = (v, min, max) => Math.max(min, Math.min(max, v))
export const TOP_STYLES = [['tee', 'T-shirt'], ['long', 'Long sleeves'], ['shirt', 'Shirt']]
export const TOP_LENGTHS = [['cropped', 'Cropped'], ['waist', 'Waist'], ['hip', 'Hip']]
export const LEG_STYLES = [['straight', 'Straight'], ['wide', 'Wide leg']]
export const LEG_LENGTHS = [['short', 'Short'], ['calf', 'Calf'], ['ankle', 'Ankle'], ['floor', 'Floor']]

export function modelDimensions(shape = {}) {
  const s = Object.fromEntries(Object.keys(DEFAULT_SHAPE).map((key) => [key,
    clamp(Number(shape[key]) || 1, SHAPE_MIN, SHAPE_MAX)]))
  const waist = 0.82 + 0.23 * s.legs
  const shoulder = waist + 0.38 * s.torso
  return { s, waist, shoulder, hip: waist - 0.13, crotch: waist - 0.25,
    shoulders: 0.245 * s.shoulders, bust: 0.225 * s.bust,
    waistWidth: 0.17 * s.waist, hips: 0.235 * s.hips,
    head: shoulder + 0.235, top: shoulder + 0.425 }
}

export function garmentOptions(item, fit, saved = {}) {
  const top = item.category === 'top'
  const options = top ? {
    style: fit?.sleeves && Object.values(fit.sleeves).some((s) => s.fullLength) ? 'long' : 'tee',
    length: 'waist', ease: 1.08,
  } : { style: 'wide', length: ['short', 'calf', 'ankle', 'floor'].includes(item.hemLength) ? item.hemLength : 'floor', ease: 1.08 }
  const styles = top ? TOP_STYLES : LEG_STYLES, lengths = top ? TOP_LENGTHS : LEG_LENGTHS
  if (styles.some(([key]) => key === saved.style)) options.style = saved.style
  if (lengths.some(([key]) => key === saved.length)) options.length = saved.length
  options.ease = clamp(Number(saved.ease) || options.ease, 1.02, 1.3)
  return options
}

// Elliptical rings with separate front/back materials. Front UVs use a planar
// projection so graphics stay centred instead of wrapping twice around a tube.
export function loftGeometry(rings, segments = 32, uvRange = [0, 1]) {
  const positions = [], uvs = [], indices = []
  const firstY = rings[0][1], lastY = rings.at(-1)[1]
  for (const [cx, y, rx, rz] of rings) {
    for (let i = 0; i <= segments; i++) {
      const angle = -Math.PI / 2 + i / segments * Math.PI * 2
      positions.push(cx + rx * Math.sin(angle), y, rz * Math.cos(angle))
      const front = i <= segments / 2
      const u = front ? (Math.sin(angle) + 1) / 2 : (1 - Math.sin(angle)) / 2
      const t = (y - firstY) / (lastY - firstY)
      uvs.push(u, 1 - (uvRange[0] + t * (uvRange[1] - uvRange[0])))
    }
  }
  const geometry = new THREE.BufferGeometry()
  // Group front and back independently without changing vertex sharing.
  for (const half of [0, 1]) {
    const start = indices.length
    for (let row = 0; row < rings.length - 1; row++) {
      for (let i = half * segments / 2; i < (half + 1) * segments / 2; i++) {
        const a = row * (segments + 1) + i, b = a + segments + 1
        indices.push(a, b, a + 1, b, b + 1, a + 1)
      }
    }
    geometry.addGroup(start, indices.length - start, half)
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

const material = (colour, extra = {}) => new THREE.MeshStandardMaterial({ color: colour, roughness: 0.88, ...extra })
const mesh = (geometry, materials) => {
  const m = new THREE.Mesh(geometry, materials)
  m.castShadow = true
  m.receiveShadow = true
  return m
}
function ellipsoid(group, centre, scale, mat) {
  const m = mesh(new THREE.SphereGeometry(1, 24, 16), mat)
  m.position.set(...centre)
  m.scale.set(...scale)
  group.add(m)
}
function limb(group, a, b, ra, rb, mat) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b)
  const m = mesh(new THREE.CylinderGeometry(ra, rb, start.distanceTo(end), 20, 1, true), mat)
  m.position.copy(start).add(end).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), start.sub(end).normalize())
  group.add(m)
}

export function buildMannequin(shape = {}) {
  const d = modelDimensions(shape), group = new THREE.Group(), skin = material('#d9c5b3')
  const body = [
    [0, d.shoulder, d.shoulders * 0.84, 0.095],
    [0, d.shoulder - 0.075, d.bust, 0.125],
    [0, d.waist + 0.1, d.waistWidth * 1.04, 0.1],
    [0, d.waist, d.waistWidth, 0.095],
    [0, d.hip, d.hips, 0.125],
    [0, d.crotch, d.hips * 0.72, 0.085],
  ]
  group.add(mesh(loftGeometry(body), [skin, skin]))
  limb(group, [0, d.shoulder + 0.11, 0], [0, d.shoulder - 0.015, 0], 0.055, 0.07, skin)
  ellipsoid(group, [0, d.head, 0], [0.125, 0.175, 0.115], skin)
  for (const side of [-1, 1]) {
    const a = [side * (d.shoulders - 0.015), d.shoulder - 0.01, 0]
    const b = [side * (d.shoulders + 0.045), d.shoulder - 0.23 * d.s.torso, 0.015]
    const c = [side * (d.shoulders + 0.085), d.shoulder - 0.43 * d.s.torso, 0.025]
    ellipsoid(group, a, [0.065, 0.07, 0.065], skin)
    limb(group, a, b, 0.06, 0.045, skin)
    ellipsoid(group, b, [0.047, 0.05, 0.045], skin)
    limb(group, b, c, 0.045, 0.032, skin)
    ellipsoid(group, [c[0], c[1] - 0.035, c[2]], [0.034, 0.055, 0.024], skin)
    const x = side * d.hips * 0.48
    group.add(mesh(loftGeometry([
      [x, d.crotch + 0.08, 0.108 * d.s.hips, 0.1],
      [x, d.crotch - 0.06, 0.092 * d.s.hips, 0.09],
      [x, 0.46 * d.s.legs, 0.067, 0.065],
      [x, 0.3 * d.s.legs, 0.07, 0.068],
      [x, 0.095, 0.042, 0.043],
    ]), [skin, skin]))
    ellipsoid(group, [x, 0.06, 0.04], [0.052, 0.055, 0.105], skin)
  }
  return group
}

export function buildGarment(item, options, shape = {}, maps = {}) {
  const d = modelDimensions(shape), group = new THREE.Group()
  const colour = /^#[0-9a-f]{6}$/i.test(item.colour?.hex ?? '') ? item.colour.hex : item.category === 'top' ? '#b86b4d' : '#435164'
  const front = material(maps.front ? '#ffffff' : colour, { map: maps.front || null, side: THREE.DoubleSide })
  const fabric = material(maps.fabric ? '#ffffff' : colour, { map: maps.fabric || null, side: THREE.DoubleSide })
  const ease = options.ease
  if (item.category === 'top') {
    const hem = options.length === 'cropped' ? d.waist + 0.09 : options.length === 'hip' ? d.hip - 0.01 : d.waist + 0.015
    const halfHem = hem < d.waist ? d.hips * ease : d.waistWidth * ease
    const rings = [
      [0, d.shoulder + 0.025, 0.08, 0.065],
      [0, d.shoulder - 0.012, d.shoulders * ease, 0.105 * ease],
      [0, d.shoulder - 0.085, d.bust * ease, 0.133 * ease],
      [0, Math.max(hem, d.waist + 0.1), d.waistWidth * ease * 1.12, 0.108 * ease],
      [0, hem, halfHem, 0.105 * ease],
    ]
    // Cropped hems can coincide with the penultimate ring.
    const unique = rings.filter((r, i) => !i || r[1] < rings[i - 1][1] - 0.001)
    group.add(mesh(loftGeometry(unique), [front, fabric]))
    for (const side of [-1, 1]) {
      const a = [side * d.shoulders * 0.91, d.shoulder - 0.018, 0]
      const elbow = [side * (d.shoulders + 0.045), d.shoulder - 0.23 * d.s.torso, 0.015]
      const wrist = [side * (d.shoulders + 0.085), d.shoulder - 0.415 * d.s.torso, 0.025]
      const short = a.map((v, i) => v + (elbow[i] - v) * 0.58)
      ellipsoid(group, a, [0.076 * ease, 0.079 * ease, 0.076 * ease], fabric)
      limb(group, a, options.style === 'tee' ? short : elbow, 0.071 * ease, 0.06 * ease, fabric)
      if (options.style !== 'tee') {
        ellipsoid(group, elbow, [0.061 * ease, 0.055, 0.061 * ease], fabric)
        limb(group, elbow, wrist, 0.06 * ease, 0.042 * ease, fabric)
      }
    }
    if (options.style === 'shirt') {
      // A simple collar and placket distinguish the shirt template.
      for (const side of [-1, 1]) {
        const collar = mesh(new THREE.BoxGeometry(0.075, 0.07, 0.015), fabric)
        collar.position.set(side * 0.048, d.shoulder + 0.014, 0.068)
        collar.rotation.z = side * 0.38
        group.add(collar)
      }
      const button = material('#e8dfd1')
      for (let y = d.shoulder - 0.08; y > hem + 0.03; y -= 0.07) {
        const row = unique.findIndex((r, i) => i && y <= unique[i - 1][1] && y >= r[1])
        const above = unique[row - 1], below = unique[row]
        const fraction = (above[1] - y) / (above[1] - below[1])
        const depth = above[3] + (below[3] - above[3]) * fraction
        ellipsoid(group, [0, y, depth + 0.005], [0.007, 0.007, 0.005], button)
      }
    }
  } else if (item.category === 'bottom') {
    const wide = options.style === 'wide'
    const end = { short: d.crotch - 0.13, calf: 0.3 * d.s.legs, ankle: 0.12, floor: 0.06 }[options.length]
    group.add(mesh(loftGeometry([
      [0, d.waist + 0.01, Math.max(d.waistWidth, d.hips * 0.84) * ease, 0.112 * ease],
      [0, d.hip, d.hips * ease, 0.14 * ease],
      [0, d.crotch + 0.025, d.hips * ease * 0.93, 0.123 * ease],
      [0, d.crotch - 0.035, d.hips * ease * 0.75, 0.112 * ease],
    ], 32, [0, 0.24]), [front, fabric]))
    for (const side of [-1, 1]) {
      const x = side * d.hips * 0.5
      const radius = wide ? 0.126 * d.s.hips * ease : 0.105 * d.s.hips * ease
      group.add(mesh(loftGeometry([
        [x, d.crotch + 0.08, radius, 0.129 * ease],
        [x, Math.max(end + 0.015, d.crotch - 0.1), radius, 0.12 * ease],
        [x, end, wide ? radius * 0.95 : 0.068 * ease, wide ? 0.115 * ease : 0.07 * ease],
      ], 32, [0.2, 1]), [fabric, fabric]))
    }
  }
  group.userData.itemId = item.id
  return group
}

export function disposeModel(group) {
  const geometries = new Set(), materials = new Set()
  group.traverse((obj) => {
    if (obj.geometry) geometries.add(obj.geometry)
    if (obj.material) for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) materials.add(mat)
  })
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((mat) => mat.dispose())
  // Texture ownership belongs to the screen cache; rebuilding a model must
  // not invalidate the same garment's texture used by its next model.
}
