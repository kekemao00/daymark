import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri 期望固定端口；TAURI_DEV_HOST 用于移动端调试
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    watch: { ignored: ['**/src-tauri/**', '**/target/**'] },
  },
  build: {
    target: 'es2021',
    chunkSizeWarningLimit: 600,
  },
});
