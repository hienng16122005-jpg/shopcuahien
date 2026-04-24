import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path, { resolve } from 'path';
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
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          about: resolve(__dirname, 'about.html'),
          admin: resolve(__dirname, 'admin.html'),
          category: resolve(__dirname, 'category.html'),
          contact: resolve(__dirname, 'contact.html'),
          magazine: resolve(__dirname, 'magazine.html'),
          magazineDetail: resolve(__dirname, 'magazine-detail.html'),
          policy: resolve(__dirname, 'policy.html'),
          productDetail: resolve(__dirname, 'product-detail.html'),
          support: resolve(__dirname, 'support.html'),
          404: resolve(__dirname, '404.html'),
        }
      }
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});


