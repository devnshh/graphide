import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Webview build config: single bundle, relative paths, no code splitting
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Single JS + CSS file for simple webview loading
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  server: {
    cors: true,
  },
})
