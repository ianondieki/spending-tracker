/**
 * Monthly ReportDocument fixtures (en and sw) for September 2026. Every figure is a display string from the
 * FactsSheet (referenced, not retyped). Copy is ordinary product copy [[COPY-REVIEW]].
 */
import { formatKsh } from '../format.js';
import type { HeroSection, ReportDocument } from '../types.js';
import { monthlyFacts as f } from './monthly-facts.js';

const t = f.totals;
const d = f.deltas;
const prev = f.previous_totals;
const cat = (id: string) => f.categories.find((c) => c.category_id === id)!;
const acct = (ref: string) => f.accounts.find((a) => a.account_ref === ref)!;
const budget = (id: string) => f.budgets.find((b) => b.category_id === id)!;
const month = (m: string) => f.trend_months.find((x) => x.month === m)!;
const mpesa = acct('mpesa:0712***456');
const kcb = acct('kcb:***890');
const mshwari = acct('mshwari:0712***456');
const ytd = f.ytd!;
const salary = f.income[0]!;

/** Top six categories, then everything else, so the column adds up to the total under the double rule. */
function tally(locale: 'en' | 'sw'): HeroSection['tally'] {
  const top = f.categories.slice(0, 6);
  const restCents = f.categories.slice(6).reduce((sum, c) => sum + c.out.cents, 0);
  return [
    ...top.map((c) => ({ label: locale === 'en' ? c.name_en : c.name_sw, value: c.out.display, cents: c.out.cents })),
    { label: locale === 'en' ? 'Everything else' : 'Mengine yote', value: formatKsh(restCents), cents: restCents },
  ];
}

const meta: ReportDocument['meta'] = {
  generated_at: f.generated_at,
  facts_version: f.version,
  writer: 'fallback',
  model: null,
  input_tokens: 0,
  output_tokens: 0,
  cost_usd: 0,
  fact_check: { passed: true, violations: [], attempts: 1 },
};

