import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '', '');
  const proxyTargetBase =
    env.VITE_DEV_PROXY_TARGET || env.VITE_API_URL || 'http://localhost:5000';
  const proxyTarget = proxyTargetBase.replace(/\/api\/?$/, '');

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        // Proxy API requests to the backend
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      target: 'es2015',
      outDir: 'dist',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;

            if (id.includes('chart.js') || id.includes('react-chartjs-2')) {
              return 'charts';
            }

            if (id.includes('framer-motion')) {
              return 'motion';
            }

            if (id.includes('react-toastify')) {
              return 'toast';
            }

            if (id.includes('lucide-react') || id.includes('react-icons')) {
              return 'icons';
            }

            if (id.includes('axios') || id.includes('socket.io-client')) {
              return 'utils';
            }

            if (
              id.includes('react-router-dom') ||
              id.includes('react-dom') ||
              /[\\/]react[\\/]/.test(id)
            ) {
              return 'vendor';
            }
          },
        },
      },
    },
  };
});
