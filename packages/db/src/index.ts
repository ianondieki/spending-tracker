export type Env = Readonly<Record<string, string | undefined>>;

/** Reads DATABASE_URL and refuses to start without a Postgres URL (fail closed). */
export function getDatabaseUrl(env: Env): string {
  const url = env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL is not set; refusing to start (fail closed)');
  }
  if (!/^postgres(ql)?:\/\//.test(url)) {
    throw new Error('DATABASE_URL must be a postgres:// or postgresql:// URL');
  }
  return url;
}
