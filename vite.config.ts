import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
    strictPort: !!process.env.PORT,
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
