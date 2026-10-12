// Starts the built app (`next start`) on a free port for the screenshot and Lighthouse scripts.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

export async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

export async function startServer() {
  const port = await freePort();
  const child = spawn('pnpm', ['exec', 'next', 'start', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, HESABU_DEV_ROUTES: '1', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/`);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return { base, stop: () => child.kill('SIGTERM') };
}
