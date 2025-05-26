import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:9999',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:9999',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: '../api/public',
    emptyOutDir: true,
    assetsDir: 'assets',
  },
})