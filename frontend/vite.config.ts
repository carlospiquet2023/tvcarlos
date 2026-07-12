import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget = env.VITE_DEV_API_PROXY_TARGET?.trim() || 'http://localhost:4000'
  const broadcastProxyTarget = env.VITE_DEV_BROADCAST_PROXY_TARGET?.trim()

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': { target: apiProxyTarget, changeOrigin: true },
        '/uploads': { target: apiProxyTarget, changeOrigin: true },
        ...(broadcastProxyTarget
          ? { '/broadcast': { target: broadcastProxyTarget, changeOrigin: true } }
          : {})
      }
    },
    build: {
      chunkSizeWarningLimit: 750,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'editor-vendor': ['react-quill-new', '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
            'video-vendor': ['video.js'],
            'ui-vendor': ['lucide-react', 'framer-motion'],
            'utils-vendor': ['axios', 'dompurify']
          }
        }
      }
    }
  }
})
