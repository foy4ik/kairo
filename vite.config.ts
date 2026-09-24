import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  // The web demo lives under a sub-path (github.io/kairo/), so assets must be relative; the desktop build keeps '/'.
  base: process.env.VITE_WEB_DEMO === '1' ? './' : '/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  clearScreen: false,
  server: { host: '127.0.0.1', port: 1420, strictPort: true },
  build: { target: 'es2021', chunkSizeWarningLimit: 900 },
  test: { environment: 'jsdom', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
})
