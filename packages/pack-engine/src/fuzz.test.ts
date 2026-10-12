/**
 * Mutated-sample fuzzing (master prompt §6 quality bar): every pack example is mutated in deterministic ways and the
 * engine must never throw, must never produce an amount that is not literally present in the body, and must treat an
 * over-long body as unknown.
 */
import { describe, expect, it } from 'vitest';

import { MAX_BODY_LENGTH, parseMessage } from './engine.js';
import { EXAMPLE_RECEIVED_AT, EXAMPLE_VARIABLES } from './examples.js';
import { loadAllPacks } from './loader.js';

const packs = loadAllPacks();

function mutations(body: string): string[] {
  const out: string[] = [];
  const step = Math.max(1, Math.floor(body.length / 23));
  for (let i = 0; i < body.length; i += step) {
    out.push(body.slice(0, i) + body.slice(i + 1)); // drop a character
    out.push(body.slice(0, i) + 'X' + body.slice(i)); // insert a letter
    out.push(body.slice(0, i)); // truncate
  }
  out.push(
    body.replace(/\d/g, '9'),
    body.toUpperCase(),
    body.toLowerCase(),
    body.replace(/\s+/g, ''),
    `${body} ${body}`,
    body.replace(/\./g, ''),
  );
  return out;
}

describe('fuzzed examples', () => {
  for (const pack of packs) {
    it(`${pack.pack.pack_id}: never throws, never invents an amount`, () => {
      const sender = pack.pack.sender_ids[0]!;
      let tried = 0;
      for (const compiled of pack.families) {
        for (const example of compiled.family.examples) {
          for (const body of mutations(example.body)) {
            tried += 1;
            const outcome = parseMessage(
              pack,
              { sender, body, received_at: EXAMPLE_RECEIVED_AT },
              { variables: EXAMPLE_VARIABLES },
            );
            if (outcome.kind !== 'parsed') continue;
            const t = outcome.transaction;
            const digits = body.replace(/[^\d.]/g, '');
            const amountText = `${Math.floor(t.amount_cents / 100)}.${String(t.amount_cents % 100).padStart(2, '0')}`;
            expect(
              digits.includes(amountText.replace(/^0+(?=\d)/, '')) ||
                digits.includes(String(Math.floor(t.amount_cents / 100))),
              `${body} -> ${amountText}`,
            ).toBe(true);
            expect(t.fee_cents).toBeGreaterThanOrEqual(0);
            expect(Number.isNaN(Date.parse(t.occurred_at))).toBe(false);
          }
        }
      }
      expect(tried).toBeGreaterThan(50);
    });
  }

  it('treats an over-long body as unknown without running the patterns', () => {
    const pack = packs.find((p) => p.pack.pack_id === 'mpesa')!;
    const body = `${'A'.repeat(MAX_BODY_LENGTH)} ${pack.families[0]!.family.examples[0]!.body}`;
    expect(
      parseMessage(pack, { sender: 'MPESA', body, received_at: EXAMPLE_RECEIVED_AT }).kind,
    ).toBe('unknown');
  });
});
