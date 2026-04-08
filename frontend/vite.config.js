import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

const devHost = process.env.VITE_DEV_HOST || '172.22.12.162'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    basicSsl(),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    hmr: {
      host: devHost,
      protocol: 'wss',
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/whisper': {
        target: 'http://172.22.12.162:8787',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/whisper/, ''),
      },
    },
  },
})
