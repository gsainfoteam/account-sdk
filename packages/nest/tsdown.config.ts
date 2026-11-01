import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/drizzle.ts'],
  format: ['esm'],
  platform: 'neutral',
  dts: true,
  publint: true,
  // GitHub Packages drops peerDependenciesMeta, so drizzle-orm can't be an optional peer; keep it out of the bundle instead.
  deps: { neverBundle: [/^drizzle-orm/] },
});
