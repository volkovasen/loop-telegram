import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Requests from phones go through Vite on the same origin, not phone-local localhost.
const apiProxy = { target: 'http://127.0.0.1:8787', changeOrigin: true };

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/loops': apiProxy,
      '/memory/search': apiProxy,
      '/me': apiProxy,
      '/health': apiProxy
    }
  }
});
