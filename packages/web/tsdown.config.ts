import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/openapi-fetch.ts', 'src/axios.ts'],
  format: ['esm'],
  platform: 'browser',
  dts: true,
  publint: true,
  treeshake: { moduleSideEffects: false },
});
