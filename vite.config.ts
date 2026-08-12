import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
  },
  build: {
    target: 'es2022',
    // The source is private; a published map would hand out the whole of it,
    // and the maps outweigh the bundle they describe. Turn them on locally
    // when a production-only bug needs chasing.
    sourcemap: false,
  },
});
