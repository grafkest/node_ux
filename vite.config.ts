import process from 'node:process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const gatewayTarget = process.env.VITE_GATEWAY_PROXY_TARGET ?? 'http://localhost:4000';

const proxyConfig = {
  '/api': {
    target: gatewayTarget,
    changeOrigin: true
  }
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3004,
    proxy: proxyConfig
  },
  preview: {
    proxy: proxyConfig
  }
});
