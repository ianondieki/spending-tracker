/**
 * Chromium via Playwright. The executable is Playwright's own when it is installed, else the sprint container's
 * `/opt/pw-browsers/chromium`, else `HESABU_CHROMIUM_PATH`. When none exists the renderer is unavailable: it fails
 * closed (RendererUnavailableError) unless `HESABU_RENDERER_ALLOW_STUB=1`, which test environments without a browser
 * set so the HTML and text outputs still flow and the binaries are marked as stubs.
 */
import { existsSync } from 'node:fs';

import { type Browser, chromium } from 'playwright';

export class RendererUnavailableError extends Error {
  constructor(message = 'No Chromium available for the renderer (install Playwright browsers or set HESABU_CHROMIUM_PATH)') {
    super(message);
    this.name = 'RendererUnavailableError';
  }
}

export function chromiumPath(env: NodeJS.ProcessEnv = process.env): string | null {
  const candidates = [env.HESABU_CHROMIUM_PATH, safeExecutablePath(), '/opt/pw-browsers/chromium'];
  for (const c of candidates) if (c && existsSync(c)) return c;
  return null;
}

function safeExecutablePath(): string | null {
  try {
    return chromium.executablePath();
  } catch {
    return null;
  }
}

export function browserAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return chromiumPath(env) !== null;
}

export function stubAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.HESABU_RENDERER_ALLOW_STUB === '1';
}

let shared: Promise<Browser> | null = null;

/** One browser per process, started lazily; `closeBrowser()` at shutdown. */
export function getBrowser(): Promise<Browser> {
  if (!shared) {
    const executablePath = chromiumPath();
    if (!executablePath) throw new RendererUnavailableError();
    shared = chromium.launch({ executablePath, args: ['--font-render-hinting=none', '--disable-lcd-text', '--hide-scrollbars'] });
  }
  return shared;
}

export async function closeBrowser(): Promise<void> {
  if (!shared) return;
  const b = await shared;
  shared = null;
  await b.close();
}
