import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // './' macht das Build sowohl auf Domain-Root als auch in Unterordnern lauffähig.
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        modell: resolve(root, 'modell.html'),
      },
    },
  },
});
