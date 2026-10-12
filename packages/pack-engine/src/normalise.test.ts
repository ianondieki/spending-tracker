import { describe, expect, it } from 'vitest';

import { maskAccountRef, normaliseAmount, normaliseCode, normaliseDatetime, normaliseDigits, normalisePhone, normaliseText } from './normalise.js';

const PREFIXES = ['Ksh.', 'Ksh', 'KES', 'KSh', 'Kshs'];
const FORMATS = ["d/M/yy 'at' h:mm a", 'd/M/yy h:mm a', "yyyy-MM-dd 'at' HH:mm", 'dd MMM yyyy HH:mm'];

describe('amount', () => {
  it.each([
    ['Ksh1,200.00', 120000],
    ['KES 50', 5000],
    ['Ksh.0.00', 0],
    ['Ksh 4967.16', 496716],
    ['24,460.00', 2446000],
    ['3.5', 350],
    ['ksh 7', 700],
    ['1,234,567.89', 123456789],
  ])('%s → %i cents', (raw, cents) => {
    expect(normaliseAmount(raw, PREFIXES)).toBe(cents);
  });

  it.each(['', 'Ksh', '1.234', '12.', 'abc', '1e3', '-5.00', '1,2,3.4.5'])('rejects %s', (raw) => {
    expect(normaliseAmount(raw, PREFIXES)).toBeNull();
  });

  it('never rounds: exactly two decimals of precision', () => {
    for (let cents = 0; cents < 5000; cents += 37) {
      const text = `Ksh${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
      expect(normaliseAmount(text, PREFIXES)).toBe(cents);
    }
  });
});

describe('datetime', () => {
  it.each([
    ['29/11/23 at 9:26 AM', '2023-11-29T09:26:00+03:00'],
    ['1/9/25 at 10:50 PM', '2025-09-01T22:50:00+03:00'],
    ['20/6/26 2:25 PM', '2026-06-20T14:25:00+03:00'],
    ['5/3/26  at 8:00 PM', '2026-03-05T20:00:00+03:00'],
    ['13/6/26 at 12:07 AM', '2026-06-13T00:07:00+03:00'],
    ['13/6/26 at 12:07 PM', '2026-06-13T12:07:00+03:00'],
    ['2026-06-10 at 14:56', '2026-06-10T14:56:00+03:00'],
    ['03 Jan 2026 16:08', '2026-01-03T16:08:00+03:00'],
    ['29/02/24 at 1:00 am', '2024-02-29T01:00:00+03:00'],
  ])('%s → %s', (raw, iso) => {
    expect(normaliseDatetime(raw, FORMATS)).toBe(iso);
  });

  it.each(['31/2/26 at 1:00 PM', '29/02/23 at 1:00 PM', '13/13/26 at 1:00 PM', '1/1/26 at 13:00 PM', '1/1/26 at 1:60 PM', '1/1/26', 'yesterday'])(
    'rejects %s',
    (raw) => {
      expect(normaliseDatetime(raw, FORMATS)).toBeNull();
    },
  );
});

describe('phone, code, text, digits', () => {
  it('masks phones to first 2 and last 3 and normalises 254', () => {
    expect(normalisePhone('0722358700')).toBe('07XXXXX700');
    expect(normalisePhone('+254729901555')).toBe('07XXXXX555');
    expect(normalisePhone('254729901555')).toBe('07XXXXX555');
    expect(normalisePhone('07XXXXX617')).toBe('07XXXXX617');
    expect(normalisePhone('0710***123')).toBe('07XXXXX123');
    expect(normalisePhone('(0712) 345 678')).toBe('07XXXXX678');
    expect(normalisePhone('334')).toBe('334');
    expect(normalisePhone('')).toBeNull();
  });
  it('codes are upper-case alphanumerics', () => {
    expect(normaliseCode(' nni2jqjkue ')).toBe('NNI2JQJKUE');
    expect(normaliseCode('AB-12')).toBeNull();
  });
  it('text trims and collapses whitespace', () => {
    expect(normaliseText('  REDACTED   MERCHANT \n +XXX ')).toBe('REDACTED MERCHANT +XXX');
    expect(normaliseText('   ')).toBeNull();
  });
  it('digits keeps digits only', () => {
    expect(normaliseDigits('Till 123-456')).toBe('123456');
    expect(normaliseDigits('none')).toBeNull();
  });
  it('masks account references that look like a phone or a long id', () => {
    expect(maskAccountRef('0722358700')).toBe('07XXXXX700');
    expect(maskAccountRef('254722358700')).toBe('07XXXXX700');
    expect(maskAccountRef('12345678')).toBe('XXXXX678');
    expect(maskAccountRef('Meter 37123456')).toBe('Meter XXXXX456');
    expect(maskAccountRef('XXXXX653')).toBe('XXXXX653');
    expect(maskAccountRef('SAFARICOM DATA BUNDLES')).toBe('SAFARICOM DATA BUNDLES');
    expect(maskAccountRef('A12')).toBe('A12');
  });
});
