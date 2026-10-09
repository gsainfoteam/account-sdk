import { defineConfig } from 'tsdown';

// Nest 서비스 대부분이 CommonJS(moduleResolution: node10)라서 CJS 도 낸다.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  platform: 'neutral',
  dts: true,
  publint: true,
  // 내보내지 않는 선언이 쓰던 외부 타입 import 가 d.ts 에 side-effect import 로 남지 않게 한다.
  treeshake: { moduleSideEffects: false },
});
