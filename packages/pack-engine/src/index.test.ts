import { describe, expect, it } from 'vitest';

import { canLoadPack, PACK_FORMAT_VERSION } from './index.js';

describe('pack-engine placeholder', () => {
  it('accepts only the current pack format', () => {
    expect(
      canLoadPack({ id: 'mpesa', provider: 'Safaricom', formatVersion: PACK_FORMAT_VERSION }),
    ).toBe(true);
    expect(canLoadPack({ id: 'mpesa', provider: 'Safaricom', formatVersion: 99 })).toBe(false);
    expect(canLoadPack({ id: '', provider: 'Safaricom', formatVersion: PACK_FORMAT_VERSION })).toBe(
      false,
    );
  });
});
