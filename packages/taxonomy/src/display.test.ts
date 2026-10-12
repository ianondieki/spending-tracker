import { describe, expect, it } from 'vitest';

import { isMerchantCounterparty, normaliseMerchantName, titleCase } from './display.js';

describe('normaliseMerchantName', () => {
  it.each([
    ['QUICKMART LTD', 'Quickmart'],
    ['NAIVAS LTD KILIMANI', 'Naivas Kilimani'],
    ['NAIVAS LTD', 'Naivas'],
    ['UBER KENYA', 'Uber'],
    ['KPLC PREPAID', 'KPLC Prepaid'],
    ['NETFLIX', 'Netflix'],
    ['SAFARICOM', 'Safaricom'],
    ['SAFARICOM DATA BUNDLES', 'Safaricom'],
    ['MAKAO PROPERTIES', 'Makao Properties'],
    ['MAKAO PROPERTIES LTD', 'Makao Properties'],
    ['KASARANI AGENCIES LTD', 'Kasarani Agencies'],
    ['KASARANI AGENCIES LTD BRANCH', 'Kasarani Agencies'],
    ['  JAVA   HOUSE  ', 'Java House'],
    ['CO-OP BANK', 'Co-op Bank'],
    ['KPLC PREPAID NAIROBI WEST', 'KPLC Prepaid Nairobi West'],
    ['M-SHWARI', 'M-Shwari'],
    ['KCB M-PESA', 'KCB M-Pesa'],
  ])('%s → %s', (raw, expected) => {
    expect(normaliseMerchantName(raw)).toBe(expected);
  });

  it('uses the paybill or till before the name', () => {
    expect(normaliseMerchantName('UNKNOWN NAME', { paybill: '888880' })).toBe('KPLC Prepaid');
    expect(normaliseMerchantName('SOMETHING', { paybill: '444900' })).toBe('DStv');
  });

  it('never changes a name that is already mixed case (beyond whitespace)', () => {
    expect(normaliseMerchantName("Mama Njeri's  Kiosk")).toBe("Mama Njeri's Kiosk");
    expect(normaliseMerchantName('Wambui Hardware Ltd')).toBe('Wambui Hardware Ltd');
  });

  it('title-cases unknown upper-case names, keeps acronyms and brand spellings, strips only trailing suffixes', () => {
    expect(normaliseMerchantName('LUGXURIOUS T/A JUA-KALI WORKS LIMITED')).toBe(
      'Lugxurious T/A Jua-Kali Works',
    );
    expect(normaliseMerchantName('CO LTD')).toBe('Co');
    expect(normaliseMerchantName('LTD')).toBe('Ltd');
    expect(normaliseMerchantName('ACME LOGISTICS LTD SALARY')).toBe('Acme Logistics Ltd Salary');
    expect(normaliseMerchantName('REDACTED MERCHANT')).toBe('Redacted Merchant');
    expect(normaliseMerchantName('mpesa agent 12345')).toBe('M-PESA Agent 12345');
    expect(normaliseMerchantName('BOARD OF KRA AND NTSA')).toBe('Board of KRA and NTSA');
    expect(normaliseMerchantName('')).toBe('');
  });

  it('titleCase keeps the allow-list upper-cased', () => {
    expect(titleCase('KPLC DSTV GOTV NHIF SHA NSSF KRA NTSA KCB NCBA DTB I&M ATM')).toBe(
      'KPLC DSTV GOTV NHIF SHA NSSF KRA NTSA KCB NCBA DTB I&M ATM',
    );
  });
});

describe('isMerchantCounterparty', () => {
  it('keeps agents, people, banks and self out of merchant lists', () => {
    expect(isMerchantCounterparty({ counterparty_kind: 'agent', type: 'WITHDRAW' })).toBe(false);
    expect(isMerchantCounterparty({ counterparty_kind: 'agent' })).toBe(false);
    expect(isMerchantCounterparty({ counterparty_kind: 'merchant', type: 'WITHDRAW' })).toBe(false);
    expect(isMerchantCounterparty({ counterparty_kind: 'person', type: 'SEND_MONEY' })).toBe(false);
    expect(isMerchantCounterparty({ counterparty_kind: 'bank', type: 'MPESA_TO_BANK' })).toBe(
      false,
    );
    expect(isMerchantCounterparty({ counterparty_kind: 'self', type: 'MSHWARI_DEPOSIT' })).toBe(
      false,
    );
    expect(isMerchantCounterparty({ counterparty_kind: 'till', type: 'BUY_GOODS' })).toBe(true);
    expect(isMerchantCounterparty({ counterparty_kind: 'paybill', type: 'PAYBILL' })).toBe(true);
    expect(isMerchantCounterparty({ counterparty_kind: 'merchant', type: 'AIRTIME' })).toBe(true);
    expect(isMerchantCounterparty({ counterparty_kind: 'unknown', type: 'DEBIT' })).toBe(true);
  });
});
