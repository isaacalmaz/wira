import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Konfigurasi Vite untuk Wira Admin
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001, // Port berbeda dari frontend user (3000)
  }
})
