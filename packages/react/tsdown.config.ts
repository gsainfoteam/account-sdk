import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'openapi-fetch': 'src/adapters/openapi-fetch.ts',
    axios: 'src/adapters/axios.ts',
  },
  format: ['esm'],
  platform: 'browser',
  dts: true,
  publint: true,
  treeshake: { moduleSideEffects: false },
});
