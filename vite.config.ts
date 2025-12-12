import process from 'node:process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const gatewayTarget = process.env.VITE_GATEWAY_PROXY_TARGET;
const proxyTargets = {
  auth: process.env.VITE_AUTH_PROXY_TARGET ?? 'http://localhost:4004',
  graph: process.env.VITE_GRAPH_PROXY_TARGET ?? 'http://localhost:4001',
  initiatives: process.env.VITE_INITIATIVES_PROXY_TARGET ?? 'http://localhost:4002',
  workforce: process.env.VITE_WORKFORCE_PROXY_TARGET ?? 'http://localhost:4003'
};

const proxyConfig = gatewayTarget
  ? {
      '/api': {
        target: gatewayTarget,
        changeOrigin: true
      }
    }
  : {
      '/api/login': {
        target: proxyTargets.auth,
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api/, '')
      },
      '/api/users': {
        target: proxyTargets.auth,
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api/, '')
      },
      '/api/graphs': {
        target: proxyTargets.graph,
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api/, '')
      },
      '/api/initiatives': {
        target: proxyTargets.initiatives,
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api/, '')
      },
      '/api/employees': {
        target: proxyTargets.workforce,
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api/, '')
      },
      '/api/assignments': {
        target: proxyTargets.workforce,
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api/, '')
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
