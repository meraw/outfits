# Modelled clothing sample

Open the 3D studio and select **Try the modelled sample**, or visit `#/3d-sample`.
This is a separate visual prototype: one faceless mannequin wearing an authored
white button-up and charcoal barrel jeans. It uses coherent geometry, plain PBR
materials, a collar, cuffs, buttons, shaped hems and pocket/seam details. There
are no photographs or external models in the asset.

The pose and proportions are fixed. The sample does not adapt wardrobe entries,
simulate cloth or predict real fit. Existing wardrobe choices and the 2D doll
are unaffected. Remove each garment with its button; drag to rotate, pinch to
zoom, or use Front / Turn / Back. Check shoulders, underarms, waistband, crotch,
and back while rotating. On a phone, check loading, touch controls, navigating
away during loading, and reopening after the app has cached the asset offline.

The GLB is about 1.4 MB and 57,000 triangles, below the 2 MB precache limit. It is
loaded only on the sample route and cached by the app service worker. No new
browser runtime dependencies are required.

To regenerate the asset (offline authoring tools; not needed for normal builds):

```sh
python -m pip install -r scripts/modelled-requirements.txt
python scripts/make-modelled-sample.py
npm test
npm run build
```

Automated checks load the actual GLB, validate its geometry and local resources,
and exercise garment toggles, camera controls, cancellation and failure states.
Software inspection covers front, three-quarter and back geometry; mobile WebGL
appearance and performance still require a device check.
