// `pnpm fixtures`: runs scripts/write-fixtures.ts through vitest so `.js` specifiers resolve to TypeScript source.
import { withShared } from '../../vitest.shared.ts';

export default withShared({ test: { include: ['scripts/write-fixtures.run.ts'] } });
