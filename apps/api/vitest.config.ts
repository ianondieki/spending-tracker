import { fileURLToPath } from 'node:url';

import { withShared } from '../../vitest.shared.ts';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

export default withShared({
  resolve: {
    alias: [{ find: '@hesabu/db/test-db', replacement: `${repoRoot}packages/db/src/test-db.ts` }],
  },
  test: { env: { TZ: 'Africa/Nairobi' } },
});
