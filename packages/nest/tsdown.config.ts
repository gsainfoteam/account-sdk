import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/drizzle.ts'],
  format: ['esm'],
  platform: 'neutral',
  dts: true,
  publint: true,
});
