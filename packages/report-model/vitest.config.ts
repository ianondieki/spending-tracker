import { withShared } from '../../vitest.shared.ts';

export default withShared({ test: { include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'] } });
