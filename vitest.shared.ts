// Shared Vitest config for every workspace package. Each package's vitest.config.ts does:
//   import { withShared } from '../../vitest.shared.ts';
//   export default withShared({ /* package overrides */ });
//
// The alias makes `@hesabu/<pkg>` resolve to that package's TypeScript source in tests, so a test
// never depends on a sibling package having been built first (at runtime Node uses dist/ instead).
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig, type ViteUserConfig } from 'vitest/config';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));

export const shared: ViteUserConfig = defineConfig({
  resolve: {
    alias: [
      {
        find: /^@hesabu\/([a-z0-9-]+)$/,
        replacement: `${repoRoot}packages/$1/src/index.ts`,
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    passWithNoTests: false,
  },
});

export function withShared(overrides: ViteUserConfig = {}): ViteUserConfig {
  return mergeConfig(shared, overrides);
}
