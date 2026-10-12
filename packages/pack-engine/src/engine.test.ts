/** One test per engine clarification in README.md ("Semantics the contract leaves implicit"), so Lane A can mirror them. */
import { describe, expect, it } from 'vitest';

import { deterministicUuid } from './hash.js';
import { MAX_BODY_LENGTH, matchableBody, parseMessage, renderAccountRef } from './engine.js';
import { EXAMPLE_RECEIVED_AT, EXAMPLE_VARIABLES } from './examples.js';
import { compilePack, loadAllPacks } from './loader.js';
import { normaliseDatetime } from './normalise.js';

const mpesa = loadAllPacks().find((p) => p.pack.pack_id === 'mpesa')!;
const opts = { variables: EXAMPLE_VARIABLES };
const send =
  'NNI2JQJKUE Confirmed. Ksh200.00 sent to REDACTED PERSON 07XXXXX617 on 29/11/23 at 9:26 AM. New M-PESA balance is Ksh85.59. Transaction cost, Ksh7.00.';

describe('engine clarifications', () => {
  it('1. replaces U+00A0 with a space before matching and hashes the untouched body', () => {
    const body = send.replace(/ /g, String.fromCharCode(0xa0));
    expect(matchableBody(body)).toBe(send);
    const outcome = parseMessage(
      mpesa,
      { sender: 'MPESA', body, received_at: EXAMPLE_RECEIVED_AT },
      opts,
    );
    expect(outcome.kind).toBe('parsed');
    if (outcome.kind === 'parsed') {
      expect(outcome.transaction.amount_cents).toBe(20000);
      const plain = parseMessage(
        mpesa,
        { sender: 'MPESA', body: send, received_at: EXAMPLE_RECEIVED_AT },
        opts,
      );
      expect(
        plain.kind === 'parsed' && plain.transaction.raw_hash !== outcome.transaction.raw_hash,
      ).toBe(true);
    }
  });

  it('3. uses received_at as occurred_at when the family has no datetime group', () => {
    const body =
      'FYJ8HLFQ9T Confirmed. Fuliza M-PESA amount is Ksh 100.00. Interest charged Ksh 1.00. Total Fuliza M-PESA outstanding amount is Ksh 422.93 due on 06/01/24.';
    const outcome = parseMessage(
      mpesa,
      { sender: 'MPESA', body, received_at: '2026-02-02T10:00:00+03:00' },
      opts,
    );
    expect(outcome.kind === 'parsed' && outcome.transaction.occurred_at).toBe(
      '2026-02-02T10:00:00+03:00',
    );
  });

  it('7. derives the transaction id from (pack_id, family_id, raw_hash) so every engine and run agrees', () => {
    const a = parseMessage(
      mpesa,
      { sender: 'MPESA', body: send, received_at: EXAMPLE_RECEIVED_AT },
      opts,
    );
    const b = parseMessage(
      mpesa,
      { sender: 'mpesa ', body: send, received_at: '2030-01-01T00:00:00+03:00' },
      opts,
    );
    expect(
      a.kind === 'parsed' && b.kind === 'parsed' && a.transaction.id === b.transaction.id,
    ).toBe(true);
    if (a.kind === 'parsed')
      expect(a.transaction.id).toBe(
        deterministicUuid(`mpesa|send_money|${a.transaction.raw_hash}`),
      );
    expect(deterministicUuid('x')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("8. datetime formats take quoted literals ('at', 'saa') and any whitespace run for a space", () => {
    expect(normaliseDatetime('13/1/25   saa 5:44 PM', ["d/M/yy 'saa' h:mm a"])).toBe(
      '2025-01-13T17:44:00+03:00',
    );
    expect(normaliseDatetime('13/1/25 at 5:44 PM', ["d/M/yy 'saa' h:mm a"])).toBeNull();
    expect(() => compilePack({ ...mpesa.pack, datetime_formats: ['d/M/yy at h:mm a'] })).toThrow(
      /unknown token/,
    );
  });

  it('sender filter trims and lower-cases; other senders are never read', () => {
    expect(
      parseMessage(mpesa, { sender: ' mpesa ', body: send, received_at: EXAMPLE_RECEIVED_AT }, opts)
        .kind,
    ).toBe('parsed');
    expect(
      parseMessage(
        mpesa,
        { sender: 'MPESA-PROMO', body: send, received_at: EXAMPLE_RECEIVED_AT },
        opts,
      ).kind,
    ).toBe('not_ours');
  });

  it('account_ref_template variables come from the device; a missing one fails closed', () => {
    expect(renderAccountRef('mpesa:{sim_msisdn_masked}', { sim_msisdn_masked: '07XXXXX123' })).toBe(
      'mpesa:07XXXXX123',
    );
    expect(() =>
      parseMessage(
        mpesa,
        { sender: 'MPESA', body: send, received_at: EXAMPLE_RECEIVED_AT },
        { variables: {} },
      ),
    ).toThrow(/sim_msisdn_masked/);
  });

  it('an over-long body is unknown without pattern work', () => {
    expect(
      parseMessage(
        mpesa,
        {
          sender: 'MPESA',
          body: 'A'.repeat(MAX_BODY_LENGTH + 1),
          received_at: EXAMPLE_RECEIVED_AT,
        },
        opts,
      ).kind,
    ).toBe('unknown');
  });

  it('a required group that fails to normalise lets the next family try', () => {
    // A send with an impossible date (31/2/26) must not become a send_money transaction with a wrong date.
    const body = send.replace('29/11/23', '31/2/26');
    const outcome = parseMessage(
      mpesa,
      { sender: 'MPESA', body, received_at: EXAMPLE_RECEIVED_AT },
      opts,
    );
    expect(outcome.kind === 'parsed' ? outcome.family_id : outcome.kind).not.toBe('send_money');
  });
});
