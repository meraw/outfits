import * as THREE from 'three'

// One surface from waistband through the crotch into both legs. Above the
// crotch the two front panels meet at the fly; below it they become inseams.
// This avoids a pelvis tube intersecting two independently drawn leg tubes.
export function trousersGeometry(d, options) {
  const ease = options.ease
  const barrel = options.style === 'barrel', wide = options.style === 'wide'
  const end = { short: d.crotch - 0.13, calf: 0.3 * d.s.legs, ankle: 0.12, floor: 0.06 }[options.length]
  const crotch = d.crotch - 0.065
  const waist = Math.max(d.waistWidth * 1.06, d.hips * 0.75) * ease
  const hip = d.hips * ease
  const splitWidth = hip * 1.01
  const leg = crotch - end
  const centre = hip * (barrel ? 0.59 : 0.53)
  const thigh = splitWidth / 2
  const hemRadius = wide ? hip * 0.48 : hip * 0.29
  // [height, total half width / leg centre, depth, split amount / leg radius]
  const upper = [
    [d.waist + 0.02, waist, 0.118 * ease, 0],
    [d.waist - 0.015, waist, 0.12 * ease, 0],
    [d.hip + 0.035, hip * 0.97, 0.145 * ease, 0],
    [d.hip, hip, 0.145 * ease, 0.08],
    [d.crotch + 0.005, splitWidth, 0.142 * ease, 0.22],
    [crotch, splitWidth, 0.132 * ease, 1],
  ]
  const lower = [
    [crotch - leg * 0.28, centre, (barrel ? 0.145 : 0.12) * ease, barrel ? hip * 0.55 : wide ? thigh : hip * 0.4],
    [crotch - leg * 0.64, centre, (barrel ? 0.14 : 0.105) * ease, barrel ? hip * 0.55 : wide ? thigh : hip * 0.34],
    [end, centre, wide ? 0.115 * ease : 0.073 * ease, hemRadius],
  ]
  const rows = [...upper, ...lower], steps = 24
  const positions = [], uvs = [], groups = [[], []]
  for (const side of [-1, 1]) for (const face of [1, -1]) {
    const offset = positions.length / 3
    rows.forEach(([y, width, depth, split], row) => {
      const isUpper = row < upper.length
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, angle = Math.PI * t
        const x = isUpper
          ? side * (width * (1 - t) * (1 - split) + width / 2 * (1 + Math.cos(angle)) * split)
          : side * (width + split * Math.cos(angle))
        const z = face * depth * (isUpper
          ? (1 - split) * Math.sqrt(Math.max(0, 1 - (1 - t) ** 2)) + split * Math.sin(angle)
          : Math.sin(angle))
        positions.push(x, y, z)
        // The pelvis map already contains just the upper garment: consume
        // its full height once, rather than cropping that crop a second time.
        const u = isUpper ? (x / width + 1) / 2 : t
        const v = isUpper ? 1 - (upper[0][0] - y) / (upper[0][0] - crotch) : 1 - (crotch - y) / leg
        uvs.push(u, v)
      }
    })
    for (let row = 0; row < rows.length - 1; row++) for (let i = 0; i < steps; i++) {
      const a = offset + row * (steps + 1) + i, b = a + steps + 1
      const indices = side * face > 0 ? [a, a + 1, b, b, a + 1, b + 1] : [a, b, a + 1, b, b + 1, a + 1]
      const frontPelvis = face === 1 && row < upper.length - 1
      groups[frontPelvis ? 0 : 1].push(...indices)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex([...groups[0], ...groups[1]])
  geometry.addGroup(0, groups[0].length, 0)
  geometry.addGroup(groups[0].length, groups[1].length, 1)
  geometry.computeVertexNormals()
  // Separate UV panels share edge positions. Average their normals to keep
  // the fly and side seams smooth without sacrificing texture coordinates.
  const normal = geometry.getAttribute('normal'), buckets = new Map()
  for (let i = 0; i < positions.length / 3; i++) {
    const key = positions.slice(i * 3, i * 3 + 3).map((v) => Math.round(v * 1e6)).join(',')
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(i)
  }
  for (const ids of buckets.values()) {
    const n = new THREE.Vector3()
    ids.forEach((i) => n.add(new THREE.Vector3().fromBufferAttribute(normal, i)))
    if (n.lengthSq() < 1e-8) continue
    n.normalize()
    ids.forEach((i) => normal.setXYZ(i, n.x, n.y, n.z))
  }
  geometry.userData.pelvisRows = upper.length
  return geometry
}
