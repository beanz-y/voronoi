import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // This ensures assets are linked relatively (e.g. "./script.js" instead of "/script.js")
  // This makes the app flexible: it will work on voronoi.site.com OR site.com/voronoi
  base: './', 
})