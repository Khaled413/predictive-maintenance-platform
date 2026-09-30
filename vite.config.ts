import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': {
          target: env.ML_API_DEV_ORIGIN || 'http://127.0.0.1:8001',
          changeOrigin: true,
          rewrite: (path) => (path === '/api/health' ? '/health' : path),
        },
      },
    },
    build: {
      // Keep the vendor libraries in stable, cacheable chunks.
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-charts': ['recharts'],
            'vendor-icons': ['lucide-react'],
          },
        },
      },
      chunkSizeWarningLimit: 700,
    },
  }
})