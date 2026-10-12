/**
 * Deterministic demo inbox: eight weeks of synthetic money messages for one persona, written in the exact shapes
 * the packs in contracts/provider-packs parse. No randomness: the same code always produces the same file, and the
 * balances are simulated so every balance chain closes. The Android demo mode and the backend demo seed both consume
 * `corpus/demo/demo-inbox.jsonl`; `demo.test.ts` asserts the engine parses 100 % of it.
 *
 * Persona: Wanjiru, Nairobi. Salary at month end into "Hesabu Demo Bank" (a fictional bank, see demo_bank.json),
 * most of it moved to M-PESA; rent by pay bill; KPLC tokens; Naivas and Quickmart tills; matatu cash from an agent;
 * airtime; Uber; Netflix; one Fuliza episode; money to mum; money from a friend; M-Shwari deposits; one message
 * delivered twice.
 */
import { sha256Hex } from '../hash.js';

export interface DemoLine {
  readonly sender: string;
  readonly provider: string;
  readonly body: string;
  readonly received_at: string;
  readonly family_guess: string;
  readonly synthetic: true;
  readonly redacted: false;
  readonly source: 'synthetic-demo';
  readonly sha256: string;
}

export const DEMO_START = '2026-08-17'; // a Monday
export const DEMO_WEEKS = 8;
export const DEMO_VARIABLES = { sim_msisdn_masked: '07XXXXX123', acct_mask: 'XXX456' } as const;
export const DEMO_MSISDN = '0722000123';
export const DEMO_BANK_ACCOUNT = 'XXX456';

// --- money and dates ------------------------------------------------------------------------------------------

const cents = (shillings: number): number => Math.round(shillings * 100);

function ksh(c: number): string {
  const whole = Math.floor(c / 100);
  const frac = String(c % 100).padStart(2, '0');
  return `${whole.toLocaleString('en-US')}.${frac}`;
}
/** Fuliza messages write amounts without thousands separators (`Ksh 4967.16`). */
function kshPlain(c: number): string {
  return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
}

interface Stamp {
  readonly y: number;
  readonly m: number;
  readonly d: number;
  readonly hh: number;
  readonly mm: number;
  readonly ss: number;
}

