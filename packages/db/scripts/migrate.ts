// Applies pending migrations: `pnpm --filter @hesabu/db migrate` (reads DATABASE_URL).
import { connect, getDatabaseUrl, migrate } from '../src/index.ts';

const sql = connect(getDatabaseUrl(process.env), { max: 1 });
const result = await migrate(sql);
console.log(`applied: ${result.applied.join(', ') || 'none'}; already present: ${result.skipped.length}`);
await sql.end();
