import { withShared } from '../../vitest.shared.ts';

export default withShared({
  // tsconfig says `jsx: preserve` for Next; tests need the automatic runtime instead.
  // Vite 8 transforms with oxc (the `esbuild` option is ignored when oxc options exist).
  oxc: { jsx: { runtime: 'automatic' } },
  test: { include: ['test/**/*.test.{ts,tsx}'] },
});