function stamp(dayOffset: number, hh: number, mm: number, ss = 0): Stamp {
  const base = new Date(`${DEMO_START}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dayOffset);
  return { y: base.getUTCFullYear(), m: base.getUTCMonth() + 1, d: base.getUTCDate(), hh, mm, ss };
}
function dayOf(y: number, m: number, d: number): number {
  const base = new Date(`${DEMO_START}T00:00:00Z`);
  const target = new Date(Date.UTC(y, m - 1, d));
  return Math.round((target.getTime() - base.getTime()) / 86_400_000);
}
const pad = (n: number): string => String(n).padStart(2, '0');
function iso(s: Stamp, plusSeconds = 0): string {
  const t = new Date(Date.UTC(s.y, s.m - 1, s.d, s.hh, s.mm, s.ss) + plusSeconds * 1000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}+03:00`;
}
/** M-PESA style `d/M/yy at h:mm AM`. */
function mpesaDate(s: Stamp): string {
  const h12 = s.hh % 12 === 0 ? 12 : s.hh % 12;
  return `${s.d}/${s.m}/${String(s.y).slice(2)} at ${h12}:${pad(s.mm)} ${s.hh < 12 ? 'AM' : 'PM'}`;
}
/** Demo bank style `dd/MM/yy at HH:mm`. */
function bankDate(s: Stamp): string {
  return `${pad(s.d)}/${pad(s.m)}/${String(s.y).slice(2)} at ${pad(s.hh)}:${pad(s.mm)}`;
}
function fulizaDue(s: Stamp): string {
  const t = new Date(Date.UTC(s.y, s.m - 1, s.d + 30));
  return `${pad(t.getUTCDate())}/${pad(t.getUTCMonth() + 1)}/${String(t.getUTCFullYear()).slice(2)}`;
}

// --- tariffs (approximate M-PESA customer tariffs; synthetic but consistent) -----------------------------------

function tier(amount: number, table: readonly (readonly [number, number])[]): number {
  for (const [upTo, fee] of table) if (amount <= cents(upTo)) return cents(fee);
  return cents(table[table.length - 1]![1]);
}
const SEND = [[100, 0], [500, 7], [1000, 13], [1500, 23], [2500, 33], [3500, 53], [5000, 57], [7500, 78], [10000, 90], [15000, 100], [20000, 105], [250000, 108]] as const;
const WITHDRAW = [[100, 11], [2500, 29], [3500, 52], [5000, 69], [7500, 87], [10000, 115], [15000, 167], [20000, 185], [250000, 300]] as const;
const PAYBILL = [[100, 0], [500, 5], [1000, 10], [1500, 15], [2500, 20], [3500, 25], [5000, 34], [7500, 42], [10000, 48], [15000, 57], [20000, 62], [25000, 67], [250000, 72]] as const;

// --- code generator ---------------------------------------------------------------------------------------------

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function code(seq: number, prefix = 'D'): string {
  const hex = sha256Hex(`hesabu-demo-code-${seq}`);
  let out = prefix;
  for (let i = 0; out.length < 10; i += 2) out += ALPHABET[parseInt(hex.slice(i, i + 2), 16) % ALPHABET.length];
  return out;
}

// --- simulation ----------------------------------------------------------------------------------------------------

class Inbox {
  readonly lines: DemoLine[] = [];
  mpesa = cents(26440);
  bank = cents(6234.5);
  mshwari = cents(12000);
  fulizaOutstanding = 0;
  fulizaLimit = cents(7000);
  private seq = 0;
  private bankSeq = 1233;
  private dailySent = new Map<string, number>();

  private push(sender: string, provider: string, family: string, body: string, received_at: string): void {
    this.lines.push({ sender, provider, body, received_at, family_guess: family, synthetic: true, redacted: false, source: 'synthetic-demo', sha256: sha256Hex(body) });
  }
  private nextCode(): string {
    this.seq += 1;
    return code(this.seq);
  }
  private nextBankRef(): string {
    this.bankSeq += 1;
    return `DB${String(this.bankSeq).padStart(8, '0')}`;
  }
  private limitLine(s: Stamp, amount: number): string {
    const key = `${s.y}-${s.m}-${s.d}`;
    const used = (this.dailySent.get(key) ?? 0) + amount;
    this.dailySent.set(key, used);
    return `Amount you can transact within the day is ${ksh(cents(500000) - used).slice(0, -3)}.00.`;
  }

  /** Pays `amount + fee` from M-PESA, drawing Fuliza for the shortfall exactly as Safaricom does (same code, second SMS). */
  private spend(amount: number, fee: number, txCode: string, s: Stamp, build: (balance: string) => [string, string]): void {
    const total = amount + fee;
    let fulizaDraw = 0;
    if (this.mpesa < total) {
      fulizaDraw = total - this.mpesa;
      if (fulizaDraw > this.fulizaLimit - this.fulizaOutstanding) {
        throw new Error(`demo persona exceeded the Fuliza limit on ${iso(s)} (balance ${ksh(this.mpesa)}, needs ${ksh(total)}); adjust the schedule`);
      }
      this.mpesa += fulizaDraw;
    }
    this.mpesa -= total;
    const [family, body] = build(ksh(this.mpesa));
    this.push('MPESA', 'mpesa', family, body, iso(s, 2));
    if (fulizaDraw > 0) {
      const accessFee = Math.round(fulizaDraw * 0.01);
      this.fulizaOutstanding += fulizaDraw + accessFee;
      this.push(
        'MPESA',
        'mpesa',
        'fuliza_drawdown',
        `${txCode} Confirmed. Fuliza M-PESA amount is Ksh ${kshPlain(fulizaDraw)}. Access Fee charged Ksh ${kshPlain(accessFee)}. Total Fuliza M-PESA outstanding amount is Ksh ${kshPlain(this.fulizaOutstanding)} due on ${fulizaDue(s)}. To check daily charges, Dial *334#OK Select Fuliza M-PESA to Query Charges.`,
        iso(s, 5),
      );
    }
  }

  /** Money arriving in M-PESA repays any Fuliza outstanding at once (second SMS, no date). */
  private receive(amount: number, s: Stamp, build: (balance: string) => [string, string]): void {
    this.mpesa += amount;
    const [family, body] = build(ksh(this.mpesa));
    this.push('MPESA', 'mpesa', family, body, iso(s, 2));
    if (this.fulizaOutstanding > 0) {
      const repay = Math.min(this.fulizaOutstanding, this.mpesa);
      this.mpesa -= repay;
      this.fulizaOutstanding -= repay;
      const fully = this.fulizaOutstanding === 0;
      this.seq += 1;
      this.push(
        'MPESA',
        'mpesa',
        'fuliza_repay',
        `${code(this.seq)} Confirmed. Ksh ${kshPlain(repay)} from your M-PESA has been used to ${fully ? 'fully' : 'partially'} pay your outstanding Fuliza M-PESA. ${fully ? 'Available' : 'Your available'} Fuliza M-PESA limit is Ksh ${kshPlain(this.fulizaLimit - this.fulizaOutstanding)}. M-PESA balance is Ksh${ksh(this.mpesa)}.`,
        iso(s, 6),
      );
    }
  }

  buyGoods(s: Stamp, amount: number, merchant: string): void {
    const c = this.nextCode();
    this.spend(amount, 0, c, s, (bal) => [
      'buy_goods',
      `${c} Confirmed. Ksh${ksh(amount)} paid to ${merchant}. on ${mpesaDate(s)}.New M-PESA balance is Ksh${bal}. Transaction cost, Ksh0.00. ${this.limitLine(s, amount)} To move money from bank to M-PESA, dial *334#>Withdraw>From bank to MPESA`,
    ]);
  }
  payBill(s: Stamp, amount: number, merchant: string, account: string, family = 'paybill'): void {
    const c = this.nextCode();
    const fee = tier(amount, PAYBILL);
    this.spend(amount, fee, c, s, (bal) => [
      family,
      `${c} Confirmed. Ksh${ksh(amount)} sent to ${merchant} for account ${account} on ${mpesaDate(s)} New M-PESA balance is Ksh${bal}. Transaction cost, Ksh${ksh(fee)}.${this.limitLine(s, amount)} Save frequent paybills for quick payment on M-PESA app https://bit.ly/mpesalnk`,
    ]);
  }
  sendMoney(s: Stamp, amount: number, name: string, phone: string): void {
    const c = this.nextCode();
    const fee = tier(amount, SEND);
    this.spend(amount, fee, c, s, (bal) => [
      'send_money',
      `${c} Confirmed. Ksh${ksh(amount)} sent to ${name} ${phone} on ${mpesaDate(s)}. New M-PESA balance is Ksh${bal}. Transaction cost, Ksh${ksh(fee)}. ${this.limitLine(s, amount)} To reverse, foward this message to 456.`,
    ]);
  }
  withdraw(s: Stamp, amount: number, agentNo: string, agent: string): void {
    const c = this.nextCode();
    const fee = tier(amount, WITHDRAW);
    this.spend(amount, fee, c, s, (bal) => [
      'withdraw',
      `${c} Confirmed.on ${mpesaDate(s)}Withdraw Ksh${ksh(amount)} from ${agentNo} - ${agent} New M-PESA balance is Ksh${bal}. Transaction cost, Ksh${ksh(fee)}. ${this.limitLine(s, amount)} Get a Lipa Na M-PESA Till online: https://m-pesaforbusiness.co.ke/`,
    ]);
  }
  airtime(s: Stamp, amount: number): void {
    const c = this.nextCode();
    this.spend(amount, 0, c, s, (bal) => [
      'airtime',
      `${c} confirmed.You bought Ksh${ksh(amount)} of airtime on ${mpesaDate(s)}.New M-PESA balance is Ksh${bal}. Transaction cost, Ksh0.00. ${this.limitLine(s, amount)} Dial *234*0# to Opt in to FULIZA and check your limit.`,
    ]);
  }
  mshwariDeposit(s: Stamp, amount: number): void {
    const c = this.nextCode();
    this.mshwari += amount;
    this.spend(amount, 0, c, s, (bal) => [
      'mshwari_deposit',
      `${c} Confirmed.Ksh${ksh(amount)} transferred to M-Shwari account on ${mpesaDate(s)}. M-PESA balance is Ksh${bal} .New M-Shwari saving account balance is Ksh${ksh(this.mshwari)}. Transaction cost Ksh.0.00`,
    ]);
  }
  receiveFromPerson(s: Stamp, amount: number, name: string, phone: string): void {
    const c = this.nextCode();
    this.receive(amount, s, (bal) => [
      'receive_money',
      `${c} Confirmed.You have received Ksh${ksh(amount)} from ${name} ${phone} on ${mpesaDate(s)}  New M-PESA balance is Ksh${bal}. Earn interest daily on Ziidi MMF,Dial *334#`,
    ]);
  }
  /** Bank side first (debit alert), then the M-PESA side one minute later: the engine pairs them as a transfer. */
  bankToMpesa(s: Stamp, amount: number): void {
    const bankFee = cents(50);
    this.bank -= amount + bankFee;
    this.push(
      'HESABUDEMO',
      'demo_bank',
      'bank_debit_to_mpesa',
      `HESABU DEMO BANK: Your account ${DEMO_BANK_ACCOUNT} has been debited with KES ${ksh(amount)} to M-PESA ${DEMO_MSISDN} on ${bankDate(s)}. Fee KES ${ksh(bankFee)}. Available balance KES ${ksh(this.bank)}. Ref ${this.nextBankRef()}.`,
      iso(s, 3),
    );
    const later = { ...s, mm: s.mm + 1 };
    const c = this.nextCode();
    this.receive(amount, later, (bal) => [
      'bank_to_mpesa',
      `${c} Confirmed. You have received Ksh${ksh(amount)} from HESABU DEMO BANK on ${mpesaDate(later)}. New M-PESA balance is Ksh${bal}. Separate personal and business funds through Pochi la Biashara on *334#.`,
    ]);
  }
  /** M-PESA side first (pay bill to the bank), then the bank's credit alert two minutes later. */
  mpesaToBank(s: Stamp, amount: number): void {
    this.payBill(s, amount, 'HESABU DEMO BANK', '0100123456', 'mpesa_to_bank');
    const later = { ...s, mm: s.mm + 2 };
    this.bank += amount;
    this.push(
      'HESABUDEMO',
      'demo_bank',
      'bank_credit',
      `HESABU DEMO BANK: Your account ${DEMO_BANK_ACCOUNT} has been credited with KES ${ksh(amount)} from M-PESA ${DEMO_MSISDN} on ${bankDate(later)}. Available balance KES ${ksh(this.bank)}. Ref ${this.nextBankRef()}.`,
      iso(later, 3),
    );
  }
  salary(s: Stamp, amount: number): void {
    this.bank += amount;
    this.push(
      'HESABUDEMO',
      'demo_bank',
      'bank_credit',
      `HESABU DEMO BANK: Your account ${DEMO_BANK_ACCOUNT} has been credited with KES ${ksh(amount)} from ACME LOGISTICS LTD SALARY on ${bankDate(s)}. Available balance KES ${ksh(this.bank)}. Ref ${this.nextBankRef()}.`,
      iso(s, 3),
    );
  }
  bankFee(s: Stamp, amount: number, label: string): void {
    this.bank -= amount;
    this.push(
      'HESABUDEMO',
      'demo_bank',
      'bank_debit',
      `HESABU DEMO BANK: Your account ${DEMO_BANK_ACCOUNT} has been debited with KES ${ksh(amount)} for ${label} on ${bankDate(s)}. Available balance KES ${ksh(this.bank)}. Ref ${this.nextBankRef()}.`,
      iso(s, 3),
    );
  }
  /** The network delivers the previous message a second time (same body, same code). */
  duplicateLast(): void {
    const last = this.lines[this.lines.length - 1]!;
    const t = new Date(Date.parse(last.received_at) + 2000 + 3 * 3600 * 1000); // shift to wall-clock Nairobi
    this.lines.push({ ...last, received_at: iso({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), hh: t.getUTCHours(), mm: t.getUTCMinutes(), ss: t.getUTCSeconds() }) });
  }
}

