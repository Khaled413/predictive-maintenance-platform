import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': '/src',
        '@components': '/src/components',
        '@pages': '/src/pages',
        '@context': '/src/context',
        '@types': '/src/types',
        '@utils': '/src/utils',
        '@data': '/src/data',
      },
    },
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': {
          target: env.ML_API_DEV_ORIGIN || 'http://127.0.0.1:8001',
          changeOrigin: true,
          rewrite: (path) => {
            // Map /api/predict -> /api/predict, /api/health -> /health
            if (path === '/api/health') {
              return '/health'
            }
            return path
          },
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
      sourcemap: false,
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
        },
      },
    },
  }
})
