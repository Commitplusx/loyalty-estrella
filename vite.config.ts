import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    inspectAttr(), 
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Estrella Delivery Pro',
        short_name: 'Estrella',
        description: 'Billetera digital y entregas.',
        theme_color: '#f97316',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        // Bug #27 fix: separate 'any' and 'maskable' into two entries.
        // SVG cannot be 'maskable' per PWA spec — only raster PNG can.
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
        ],
      },
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true, // Expone en la red local (0.0.0.0) para acceder desde el celular
  },
});
