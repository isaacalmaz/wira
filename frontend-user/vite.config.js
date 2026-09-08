import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    fs: {
      allow: ['..']
    }
  },
  resolve: {
    alias: {
      '@admin': path.resolve(__dirname, '../frontend-admin/src'),
      '@mitra': path.resolve(__dirname, '../frontend-mitra/src'),
      '@user': path.resolve(__dirname, './src'),
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})