export const monthlyDocEn: ReportDocument = {
  version: '1',
  report_id: 'rpt_m_2026-09_en',
  kind: 'monthly',
  locale: 'en',
  period_label: f.period.label_en,
  title: 'Your September in money',
  sections: [
    {
      type: 'hero',
      total_out: t.out.display,
      delta: d.out.display,
      delta_direction: d.out.direction,
      verdict: `You spent ${d.out.pct.display} more than in August and still put ${t.savings_out.display} into M-Shwari.`,
      tally: tally('en'),
    },
    {
      type: 'kpis',
      items: [
        { label: 'Money in', value: t.in.display, delta: d.in.display, tone: 'in' },
        { label: 'Money out', value: t.out.display, delta: d.out.display, tone: 'out' },
        { label: 'Fees', value: t.fees.display, delta: d.fees.display, tone: 'fee' },
        { label: 'Saved', value: t.savings_out.display, delta: null, tone: 'transfer' },
      ],
    },
    {
      type: 'chart',
      chart_id: 'trend',
      chart_type: 'trend_lines',
      title: 'Spending has climbed for two months while income edged up',
      takeaway: `September closed at ${t.net.display} net, down from ${month('2026-08').net.display} in August.`,
      data_ref: '/trend_months',
      alt_text: `Three lines over six months, April to September, for money in, money out and net. Income rose from ${month('2026-04').in.display} to ${t.in.display}. Spending rose from ${month('2026-04').out.display} to ${t.out.display}. Net was highest in August at ${month('2026-08').net.display} and ${t.net.display} in September, which is highlighted.`,
    },
    {
      type: 'chart',
      chart_id: 'in_out',
      chart_type: 'stacked_in_out',
      title: `Income beat spending by ${t.net.display} after fees`,
      takeaway: null,
      data_ref: '/totals',
      alt_text: `Two bars compare September and August. September: ${t.in.display} in, ${t.out.display} out, net ${t.net.display}. August: ${prev.in.display} in, ${prev.out.display} out, net ${prev.net.display}.`,
    },
    {
      type: 'chart',
      chart_id: 'waterfall',
      chart_type: 'waterfall',
      title: `Rent and groceries took ${cat('rent').share.display} and ${cat('groceries').share.display} of the month`,
      takeaway: null,
      data_ref: '/totals',
      alt_text: `A waterfall from ${t.in.display} income down through rent ${cat('rent').out.display}, groceries ${cat('groceries').out.display}, family and friends ${cat('family').out.display}, transport ${cat('transport').out.display}, utilities ${cat('utilities').out.display}, other categories and fees ${t.fees.display}, ending at ${t.net.display} net.`,
    },
    {
      type: 'chart',
      chart_id: 'categories',
      chart_type: 'donut',
      title: `Rent is ${cat('rent').share.display} of spending; health more than doubled`,
      takeaway: `Health rose ${cat('health').delta.pct.display} to ${cat('health').out.display} after a hospital visit. Other fell ${cat('other').delta.display}.`,
      data_ref: '/categories',
      alt_text: `Donut of ${t.out.display} spending by category. Rent and housing ${cat('rent').out.display} (${cat('rent').share.display}), groceries ${cat('groceries').out.display} (${cat('groceries').share.display}), family and friends ${cat('family').out.display} (${cat('family').share.display}), transport ${cat('transport').out.display} (${cat('transport').share.display}), utilities ${cat('utilities').out.display} (${cat('utilities').share.display}), eating out ${cat('eating_out').out.display} (${cat('eating_out').share.display}), the remaining four categories make up the rest.`,
    },
    {
      type: 'table',
      title: 'Where it went',
      columns: ['Category', 'Spent', 'Share', 'vs August'],
      rows: f.categories.map((c) => [c.name_en, c.out.display, c.share.display, c.delta.display]),
      numeric_columns: [1, 2, 3],
      total_row: ['Total', t.out.display, '', d.out.display],
    },
    {
      type: 'chart',
      chart_id: 'daily',
      chart_type: 'daily_bars',
      title: `Rent day was the spendiest at ${f.spendiest_day!.out.display}; most days sat near ${f.average_daily_out.display}`,
      takeaway: null,
      data_ref: '/daily',
      alt_text: `Thirty bars, one per day of September, against an average line at ${f.average_daily_out.display}. The 1st stands out at ${f.spendiest_day!.out.display} because of rent, and the 28th at ${f.daily[27]!.out.display} on payday.`,
    },
    {
      type: 'chart',
      chart_id: 'heatmap',
      chart_type: 'calendar_heatmap',
      title: 'Weekends were a little heavier than weekdays',
      takeaway: `Weekends took ${f.weekday_weekend.weekend_share.display} of spending, ${f.weekday_weekend.weekend_out.display} across eight days.`,
      data_ref: '/daily',
      alt_text: `A September calendar shaded by daily spending. Darkest on the 1st (${f.spendiest_day!.out.display}) and the 28th (${f.daily[27]!.out.display}); Saturdays and Sundays slightly darker than the weekdays around them.`,
    },
    {
      type: 'chart',
      chart_id: 'merchants',
      chart_type: 'top_bars',
      title: `After rent, Naivas was the biggest merchant at ${f.merchants[1]!.out.display}`,
      takeaway: 'New this month: Carrefour Two Rivers and Aga Khan University Hospital.',
      data_ref: '/merchants',
      alt_text: `Horizontal bars for the top eight merchants. ${f.merchants
        .slice(0, 8)
        .map((m) => `${m.name} ${m.out.display}${m.is_new ? ' (new)' : ''}`)
        .join(', ')}.`,
    },
    {
      type: 'table',
      title: 'People',
      columns: ['Person', 'Sent', 'Received'],
      rows: f.people.map((p) => [p.name, p.sent.display, p.received.display]),
      numeric_columns: [1, 2],
      total_row: null,
    },
    {
      type: 'table',
      title: 'Income by source',
      columns: ['Source', 'Received', 'Payments'],
      rows: f.income.map((s) => [s.source, s.in.display, s.count.display]),
      numeric_columns: [1, 2],
      total_row: ['Total', t.in.display, ''],
    },
    {
      type: 'chart',
      chart_id: 'fees',
      chart_type: 'fee_meter',
      title: `Fees were ${t.fee_ratio.display} of spending, up ${d.fees.pct.display} on August`,
      takeaway: null,
      data_ref: '/totals/fees',
      alt_text: `A short ruled bar: fees of ${t.fees.display} are ${t.fee_ratio.display} of ${t.out.display} spent.`,
    },
    {
      type: 'callout',
      tone: 'fee',
      body: `Fees came to ${t.fees.display}, ${d.fees.display} more than August. Fuliza accounted for ${f.overdraft.fuliza_cost.display} over ${f.overdraft.days_in_overdraft.display} days before payday.`,
    },
    {
      type: 'table',
      title: 'Moved, not spent',
      columns: ['Movement', 'Amount'],
      rows: [
        ['To M-Shwari', t.savings_out.display],
        ['Cash withdrawn', t.cash_withdrawn.display],
        ['Loans repaid', t.loan_repayments.display],
        ['Everything moved between your accounts, including the salary transfer from KCB to M-Pesa', t.transfers.display],
      ],
      numeric_columns: [1],
      total_row: null,
    },
    {
      type: 'callout',
      tone: 'neutral',
      body: `You saved ${t.savings_rate.display} of what came in, up from ${prev.savings_rate.display} in August. M-Shwari now holds ${mshwari.balance!.display}.`,
    },
    {
      type: 'chart',
      chart_id: 'budgets',
      chart_type: 'budget_bullets',
      title: 'Transport and eating out went over; groceries held',
      takeaway: null,
      data_ref: '/budgets',
      alt_text: `Four budget bars for September. Groceries ${budget('groceries').spent.display} of ${budget('groceries').limit.display}. Transport ${budget('transport').spent.display} of ${budget('transport').limit.display}, over. Eating out ${budget('eating_out').spent.display} of ${budget('eating_out').limit.display}, over. Family and friends ${budget('family').spent.display} of ${budget('family').limit.display}, exactly on the limit.`,
    },
    {
      type: 'table',
      title: 'Bills expected in October',
      columns: ['Payment', 'Usually', 'Expected'],
      rows: [
        ['Mwangi Properties (rent)', f.recurring[0]!.typical_amount.display, '1 October'],
        ['Nairobi Water', f.recurring[4]!.typical_amount.display, '8 October'],
        ['Safaricom Home Fibre', f.recurring[2]!.typical_amount.display, '15 October'],
        ['Netflix', f.recurring[3]!.typical_amount.display, '20 October'],
        ['KPLC prepaid', f.recurring[1]!.typical_amount.display, '24 October'],
      ],
      numeric_columns: [1],
      total_row: null,
    },
    {
      type: 'chart',
      chart_id: 'balance_mpesa',
      chart_type: 'balance_sparkline',
      title: `M-Pesa dipped into Fuliza for ${f.overdraft.days_in_overdraft.display} days before payday`,
      takeaway: null,
      data_ref: '/accounts/0/balance_series',
      alt_text: `M-Pesa balance across September, falling through the month to below zero around the 25th and recovering to ${mpesa.balance!.display} after the salary transfer on the 28th.`,
    },
    {
      type: 'chart',
      chart_id: 'balance_kcb',
      chart_type: 'balance_sparkline',
      title: `KCB ended the month at ${kcb.balance!.display}`,
      takeaway: null,
      data_ref: '/accounts/1/balance_series',
      alt_text: `KCB balance across September, stepping down with rent and card payments and jumping to ${kcb.balance!.display} on the 28th when the salary of ${salary.in.display} landed.`,
    },
    {
      type: 'table',
      title: 'When you spend',
      columns: ['Time of day', 'Spent', 'Payments'],
      rows: f.time_of_day.map((b) => [
        { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Night' }[b.bucket],
        b.out.display,
        b.count.display,
      ]),
      numeric_columns: [1, 2],
      total_row: null,
    },
    {
      type: 'insights',
      title: 'Worth knowing',
      items: [
        {
          insight_id: 'ci_m_15',
          headline: 'Highest income month since April',
          body: `${t.in.display} came in, including ${salary.in.display} from ${salary.source} and ${f.income[1]!.in.display} from Kamau Hardware.`,
          drilldown: null,
        },
        {
          insight_id: 'ci_m_06',
          headline: `Fuliza cost ${f.overdraft.fuliza_cost.display} in the last week`,
          body: `You drew ${f.overdraft.fuliza_drawdown.display} across ${f.overdraft.days_in_overdraft.display} days and repaid it on payday. Moving part of the salary transfer earlier would avoid the charge.`,
          drilldown: null,
        },
        {
          insight_id: 'ci_m_07',
          headline: `Health spending rose to ${cat('health').out.display}`,
          body: 'A visit to Aga Khan University Hospital and two pharmacy runs. Hesabu filed the hospital under health; change it if that is wrong.',
          drilldown: null,
        },
        {
          insight_id: 'ci_m_09',
          headline: `Transport finished ${budget('transport').used.display} of its budget`,
          body: `${budget('transport').spent.display} against ${budget('transport').limit.display}. Fuel at Total Energies was ${f.merchants[2]!.out.display} of it.`,
          drilldown: null,
        },
        {
          insight_id: 'ci_m_11',
          headline: `${t.transfers.display} moved between your own accounts`,
          body: `None of it is counted as spending. ${t.savings_out.display} went to M-Shwari and ${t.cash_withdrawn.display} came out as cash.`,
          drilldown: null,
        },
        {
          insight_id: 'ci_m_14',
          headline: 'A new place: Carrefour Two Rivers',
          body: `${f.merchants[7]!.out.display} over two visits, filed under groceries.`,
          drilldown: null,
        },
      ],
    },
    {
      type: 'list',
      title: 'Where the money could go differently',
      items: [
        `Moving ${t.savings_out.display} to M-Shwari on payday, before the rent, would have kept M-Pesa out of Fuliza.`,
        `Eating out was ${cat('eating_out').out.display}. Two fewer Java House visits a month is roughly ${f.merchants[9]!.out.display}.`,
        `Transport at ${cat('transport').out.display} was the third-largest category after rent and groceries.`,
      ],
    },
    {
      type: 'kpis',
      items: [
        { label: 'Year to date in', value: ytd.in.display, delta: null, tone: 'in' },
        { label: 'Year to date out', value: ytd.out.display, delta: null, tone: 'out' },
        { label: 'Year to date fees', value: ytd.fees.display, delta: null, tone: 'fee' },
        { label: 'Year to date saved', value: ytd.savings_out.display, delta: null, tone: 'transfer' },
      ],
    },
    {
      type: 'watch',
      title: 'Three things to watch in October',
      items: [
        `Rent of ${f.recurring[0]!.typical_amount.display} is expected on 1 October.`,
        `Transport and eating out both went over budget; October starts from zero.`,
        `${f.unknown_messages.display} messages could not be read. Teach Hesabu what they were.`,
      ],
    },
    {
      type: 'footer',
      accounts_covered: [`${mpesa.label} ${mpesa.account_ref.split(':')[1]}`, `${kcb.label} ${kcb.account_ref.split(':')[1]}`, mshwari.label],
      computed_note: 'Every number is computed from your money messages. Nothing is estimated.',
      unknown_count: f.unknown_messages.display,
    },
  ],
  whatsapp: {
    caption: [
      `*Hesabu, ${f.period.label_en}*`,
      '',
      `You spent *${t.out.display}*, ${d.out.display} (${d.out.pct.display}) on August.`,
      `Money in ${t.in.display}. Fees ${t.fees.display}. Net ${t.net.display}.`,
      '',
      `Rent ${cat('rent').share.display}, groceries ${cat('groceries').share.display}. Health more than doubled to ${cat('health').out.display}.`,
      `${t.savings_out.display} saved, ${t.savings_rate.display} of income. Fuliza cost ${f.overdraft.fuliza_cost.display}.`,
      '',
      '_Full report, drill-downs and the PDF are in the link below._',
    ].join('\n'),
    hero_chart_ids: ['categories'],
  },
  email: {
    subject: `Your September in money: ${t.out.display} spent, ${t.savings_out.display} saved`,
    preheader: `Rent ${cat('rent').share.display}, health up ${cat('health').delta.pct.display}, fees ${t.fees.display}. Bills expected in October.`,
  },
  meta,
};

export const monthlyDocSw: ReportDocument = {
  version: '1',
  report_id: 'rpt_m_2026-09_sw',
  kind: 'monthly',
  locale: 'sw',
  period_label: f.period.label_sw,
  title: 'Septemba yako kwa pesa',
  sections: [
    {
      type: 'hero',
      total_out: t.out.display,
      delta: d.out.display,
      delta_direction: d.out.direction,
      verdict: `Ulitumia ${d.out.pct.display} zaidi ya Agosti na bado ukaweka ${t.savings_out.display} M-Shwari.`,
      tally: tally('sw'),
    },
    {
      type: 'kpis',
      items: [
        { label: 'Zilizoingia', value: t.in.display, delta: d.in.display, tone: 'in' },
        { label: 'Zilizotoka', value: t.out.display, delta: d.out.display, tone: 'out' },
        { label: 'Ada', value: t.fees.display, delta: d.fees.display, tone: 'fee' },
        { label: 'Akiba', value: t.savings_out.display, delta: null, tone: 'transfer' },
      ],
    },
    {
      type: 'chart',
      chart_id: 'trend',
      chart_type: 'trend_lines',
      title: 'Matumizi yamepanda kwa miezi miwili huku mapato yakiongezeka kidogo',
      takeaway: `Septemba ilifunga na salio la ${t.net.display}, chini ya ${month('2026-08').net.display} ya Agosti.`,
      data_ref: '/trend_months',
      alt_text: `Mistari mitatu kwa miezi sita, Aprili hadi Septemba, ya zilizoingia, zilizotoka na salio. Mapato yalipanda kutoka ${month('2026-04').in.display} hadi ${t.in.display}. Matumizi yalipanda kutoka ${month('2026-04').out.display} hadi ${t.out.display}. Salio lilikuwa juu zaidi Agosti, ${month('2026-08').net.display}, na ${t.net.display} Septemba, ambayo imeangaziwa.`,
    },
    {
      type: 'chart',
      chart_id: 'in_out',
      chart_type: 'stacked_in_out',
      title: `Mapato yalizidi matumizi kwa ${t.net.display} baada ya ada`,
      takeaway: null,
      data_ref: '/totals',
      alt_text: `Miraba miwili inalinganisha Septemba na Agosti. Septemba: ${t.in.display} ziliingia, ${t.out.display} zilitoka, salio ${t.net.display}. Agosti: ${prev.in.display} ziliingia, ${prev.out.display} zilitoka, salio ${prev.net.display}.`,
    },
    {
      type: 'chart',
      chart_id: 'waterfall',
      chart_type: 'waterfall',
      title: `Kodi na mboga zilichukua ${cat('rent').share.display} na ${cat('groceries').share.display} ya mwezi`,
      takeaway: null,
      data_ref: '/totals',
      alt_text: `Maporomoko kutoka mapato ya ${t.in.display} kupitia kodi ${cat('rent').out.display}, mboga na chakula ${cat('groceries').out.display}, familia na marafiki ${cat('family').out.display}, usafiri ${cat('transport').out.display}, umeme na maji ${cat('utilities').out.display}, kategoria nyingine na ada ${t.fees.display}, hadi salio la ${t.net.display}.`,
    },
    {
      type: 'chart',
      chart_id: 'categories',
      chart_type: 'donut',
      title: `Kodi ni ${cat('rent').share.display} ya matumizi; afya iliongezeka zaidi ya maradufu`,
      takeaway: `Afya ilipanda ${cat('health').delta.pct.display} hadi ${cat('health').out.display} baada ya kwenda hospitali. Mengineyo yalipungua ${cat('other').delta.display}.`,
      data_ref: '/categories',
      alt_text: `Donati ya matumizi ya ${t.out.display} kwa kategoria. Kodi na nyumba ${cat('rent').out.display} (${cat('rent').share.display}), mboga na chakula ${cat('groceries').out.display} (${cat('groceries').share.display}), familia na marafiki ${cat('family').out.display} (${cat('family').share.display}), usafiri ${cat('transport').out.display} (${cat('transport').share.display}), umeme na maji ${cat('utilities').out.display} (${cat('utilities').share.display}), kula nje ${cat('eating_out').out.display} (${cat('eating_out').share.display}), kategoria nne zilizobaki ndizo zinakamilisha.`,
    },
    {
      type: 'table',
      title: 'Pesa zilienda wapi',
      columns: ['Kategoria', 'Zilizotumika', 'Sehemu', 'Ikilinganishwa na Agosti'],
      rows: f.categories.map((c) => [c.name_sw, c.out.display, c.share.display, c.delta.display]),
      numeric_columns: [1, 2, 3],
      total_row: ['Jumla', t.out.display, '', d.out.display],
    },
    {
      type: 'chart',
      chart_id: 'daily',
      chart_type: 'daily_bars',
      title: `Siku ya kodi ndiyo ulitumia zaidi, ${f.spendiest_day!.out.display}; siku nyingi zilikaa karibu na ${f.average_daily_out.display}`,
      takeaway: null,
      data_ref: '/daily',
      alt_text: `Miraba thelathini, mmoja kwa kila siku ya Septemba, na mstari wa wastani wa ${f.average_daily_out.display}. Tarehe 1 inajitokeza kwa ${f.spendiest_day!.out.display} kwa sababu ya kodi, na tarehe 28 kwa ${f.daily[27]!.out.display} siku ya mshahara.`,
    },
    {
      type: 'chart',
      chart_id: 'heatmap',
      chart_type: 'calendar_heatmap',
      title: 'Wikendi zilikuwa nzito kidogo kuliko siku za kazi',
      takeaway: `Wikendi zilichukua ${f.weekday_weekend.weekend_share.display} ya matumizi, ${f.weekday_weekend.weekend_out.display} kwa siku nane.`,
      data_ref: '/daily',
      alt_text: `Kalenda ya Septemba iliyotiwa kivuli kulingana na matumizi ya kila siku. Nyeusi zaidi tarehe 1 (${f.spendiest_day!.out.display}) na tarehe 28 (${f.daily[27]!.out.display}); Jumamosi na Jumapili nyeusi kidogo kuliko siku za kazi zilizo karibu.`,
    },
    {
      type: 'chart',
      chart_id: 'merchants',
      chart_type: 'top_bars',
      title: `Baada ya kodi, Naivas ndiyo duka kubwa zaidi, ${f.merchants[1]!.out.display}`,
      takeaway: 'Mpya mwezi huu: Carrefour Two Rivers na Aga Khan University Hospital.',
      data_ref: '/merchants',
      alt_text: `Miraba ya kulala ya maduka nane ya juu. ${f.merchants
        .slice(0, 8)
        .map((m) => `${m.name} ${m.out.display}${m.is_new ? ' (mpya)' : ''}`)
        .join(', ')}.`,
    },
    {
      type: 'table',
      title: 'Watu',
      columns: ['Mtu', 'Ulizotuma', 'Ulizopokea'],
      rows: f.people.map((p) => [p.name, p.sent.display, p.received.display]),
      numeric_columns: [1, 2],
      total_row: null,
    },
    {
      type: 'table',
      title: 'Mapato kwa chanzo',
      columns: ['Chanzo', 'Ulizopokea', 'Malipo'],
      rows: f.income.map((s) => [s.source, s.in.display, s.count.display]),
      numeric_columns: [1, 2],
      total_row: ['Jumla', t.in.display, ''],
    },
    {
      type: 'chart',
      chart_id: 'fees',
      chart_type: 'fee_meter',
      title: `Ada zilikuwa ${t.fee_ratio.display} ya matumizi, juu kwa ${d.fees.pct.display} kuliko Agosti`,
      takeaway: null,
      data_ref: '/totals/fees',
      alt_text: `Mstari mfupi wenye mistari: ada za ${t.fees.display} ni ${t.fee_ratio.display} ya ${t.out.display} zilizotumika.`,
    },
    {
      type: 'callout',
      tone: 'fee',
      body: `Ada zilifikia ${t.fees.display}, ${d.fees.display} zaidi ya Agosti. Fuliza ilichukua ${f.overdraft.fuliza_cost.display} kwa siku ${f.overdraft.days_in_overdraft.display} kabla ya mshahara.`,
    },
    {
      type: 'table',
      title: 'Zilizohamishwa, si matumizi',
      columns: ['Hatua', 'Kiasi'],
      rows: [
        ['Kwenda M-Shwari', t.savings_out.display],
        ['Pesa taslimu ulizotoa', t.cash_withdrawn.display],
        ['Mikopo uliyolipa', t.loan_repayments.display],
        ['Zote zilizohamishwa kati ya akaunti zako, pamoja na uhamisho wa mshahara kutoka KCB hadi M-Pesa', t.transfers.display],
      ],
      numeric_columns: [1],
      total_row: null,
    },
    {
      type: 'callout',
      tone: 'neutral',
      body: `Uliweka akiba ${t.savings_rate.display} ya zilizoingia, juu kutoka ${prev.savings_rate.display} Agosti. M-Shwari sasa ina ${mshwari.balance!.display}.`,
    },
    {
      type: 'chart',
      chart_id: 'budgets',
      chart_type: 'budget_bullets',
      title: 'Usafiri na kula nje zilipita bajeti; mboga zilishikilia',
      takeaway: null,
      data_ref: '/budgets',
      alt_text: `Miraba minne ya bajeti kwa Septemba. Mboga na chakula ${budget('groceries').spent.display} kati ya ${budget('groceries').limit.display}. Usafiri ${budget('transport').spent.display} kati ya ${budget('transport').limit.display}, imepita. Kula nje ${budget('eating_out').spent.display} kati ya ${budget('eating_out').limit.display}, imepita. Familia na marafiki ${budget('family').spent.display} kati ya ${budget('family').limit.display}, sawa kabisa na kikomo.`,
    },
    {
      type: 'table',
      title: 'Bili zinazotarajiwa Oktoba',
      columns: ['Malipo', 'Kwa kawaida', 'Inatarajiwa'],
      rows: [
        ['Mwangi Properties (kodi)', f.recurring[0]!.typical_amount.display, '1 Oktoba'],
        ['Nairobi Water', f.recurring[4]!.typical_amount.display, '8 Oktoba'],
        ['Safaricom Home Fibre', f.recurring[2]!.typical_amount.display, '15 Oktoba'],
        ['Netflix', f.recurring[3]!.typical_amount.display, '20 Oktoba'],
        ['KPLC prepaid', f.recurring[1]!.typical_amount.display, '24 Oktoba'],
      ],
      numeric_columns: [1],
      total_row: null,
    },
    {
      type: 'chart',
      chart_id: 'balance_mpesa',
      chart_type: 'balance_sparkline',
      title: `M-Pesa iliingia Fuliza kwa siku ${f.overdraft.days_in_overdraft.display} kabla ya mshahara`,
      takeaway: null,
      data_ref: '/accounts/0/balance_series',
      alt_text: `Salio la M-Pesa kwa Septemba nzima, likishuka mwezi mzima hadi chini ya sifuri karibu na tarehe 25 na kurudi ${mpesa.balance!.display} baada ya uhamisho wa mshahara tarehe 28.`,
    },
    {
      type: 'chart',
      chart_id: 'balance_kcb',
      chart_type: 'balance_sparkline',
      title: `KCB ilifunga mwezi na ${kcb.balance!.display}`,
      takeaway: null,
      data_ref: '/accounts/1/balance_series',
      alt_text: `Salio la KCB kwa Septemba nzima, likishuka na kodi na malipo ya kadi na kuruka hadi ${kcb.balance!.display} tarehe 28 mshahara wa ${salary.in.display} ulipoingia.`,
    },
    {
      type: 'table',
      title: 'Unapotumia pesa',
      columns: ['Wakati', 'Zilizotumika', 'Malipo'],
      rows: f.time_of_day.map((b) => [
        { morning: 'Asubuhi', afternoon: 'Mchana', evening: 'Jioni', night: 'Usiku' }[b.bucket],
        b.out.display,
        b.count.display,
      ]),
      numeric_columns: [1, 2],
      total_row: null,
    },
    {
      type: 'insights',
      title: 'Yafaa kujua',
      items: [
        {
          insight_id: 'ci_m_15',
          headline: 'Mwezi wenye mapato ya juu zaidi tangu Aprili',
          body: `Ziliingia ${t.in.display}, pamoja na ${salary.in.display} kutoka ${salary.source} na ${f.income[1]!.in.display} kutoka Kamau Hardware.`,
          drilldown: null,
        },
        {
          insight_id: 'ci_m_06',
          headline: `Fuliza iligharimu ${f.overdraft.fuliza_cost.display} wiki ya mwisho`,
          body: `Ulichukua ${f.overdraft.fuliza_drawdown.display} kwa siku ${f.overdraft.days_in_overdraft.display} na ukalipa siku ya mshahara. Kuhamisha sehemu ya mshahara mapema kungeepusha gharama hiyo.`,
          drilldown: null,
        },
        {
          insight_id: 'ci_m_07',
          headline: `Matumizi ya afya yalipanda hadi ${cat('health').out.display}`,
          body: 'Ziara ya Aga Khan University Hospital na mara mbili za duka la dawa. Hesabu iliweka hospitali chini ya afya; badilisha ikiwa si sahihi.',
          drilldown: null,
        },
        {
          insight_id: 'ci_m_09',
          headline: `Usafiri ulimaliza ${budget('transport').used.display} ya bajeti yake`,
          body: `${budget('transport').spent.display} dhidi ya ${budget('transport').limit.display}. Mafuta Total Energies yalikuwa ${f.merchants[2]!.out.display} kati yake.`,
          drilldown: null,
        },
        {
          insight_id: 'ci_m_11',
          headline: `${t.transfers.display} zilihamishwa kati ya akaunti zako`,
          body: `Hakuna inayohesabiwa kama matumizi. ${t.savings_out.display} zilienda M-Shwari na ${t.cash_withdrawn.display} zilitoka taslimu.`,
          drilldown: null,
        },
        {
          insight_id: 'ci_m_14',
          headline: 'Sehemu mpya: Carrefour Two Rivers',
          body: `${f.merchants[7]!.out.display} kwa ziara mbili, chini ya mboga na chakula.`,
          drilldown: null,
        },
      ],
    },
    {
      type: 'list',
      title: 'Pesa zingeweza kwenda vipi tofauti',
      items: [
        `Kuhamisha ${t.savings_out.display} M-Shwari siku ya mshahara, kabla ya kodi, kungeweka M-Pesa nje ya Fuliza.`,
        `Kula nje kulikuwa ${cat('eating_out').out.display}. Ziara mbili chache za Java House kwa mwezi ni takriban ${f.merchants[9]!.out.display}.`,
        `Usafiri wa ${cat('transport').out.display} ulikuwa kategoria ya tatu kwa ukubwa baada ya kodi na mboga.`,
      ],
    },
    {
      type: 'kpis',
      items: [
        { label: 'Zilizoingia mwaka huu', value: ytd.in.display, delta: null, tone: 'in' },
        { label: 'Zilizotoka mwaka huu', value: ytd.out.display, delta: null, tone: 'out' },
        { label: 'Ada mwaka huu', value: ytd.fees.display, delta: null, tone: 'fee' },
        { label: 'Akiba mwaka huu', value: ytd.savings_out.display, delta: null, tone: 'transfer' },
      ],
    },
    {
      type: 'watch',
      title: 'Mambo matatu ya kuangalia Oktoba',
      items: [
        `Kodi ya ${f.recurring[0]!.typical_amount.display} inatarajiwa tarehe 1 Oktoba.`,
        `Usafiri na kula nje zote zilipita bajeti; Oktoba inaanza kutoka sifuri.`,
        `Jumbe ${f.unknown_messages.display} hazikusomeka. Fundisha Hesabu zilikuwa nini.`,
      ],
    },
    {
      type: 'footer',
      accounts_covered: [`${mpesa.label} ${mpesa.account_ref.split(':')[1]}`, `${kcb.label} ${kcb.account_ref.split(':')[1]}`, mshwari.label],
      computed_note: 'Kila nambari imehesabiwa kutoka kwa jumbe zako za pesa. Hakuna makadirio.',
      unknown_count: f.unknown_messages.display,
    },
  ],
  whatsapp: {
    caption: [
      `*Hesabu, ${f.period.label_sw}*`,
      '',
      `Ulitumia *${t.out.display}*, ${d.out.display} (${d.out.pct.display}) ikilinganishwa na Agosti.`,
      `Ziliingia ${t.in.display}. Ada ${t.fees.display}. Salio ${t.net.display}.`,
      '',
      `Kodi ${cat('rent').share.display}, mboga ${cat('groceries').share.display}. Afya iliongezeka zaidi ya maradufu hadi ${cat('health').out.display}.`,
      `Akiba ${t.savings_out.display}, ${t.savings_rate.display} ya mapato. Fuliza iligharimu ${f.overdraft.fuliza_cost.display}.`,
      '',
      '_Ripoti kamili, maelezo ya kila nambari na PDF ziko kwenye kiungo hapa chini._',
    ].join('\n'),
    hero_chart_ids: ['categories'],
  },
  email: {
    subject: `Septemba yako kwa pesa: ${t.out.display} zilitumika, ${t.savings_out.display} akiba`,
    preheader: `Kodi ${cat('rent').share.display}, afya juu ${cat('health').delta.pct.display}, ada ${t.fees.display}. Bili zinazotarajiwa Oktoba.`,
  },
  meta,
};
