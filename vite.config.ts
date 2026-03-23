import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Standalone `vite` on :5173: forward `/api` and `/socket.io` to Express on :3000 (`npm run dev`).
      // Forward /api to backend; strip Content-Length on multipart so the proxy does not break boundaries.
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              if (req.headers['content-type']?.includes('multipart/form-data')) {
                proxyReq.removeHeader('content-length');
              }
            });
          },
        },
        // Socket.IO must hit the same Node server as the API when VITE_API_ORIGIN is unset (Vite on :5173).
        '/socket.io': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          ws: true,
          secure: false,
        },
      },
    },
  };
});
