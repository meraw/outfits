import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { buildMannequin, buildGarment, disposeModel, modelDimensions } from './model3d.js'

export function createModelView(host, onTurn = () => {}, { flatFloor = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  const canvas = renderer.domElement
  canvas.setAttribute('role', 'img')
  canvas.setAttribute('aria-label', '3D outfit preview. Drag to rotate, pinch to zoom, or use the view buttons.')
  host.append(canvas)
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20)
  camera.position.set(0, 1.12, 3)
  const controls = new OrbitControls(camera, canvas)
  controls.target.set(0, 0.93, 0)
  controls.enablePan = false
  controls.minZoom = 0.75
  controls.maxZoom = 1.7
  controls.minPolarAngle = Math.PI * 0.3
  controls.maxPolarAngle = Math.PI * 0.62
  controls.update()
  scene.add(new THREE.HemisphereLight('#fff5e5', '#b8a492', 2.1))
  const key = new THREE.DirectionalLight('#fff6ed', 3)
  key.position.set(-2, 3, 4)
  key.castShadow = true
  key.shadow.mapSize.set(512, 512)
  Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 2.5, bottom: -0.5, near: 0.1, far: 10 })
  key.shadow.normalBias = 0.025
  scene.add(key)
  const fill = new THREE.DirectionalLight('#e2edff', 1.1)
  fill.position.set(3, 2, -2)
  scene.add(fill)
  const plinth = new THREE.Mesh(flatFloor ? new THREE.CircleGeometry(0.58, 64) : new THREE.CylinderGeometry(0.53, 0.55, 0.045, 64),
    new THREE.MeshStandardMaterial({ color: '#e8dfd3', roughness: 1 }))
  plinth.position.y = flatFloor ? -0.002 : -0.027
  if (flatFloor) plinth.rotation.x = -Math.PI / 2
  plinth.receiveShadow = true
  scene.add(plinth)
  let model = null, frame = null, disposed = false, height = 1.95
  const render = () => {
    if (disposed || frame != null) return
    frame = requestAnimationFrame(() => { frame = null; if (!disposed) renderer.render(scene, camera) })
  }
  const resize = () => {
    if (disposed) return
    const width = Math.max(1, host.clientWidth), pixels = Math.max(1, host.clientHeight)
    const halfHeight = height / 2, halfWidth = Math.max(0.61, halfHeight * width / pixels)
    const fittedHeight = halfWidth / (width / pixels)
    Object.assign(camera, { left: -halfWidth, right: halfWidth, top: fittedHeight, bottom: -fittedHeight })
    camera.updateProjectionMatrix()
    renderer.setSize(width, pixels)
    render()
  }
  controls.addEventListener('change', () => {
    onTurn(((THREE.MathUtils.radToDeg(controls.getAzimuthalAngle()) % 360) + 360) % 360)
    render()
  })
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  const lost = (event) => { event.preventDefault(); host.dataset.contextLost = 'true' }
  const restored = () => { delete host.dataset.contextLost; render() }
  canvas.addEventListener('webglcontextlost', lost)
  canvas.addEventListener('webglcontextrestored', restored)
  resize()
  const showModel = (next, top = 1.85) => {
    if (disposed) { disposeModel(next); return }
    if (model) { scene.remove(model); disposeModel(model) }
    model = next
    scene.add(model)
    height = top + 0.2
    controls.target.y = top / 2 - 0.025
    controls.update()
    resize()
  }
  return {
    showModel,
    refresh: render,
    update(shape, garments) {
      if (disposed) return
      if (model) { scene.remove(model); disposeModel(model) }
      model = new THREE.Group()
      model.add(buildMannequin(shape))
      const lowerEase = garments.find(({ item }) => item.category === 'bottom')?.options.ease
      for (const { item, options, maps } of garments) model.add(buildGarment(item, { ...options, lowerEase }, shape, maps))
      scene.add(model)
      const dimensions = modelDimensions(shape)
      height = dimensions.top + 0.2
      controls.target.y = dimensions.top / 2 - 0.025
      controls.update()
      resize()
    },
    turn(degrees) {
      if (disposed) return
      const theta = THREE.MathUtils.degToRad(degrees)
      camera.position.set(Math.sin(theta) * 3, controls.target.y + 0.19, Math.cos(theta) * 3)
      controls.update()
      render()
    },
    reset() { camera.zoom = 1; camera.updateProjectionMatrix(); this.turn(0) },
    dispose() {
      if (disposed) return
      disposed = true
      if (frame != null) cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      canvas.removeEventListener('webglcontextlost', lost)
      canvas.removeEventListener('webglcontextrestored', restored)
      if (model) disposeModel(model)
      disposeModel(plinth)
      key.shadow.map?.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    },
  }
}
