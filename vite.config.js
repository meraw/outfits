import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/outfits/', // GitHub Pages serves the site at meraw.github.io/outfits/
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png'],
      manifest: {
        name: 'Outfits',
        short_name: 'Outfits',
        description: 'My wardrobe and daily outfits',
        start_url: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#faf6f0',
        theme_color: '#faf6f0',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The background remover's engine (~24 MB .wasm) isn't downloaded at
        // install; it's fetched the first time a photo is added, then kept.
        // Its model files are cached by the library itself.
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\.wasm$/,
            handler: 'CacheFirst',
            options: { cacheName: 'engine', expiration: { maxEntries: 4 } },
          },
          {
            // The background remover's model and engine (~110 MB in ~30
            // pieces). The library only relies on the browser's normal
            // cache, which phones clear often, so it kept re-downloading.
            // Keeping them here means they download once.
            urlPattern: ({ url }) => url.hostname === 'staticimgly.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'background-remover',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 80 },
            },
          },
        ],
      },
    }),
  ],
  test: { environment: 'node' },
})
