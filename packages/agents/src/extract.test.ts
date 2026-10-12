import { describe, expect, it } from 'vitest';

import { type ExtractionProposal, extractUnknownMessages, type UnknownMessage } from './extract.js';
import { FakeModelClient, fakeFail, fakeOk } from './model-client.js';

// Fabricated messages that a phone sent with redaction already applied, except for what it missed.
const items: UnknownMessage[] = [
  {
    sender: 'MPESA',
    body_redacted: 'RJK3H5T2QW Confirmed. Ksh1,250.00 paid to MAMA MBOGA SHOP 0712345678 on 7/10/26 at 3:15 PM. Transaction cost, Ksh7.00.',
    received_at: '2026-10-07T15:15:30+03:00',
  },
  { sender: 'EQUITY', body_redacted: 'Get 10% off loans this week. Dial *247#', received_at: '2026-10-08T09:00:00+03:00' },
];

function proposal(index: number, over: Partial<ExtractionProposal> = {}): ExtractionProposal {
  return {
    index,
    type: 'BUY_GOODS',
    direction: 'out',
    amount_cents: 125_000,
    fee_cents: 700,
    counterparty_name: 'MAMA MBOGA SHOP',
    counterparty_kind: 'merchant',
    occurred_at: '2026-10-07T15:15:00+03:00',
    confidence: 0.86,
    ...over,
  };
}

describe('extractUnknownMessages', () => {
  it('re-redacts every message before it is sent, inside <data>', async () => {
    const client = new FakeModelClient(fakeOk({ proposals: [proposal(0)] }));
    await extractUnknownMessages(items, client);
    const user = client.calls[0]?.user ?? '';
    expect(user).toContain('<data name="messages">');
    expect(user).not.toContain('0712345678');
    expect(user).not.toContain('RJK3H5T2QW');
    expect(user).toContain('07XXXXX678');
    expect(user).toContain('MAMA MBOGA SHOP');
    expect(user).toContain('Ksh1,250.00');
  });

  it('returns valid proposals and drops out-of-range and repeated indexes', async () => {
    const client = new FakeModelClient(fakeOk({ proposals: [proposal(0), proposal(0, { confidence: 0.1 }), proposal(5)] }));
    const result = await extractUnknownMessages(items, client);
    expect(result.proposals).toEqual([proposal(0)]);
  });

  it('returns no proposals when the client fails or the output does not fit the schema', async () => {
    expect((await extractUnknownMessages(items, new FakeModelClient(fakeFail('refusal')))).proposals).toEqual([]);
    expect((await extractUnknownMessages(items, new FakeModelClient(fakeOk({ proposals: [{ index: 0, type: 'NOT_A_TYPE' }] })))).proposals).toEqual([]);
  });

  it('sends large inputs in batches with global indexes', async () => {
    const many: UnknownMessage[] = Array.from({ length: 25 }, (_, i) => ({ sender: 'MPESA', body_redacted: `message ${i}`, received_at: '2026-10-07T15:15:30+03:00' }));
    const client = new FakeModelClient((_req, call) => fakeOk({ proposals: [proposal(call === 0 ? 3 : 21)] }));
    const result = await extractUnknownMessages(many, client);
    expect(client.calls).toHaveLength(2);
    expect(client.calls[1]?.user).toContain('"index":20');
    expect(result.proposals.map((p) => p.index)).toEqual([3, 21]);
  });

  it('makes no call for an empty list', async () => {
    const client = new FakeModelClient(fakeOk({ proposals: [] }));
    expect((await extractUnknownMessages([], client)).proposals).toEqual([]);
    expect(client.calls).toHaveLength(0);
  });
});
