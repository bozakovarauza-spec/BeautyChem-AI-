import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// public/ папкасы жоба түбірінде (manifest.json, service-worker.js, icons/)
export default defineConfig({
  plugins: [react()],
  publicDir: '../public',
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
  server: {
    host: true, // жергілікті желідегі телефоннан ашуға болады
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
  preview: { host: true, port: 4173, proxy: { '/api': 'http://localhost:3001' } },
});
