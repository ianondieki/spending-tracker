import { describe, expect, it } from 'vitest';

import { redact } from './redact.js';

// All messages below are fabricated; names, numbers and codes are not real.
describe('redact', () => {
  it('masks the code and phone in an M-Pesa send, keeping the name and amounts', () => {
    const sms =
      'RJK3H5T2QW Confirmed. Ksh1,250.00 sent to JOHN KAMAU 0712345678 on 7/10/26 at 3:15 PM. New M-PESA balance is Ksh8,320.00. Transaction cost, Ksh23.00.';
    expect(redact(sms)).toBe(
      '[CODE] Confirmed. Ksh1,250.00 sent to JOHN KAMAU 07XXXXX678 on 7/10/26 at 3:15 PM. New M-PESA balance is Ksh8,320.00. Transaction cost, Ksh23.00.',
    );
  });

  it('masks 2547… and +254 numbers with spaces or dashes', () => {
    expect(redact('You have received Ksh45,000.00 from ACME LTD 254722000111 on 9/10/26')).toBe(
      'You have received Ksh45,000.00 from ACME LTD 25XXXXXXX111 on 9/10/26',
    );
    expect(redact('Call +254 712 345 678 now')).toBe('Call +25XXXXXXX678 now');
    expect(redact('Call 0712-345-678 or 0110 123 456')).toBe('Call 07XXXXX678 or 01XXXXX456');
  });

  it('masks account numbers of nine or more digits', () => {
    expect(redact('SKL9M8N7P6 Confirmed. Ksh2,500.00 sent to KPLC PREPAID for account 37188812345 on 6/10/26')).toBe(
      '[CODE] Confirmed. Ksh2,500.00 sent to KPLC PREPAID for account [ACCOUNT] on 6/10/26',
    );
    expect(redact('Acc 0123456789012 debited with KES 3,000.00')).toBe('Acc [ACCOUNT] debited with KES 3,000.00');
  });

  it('masks national ID numbers (seven or eight digits)', () => {
    expect(redact('ID number 12345678 verified')).toBe('ID number [ID] verified');
    expect(redact('ID 1234567 verified')).toBe('ID [ID] verified');
  });

  it('masks emails', () => {
    expect(redact('Statement sent to jane.doe@example.co.ke today')).toBe('Statement sent to [EMAIL] today');
  });

  it('leaves amounts alone, however they are written', () => {
    expect(redact('KES 1500000 credited')).toBe('KES 1500000 credited');
    expect(redact('Ksh1000000.00 paid')).toBe('Ksh1000000.00 paid');
    expect(redact('Ksh 1,000,000.00 paid')).toBe('Ksh 1,000,000.00 paid');
    expect(redact('Amount 2500000.00 received')).toBe('Amount 2500000.00 received');
  });

  it('leaves names, all-letter words, short numbers and already-masked numbers alone', () => {
    const text = 'WITHDRAWAL of Ksh500.00 from agent 123456 by MARY ATIENO 0712***678 on 12/10/26';
    expect(redact(text)).toBe(text);
  });

  it('is idempotent', () => {
    const once = redact('RJK3H5T2QW Ksh50.00 to 0712345678 id 12345678 a@b.co');
    expect(redact(once)).toBe(once);
  });
});
