import { defineConfig } from 'vite';

// The page talks to modx-core's examples/todo server (default http://127.0.0.1:8080, TODO_API to change it).
const api = process.env.TODO_API ?? 'http://127.0.0.1:8080';
export default defineConfig({
  server: { proxy: { '/api': { target: api, changeOrigin: true } } },
  preview: { proxy: { '/api': { target: api, changeOrigin: true } } },
});
