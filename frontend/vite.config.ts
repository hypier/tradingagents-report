import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const backendEnv = loadEnv(mode, resolve(__dirname, '../tg-core'), 'TRADINGAGENTS_')
  const apiKey = backendEnv.TRADINGAGENTS_API_KEY
  const proxy = {
    target: 'http://127.0.0.1:8000',
    changeOrigin: true,
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
  }

  return {
    plugins: [vue()],
    server: {
      host: '0.0.0.0',
      port: 3000,
      proxy: { '/api': proxy, '/health': proxy }
    },
    build: { target: 'es2020', outDir: 'dist', sourcemap: false }
  }
})
