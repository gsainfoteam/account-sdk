import { defineConfig, type UserConfig } from 'tsdown';

// Nest 서비스 대부분이 CommonJS(module: commonjs, moduleResolution: node10)라서 CJS 도 함께 낸다.
const config: UserConfig = defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  platform: 'neutral',
  dts: true,
  publint: true,
});

export default config;
