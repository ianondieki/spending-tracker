import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { generateAll } from './generate-types.js';

describe('generated types', () => {
  it('are current with contracts/ (run pnpm gen when this fails)', async () => {
    const generated = await generateAll();
    for (const [file, text] of Object.entries(generated)) {
      expect(readFileSync(join(import.meta.dirname, '..', 'src', 'generated', file), 'utf8')).toBe(text);
    }
  });
});
