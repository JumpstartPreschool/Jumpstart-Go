import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'brand/*.webp'],
      manifest: {
        name: 'Jumpstart',
        short_name: 'Jumpstart',
        description: 'Pickups, drop-offs and attendance for Jumpstart Preschool',
        id: '/',
        scope: '/',
        start_url: '/',
        display: 'standalone',
        orientation: 'any',
        categories: ['education'],
        lang: 'en-IN',
        background_color: '#fff8f0',
        theme_color: '#fff8f0',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  // Lets a Cloudflare Quick Tunnel (https://….trycloudflare.com) reach `vite preview` for iPad testing.
  preview: { allowedHosts: ['.trycloudflare.com'] },
  test: { include: ['src/**/*.test.ts', 'supabase/functions/**/*.test.ts'] },
})
