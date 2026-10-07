# 3D studio prototype

Open **Doll → Try 3D studio** (`#/3d`). The existing paper doll remains available.

This version uses a stylized mannequin and procedural garment templates: T-shirt,
long-sleeved top, shirt, straight trousers and wide-leg trousers. Select a wardrobe
item, choose its shape and length, and adjust looseness. Body proportions are
shared with the paper doll; the 3D outfit and garment adjustments are saved
separately in IndexedDB settings. No existing garment records or images are rewritten.

The front of each garment is textured from its locally stored cutout. Sleeves,
trouser legs and backs repeat a small fabric sample. Missing images use a plain
colour. These are approximations, not reconstructions or fit predictions. Skirts,
dresses, shoes, accessories and layered outfits are outside this first version.
No photos are sent to a server, and no external model downloads are required.

## Run and check

- `npm ci`
- `npm test`
- `npm run dev` and open `/outfits/#/3d`
- `npm run build`

On a phone with WebGL 2:

1. Try the example outfit. Drag to rotate, pinch to zoom, then use Front and Back.
2. Select a real top and trousers. Check the front photo and approximate fabric
   on the sleeves, legs and back.
3. Change shirt type, garment lengths and looseness. Reload: the choices and
   worn items should remain.
4. Change body proportions, then check the paper doll uses the same settings.
5. Take everything off. Return to the wardrobe and reopen the studio several
   times, including leaving while a photo is loading.
6. Check portrait and landscape layouts. With WebGL unavailable, the paper-doll
   fallback should appear.

The Three.js chunk loads when entering the studio; the service worker includes
it for offline use. Rendering is requested only when the scene or camera changes.
Navigation releases controls, resize observation, GPU resources and pending
texture results. The tests cover geometry, attachment coverage, options, image
crop regions, wardrobe selection, failed photo loading and asynchronous cleanup.
