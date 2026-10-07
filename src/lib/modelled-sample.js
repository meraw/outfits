import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export const MODELLED_SAMPLE_URL = new URL('../assets/modelled-outfit.glb', import.meta.url).href

export async function loadModelledSample() {
  const { scene } = await new GLTFLoader().loadAsync(MODELLED_SAMPLE_URL)
  scene.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })
  return scene
}
