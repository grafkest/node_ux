import process from 'node:process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3003';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3004,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true
      }
    }
  },
  preview: {
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true
      }
    }
  }
});