export interface DemoSummary {
  readonly lines: number;
  readonly final_balances_cents: { mpesa: number; bank: number; mshwari: number; fuliza_outstanding: number };
}

export function generateDemoInbox(): { lines: DemoLine[]; summary: DemoSummary } {
  const ib = new Inbox();
  const events: { day: number; hh: number; mm: number; run: (s: Stamp) => void }[] = [];
  const on = (day: number, hh: number, mm: number, run: (s: Stamp) => void) => events.push({ day, hh, mm, run });

  for (let w = 0; w < DEMO_WEEKS; w += 1) {
    const mon = w * 7;
    on(mon, 18, 40, (s) => ib.buyGoods(s, cents(1850 + w * 110), 'NAIVAS LTD KILIMANI'));
    on(mon + 1, 7, 30, (s) => ib.airtime(s, cents(100)));
    on(mon + 2, 7, 5, (s) => ib.withdraw(s, cents(w % 3 === 0 ? 2000 : 1500), '138642', 'KASARANI AGENCIES LTD'));
    on(mon + 3, 21, 15, (s) => ib.buyGoods(s, cents(650 + w * 35), 'UBER KENYA'));
    on(mon + 4, 7, 32, (s) => ib.airtime(s, cents(100)));
    on(mon + 4, 19, 5, (s) => ib.buyGoods(s, cents(1200 + w * 40), 'NAIVAS LTD KILIMANI'));
    on(mon + 5, 11, 20, (s) => ib.buyGoods(s, cents(2400 + w * 60), 'QUICKMART LTD'));
  }
  // KPLC tokens every second week.
  for (const [day, amount] of [[dayOf(2026, 8, 20), 1500], [dayOf(2026, 9, 3), 1500], [dayOf(2026, 9, 17), 1500], [dayOf(2026, 10, 1), 2000]] as const) {
    on(day, 20, 10, (s) => ib.payBill(s, cents(amount), 'KPLC PREPAID', '37194821'));
  }
  // Month end: salary, most of it to M-PESA, then mum, M-Shwari and rent.
  on(dayOf(2026, 8, 28), 9, 12, (s) => ib.salary(s, cents(85000)));
  on(dayOf(2026, 8, 28), 9, 20, (s) => ib.bankToMpesa(s, cents(55000)));
  on(dayOf(2026, 8, 29), 10, 0, (s) => ib.sendMoney(s, cents(3000), 'JANE WANJIRU', '0733445566'));
  on(dayOf(2026, 8, 29), 10, 4, (s) => ib.mshwariDeposit(s, cents(5000)));
  on(dayOf(2026, 8, 31), 23, 50, (s) => ib.bankFee(s, cents(120), 'MONTHLY LEDGER FEE'));
  on(dayOf(2026, 9, 1), 8, 5, (s) => ib.payBill(s, cents(18000), 'MAKAO PROPERTIES', 'A12'));
  on(dayOf(2026, 9, 28), 9, 12, (s) => ib.salary(s, cents(85000)));
  on(dayOf(2026, 9, 28), 9, 20, (s) => ib.bankToMpesa(s, cents(60000)));
  on(dayOf(2026, 9, 29), 10, 0, (s) => ib.sendMoney(s, cents(3000), 'JANE WANJIRU', '0733445566'));
  on(dayOf(2026, 9, 29), 10, 4, (s) => ib.mshwariDeposit(s, cents(5000)));
  on(dayOf(2026, 9, 30), 23, 50, (s) => ib.bankFee(s, cents(120), 'MONTHLY LEDGER FEE'));
  on(dayOf(2026, 10, 1), 8, 5, (s) => ib.payBill(s, cents(18000), 'MAKAO PROPERTIES', 'A12'));
  // Netflix; the August one is delivered twice by the network.
  on(dayOf(2026, 8, 24), 6, 2, (s) => {
    ib.payBill(s, cents(1100), 'NETFLIX', 'WANJIRU');
    ib.duplicateLast();
  });
  on(dayOf(2026, 9, 24), 6, 2, (s) => ib.payBill(s, cents(1100), 'NETFLIX', 'WANJIRU'));
  // A friend pays back lunch money; savings moved back to the bank.
  on(dayOf(2026, 9, 12), 13, 45, (s) => ib.receiveFromPerson(s, cents(1500), 'PETER OTIENO', '0711223344'));
  on(dayOf(2026, 9, 30), 9, 30, (s) => ib.mpesaToBank(s, cents(10000)));

  events.sort((a, b) => a.day - b.day || a.hh - b.hh || a.mm - b.mm);
  for (const e of events) e.run(stamp(e.day, e.hh, e.mm));

  return {
    lines: ib.lines,
    summary: {
      lines: ib.lines.length,
      final_balances_cents: { mpesa: ib.mpesa, bank: ib.bank, mshwari: ib.mshwari, fuliza_outstanding: ib.fulizaOutstanding },
    },
  };
}

export function toJsonl(lines: readonly DemoLine[]): string {
  return `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`;
}
