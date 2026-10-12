/**
 * Weekly ReportDocument fixtures (en and sw) for the week of 5 to 11 October 2026, written the way the
 * numbers-only fallback or the writer step would: every figure is a display string from the FactsSheet, so the
 * objects below reference the facts rather than retyping numbers. Copy is ordinary product copy [[COPY-REVIEW]].
 */
import type { HeroSection, ReportDocument } from '../types.js';
import { weeklyFacts as f } from './weekly-facts.js';

const t = f.totals;
const d = f.deltas;
const cat = (id: string) => f.categories.find((c) => c.category_id === id)!;
const acct = (ref: string) => f.accounts.find((a) => a.account_ref === ref)!;
const budget = (id: string) => f.budgets.find((b) => b.category_id === id)!;
const mpesa = acct('mpesa:0712***456');
const kcb = acct('kcb:***890');
const mshwari = acct('mshwari:0712***456');
const spendiest = f.spendiest_day!;

function tally(locale: 'en' | 'sw'): HeroSection['tally'] {
  return f.daily.map((day) => ({
    label: locale === 'en' ? day.weekday_en : day.weekday_sw,
    value: day.out.display,
    cents: day.out.cents,
  }));
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

export const weeklyDocEn: ReportDocument = {
  version: '1',
  report_id: 'rpt_w_2026-10-05_en',
  kind: 'weekly',
  locale: 'en',
  period_label: f.period.label_en,
  title: 'Your week in money',
  sections: [
    {
      type: 'hero',
      total_out: t.out.display,
      delta: d.out.display,
      delta_direction: d.out.direction,
      verdict: `You spent ${d.out.pct.display} more than last week, mostly on groceries and money sent home.`,
      tally: tally('en'),
    },
    {
      type: 'kpis',
      items: [
        { label: 'Money in', value: t.in.display, delta: d.in.display, tone: 'in' },
        { label: 'Money out', value: t.out.display, delta: d.out.display, tone: 'out' },
        { label: 'Fees', value: t.fees.display, delta: d.fees.display, tone: 'fee' },
        { label: 'Net', value: t.net.display, delta: null, tone: 'neutral' },
      ],
    },
    {
      type: 'chart',
      chart_id: 'in_out',
      chart_type: 'stacked_in_out',
      title: 'Money in fell after last week’s salary; spending held steady',
      takeaway: `${t.in.display} came in against ${t.out.display} out, so the week closed at ${t.net.display}.`,
      data_ref: '/totals',
      alt_text: `Two bars compare this week and last. This week: ${t.in.display} in, ${t.out.display} out, net ${t.net.display}. Last week: ${f.previous_totals.in.display} in, ${f.previous_totals.out.display} out, net ${f.previous_totals.net.display}.`,
    },
    {
      type: 'chart',
      chart_id: 'categories',
      chart_type: 'donut',
      title: `Groceries took ${cat('groceries').share.display} of the week`,
      takeaway: `Family and friends doubled to ${cat('family').out.display} after you sent money home on Friday.`,
      data_ref: '/categories',
      alt_text: `Donut of ${t.out.display} spending by category. Groceries ${cat('groceries').out.display} (${cat('groceries').share.display}), family and friends ${cat('family').out.display} (${cat('family').share.display}), transport ${cat('transport').out.display} (${cat('transport').share.display}), utilities ${cat('utilities').out.display} (${cat('utilities').share.display}), eating out ${cat('eating_out').out.display}, airtime and data ${cat('airtime').out.display}, other ${cat('other').out.display}.`,
    },
    {
      type: 'chart',
      chart_id: 'daily',
      chart_type: 'daily_bars',
      title: `Friday was the spendiest day at ${spendiest.out.display}`,
      takeaway: `The daily average was ${f.average_daily_out.display}. Thursday was the quietest day at ${f.daily[3]!.out.display}.`,
      data_ref: '/daily',
      alt_text: `Seven bars, one per day, against an average line at ${f.average_daily_out.display}. Monday ${f.daily[0]!.out.display}, Tuesday ${f.daily[1]!.out.display}, Wednesday ${f.daily[2]!.out.display}, Thursday ${f.daily[3]!.out.display}, Friday ${f.daily[4]!.out.display}, Saturday ${f.daily[5]!.out.display}, Sunday ${f.daily[6]!.out.display}.`,
    },
    {
      type: 'table',
      title: 'Where it went',
      columns: ['Category', 'Spent', 'Share', 'vs last week'],
      rows: f.categories.map((c) => [c.name_en, c.out.display, c.share.display, c.delta.display]),
      numeric_columns: [1, 2, 3],
      total_row: ['Total', t.out.display, '', d.out.display],
    },
    {
      type: 'chart',
      chart_id: 'merchants',
      chart_type: 'top_bars',
      title: `Naivas was the biggest merchant at ${f.merchants[0]!.out.display}`,
      takeaway: 'Two new places this week: Quickmart Kangemi and Kibandaski Kangemi.',
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
      type: 'chart',
      chart_id: 'fees',
      chart_type: 'fee_meter',
      title: `Fees took ${t.fee_ratio.display} of what you spent`,
      takeaway: null,
      data_ref: '/totals/fees',
      alt_text: `A short ruled bar: fees of ${t.fees.display} are ${t.fee_ratio.display} of ${t.out.display} spent.`,
    },
    {
      type: 'callout',
      tone: 'fee',
      body: `${t.fees.display} went on fees this week, ${f.overdraft.fuliza_cost.display} of it Fuliza charges for ${f.overdraft.days_in_overdraft.display} days in overdraft.`,
    },
    {
      type: 'table',
      title: 'Moved, not spent',
      columns: ['Movement', 'Amount'],
      rows: [
        ['To M-Shwari', t.savings_out.display],
        ['Cash withdrawn', t.cash_withdrawn.display],
        ['Fuliza repaid', t.loan_repayments.display],
      ],
      numeric_columns: [1],
      total_row: ['Total moved', t.transfers.display],
    },
    {
      type: 'chart',
      chart_id: 'budgets',
      chart_type: 'budget_bullets',
      title: 'Transport is on course to pass its budget',
      takeaway: `At this pace transport ends October at ${budget('transport').projected.display} against a ${budget('transport').limit.display} limit.`,
      data_ref: '/budgets',
      alt_text: `Three budget bars for October so far. Groceries ${budget('groceries').spent.display} of ${budget('groceries').limit.display}, projected ${budget('groceries').projected.display}. Transport ${budget('transport').spent.display} of ${budget('transport').limit.display}, projected ${budget('transport').projected.display}. Eating out ${budget('eating_out').spent.display} of ${budget('eating_out').limit.display}, projected ${budget('eating_out').projected.display}.`,
    },
    {
      type: 'insights',
      title: 'Worth knowing',
      items: [
        {
          insight_id: 'ci_w_07',
          headline: 'Two Safaricom payments a minute apart',
          body: 'Two bundle purchases of the same amount landed one minute apart on Thursday. If one was a mistake, Safaricom can reverse it.',
          drilldown: { kind: 'transactions', filter: { transaction_ids: ['tx_w_021', 'tx_w_022'] } },
        },
        {
          insight_id: 'ci_w_05',
          headline: `Fuliza cost you ${f.overdraft.fuliza_cost.display}`,
          body: `You drew ${f.overdraft.fuliza_drawdown.display} on Fuliza and repaid ${f.overdraft.fuliza_repaid.display}. Two days in overdraft cost ${f.overdraft.fuliza_cost.display}.`,
          drilldown: null,
        },
        {
          insight_id: 'ci_w_06',
          headline: `${f.people[0]!.sent.display} sent to Mum`,
          body: 'Money sent to family and friends doubled compared with last week. It is counted as spending, not a transfer.',
          drilldown: null,
        },
        {
          insight_id: 'ci_w_08',
          headline: 'A new place: Quickmart Kangemi',
          body: `First time Hesabu has seen Quickmart Kangemi. ${f.merchants[7]!.out.display} over two visits, filed under groceries.`,
          drilldown: null,
        },
        {
          insight_id: 'ci_w_09',
          headline: `${t.cash_withdrawn.display} withdrawn as cash`,
          body: 'Cash is shown as a transfer. Matatu and boda fares you add by hand show up under transport.',
          drilldown: null,
        },
        {
          insight_id: 'ci_w_10',
          headline: `You saved ${t.savings_rate.display} of what came in`,
          body: `${t.savings_out.display} went to M-Shwari from ${t.in.display} received. Savings are kept out of spending.`,
          drilldown: null,
        },
      ],
    },
    {
      type: 'chart',
      chart_id: 'balance_mpesa',
      chart_type: 'balance_sparkline',
      title: `M-Pesa ended the week at ${mpesa.balance!.display}`,
      takeaway: null,
      data_ref: '/accounts/0/balance_series',
      alt_text: `M-Pesa balance over the week, from ${f.daily[0]!.out.display} spent on Monday to a closing balance of ${mpesa.balance!.display} on Sunday.`,
    },
    {
      type: 'watch',
      title: 'Three things to watch next week',
      items: [
        `Safaricom Home Fibre is due on 15 October, usually ${f.recurring[1]!.typical_amount.display}.`,
        `Transport is projected to reach ${budget('transport').projected.display}, past its ${budget('transport').limit.display} budget.`,
        `Your M-Pesa balance is ${mpesa.balance!.display}. Fuliza kicks in again if it runs out before Friday.`,
      ],
    },
    {
      type: 'callout',
      tone: 'neutral',
      body: `${f.unknown_messages.display} messages could not be read. Open Hesabu to teach it what they were.`,
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
      `You spent *${t.out.display}*, ${d.out.display} (${d.out.pct.display}) on last week.`,
      `Money in ${t.in.display}. Fees ${t.fees.display}. Net ${t.net.display}.`,
      '',
      `Groceries took ${cat('groceries').share.display}. Friday was the spendiest day at ${spendiest.out.display}.`,
      `Fuliza cost ${f.overdraft.fuliza_cost.display}. ${t.savings_out.display} went to M-Shwari.`,
      '',
      '_Full report, drill-downs and the PDF are in the link below._',
    ].join('\n'),
    hero_chart_ids: ['categories'],
  },
  email: {
    subject: `Your week in money: ${t.out.display} spent, ${d.out.pct.display} up`,
    preheader: `Groceries ${cat('groceries').share.display}, Friday ${spendiest.out.display}, fees ${t.fees.display}. Three things to watch.`,
  },
  meta,
};

export const weeklyDocSw: ReportDocument = {
  version: '1',
  report_id: 'rpt_w_2026-10-05_sw',
  kind: 'weekly',
  locale: 'sw',
  period_label: f.period.label_sw,
  title: 'Wiki yako kwa pesa',
  sections: [
    {
      type: 'hero',
      total_out: t.out.display,
      delta: d.out.display,
      delta_direction: d.out.direction,
      verdict: `Ulitumia ${d.out.pct.display} zaidi ya wiki iliyopita, hasa kwa mboga na pesa ulizotuma nyumbani.`,
      tally: tally('sw'),
    },
    {
      type: 'kpis',
      items: [
        { label: 'Zilizoingia', value: t.in.display, delta: d.in.display, tone: 'in' },
        { label: 'Zilizotoka', value: t.out.display, delta: d.out.display, tone: 'out' },
        { label: 'Ada', value: t.fees.display, delta: d.fees.display, tone: 'fee' },
        { label: 'Salio la wiki', value: t.net.display, delta: null, tone: 'neutral' },
      ],
    },
    {
      type: 'chart',
      chart_id: 'in_out',
      chart_type: 'stacked_in_out',
      title: 'Zilizoingia zilipungua baada ya mshahara wa wiki iliyopita; matumizi yalibaki vilevile',
      takeaway: `Ziliingia ${t.in.display} na zikatoka ${t.out.display}, kwa hivyo wiki ilifunga kwa ${t.net.display}.`,
      data_ref: '/totals',
      alt_text: `Miraba miwili inalinganisha wiki hii na iliyopita. Wiki hii: ${t.in.display} ziliingia, ${t.out.display} zilitoka, salio ${t.net.display}. Wiki iliyopita: ${f.previous_totals.in.display} ziliingia, ${f.previous_totals.out.display} zilitoka, salio ${f.previous_totals.net.display}.`,
    },
    {
      type: 'chart',
      chart_id: 'categories',
      chart_type: 'donut',
      title: `Mboga na chakula zilichukua ${cat('groceries').share.display} ya wiki`,
      takeaway: `Familia na marafiki iliongezeka maradufu hadi ${cat('family').out.display} baada ya kutuma pesa nyumbani Ijumaa.`,
      data_ref: '/categories',
      alt_text: `Donati ya matumizi ya ${t.out.display} kwa kategoria. Mboga na chakula ${cat('groceries').out.display} (${cat('groceries').share.display}), familia na marafiki ${cat('family').out.display} (${cat('family').share.display}), usafiri ${cat('transport').out.display} (${cat('transport').share.display}), umeme na maji ${cat('utilities').out.display} (${cat('utilities').share.display}), kula nje ${cat('eating_out').out.display}, airtime na data ${cat('airtime').out.display}, mengineyo ${cat('other').out.display}.`,
    },
    {
      type: 'chart',
      chart_id: 'daily',
      chart_type: 'daily_bars',
      title: `Ijumaa ndiyo siku uliyotumia zaidi, ${spendiest.out.display}`,
      takeaway: `Wastani wa siku ulikuwa ${f.average_daily_out.display}. Alhamisi ilikuwa tulivu zaidi, ${f.daily[3]!.out.display}.`,
      data_ref: '/daily',
      alt_text: `Miraba saba, mmoja kwa kila siku, na mstari wa wastani wa ${f.average_daily_out.display}. Jumatatu ${f.daily[0]!.out.display}, Jumanne ${f.daily[1]!.out.display}, Jumatano ${f.daily[2]!.out.display}, Alhamisi ${f.daily[3]!.out.display}, Ijumaa ${f.daily[4]!.out.display}, Jumamosi ${f.daily[5]!.out.display}, Jumapili ${f.daily[6]!.out.display}.`,
    },
    {
      type: 'table',
      title: 'Pesa zilienda wapi',
      columns: ['Kategoria', 'Zilizotumika', 'Sehemu', 'Ikilinganishwa na wiki iliyopita'],
      rows: f.categories.map((c) => [c.name_sw, c.out.display, c.share.display, c.delta.display]),
      numeric_columns: [1, 2, 3],
      total_row: ['Jumla', t.out.display, '', d.out.display],
    },
    {
      type: 'chart',
      chart_id: 'merchants',
      chart_type: 'top_bars',
      title: `Naivas ndiyo duka kubwa zaidi, ${f.merchants[0]!.out.display}`,
      takeaway: 'Sehemu mbili mpya wiki hii: Quickmart Kangemi na Kibandaski Kangemi.',
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
      type: 'chart',
      chart_id: 'fees',
      chart_type: 'fee_meter',
      title: `Ada zilichukua ${t.fee_ratio.display} ya ulichotumia`,
      takeaway: null,
      data_ref: '/totals/fees',
      alt_text: `Mstari mfupi wenye mistari: ada za ${t.fees.display} ni ${t.fee_ratio.display} ya ${t.out.display} zilizotumika.`,
    },
    {
      type: 'callout',
      tone: 'fee',
      body: `${t.fees.display} zilienda kwa ada wiki hii, ${f.overdraft.fuliza_cost.display} kati yake ni gharama ya Fuliza kwa siku ${f.overdraft.days_in_overdraft.display} ukiwa na deni.`,
    },
    {
      type: 'table',
      title: 'Zilizohamishwa, si matumizi',
      columns: ['Hatua', 'Kiasi'],
      rows: [
        ['Kwenda M-Shwari', t.savings_out.display],
        ['Pesa taslimu ulizotoa', t.cash_withdrawn.display],
        ['Fuliza ulizolipa', t.loan_repayments.display],
      ],
      numeric_columns: [1],
      total_row: ['Jumla zilizohamishwa', t.transfers.display],
    },
    {
      type: 'chart',
      chart_id: 'budgets',
      chart_type: 'budget_bullets',
      title: 'Usafiri unaelekea kupita bajeti yake',
      takeaway: `Kwa mwendo huu usafiri utafikia ${budget('transport').projected.display} mwishoni mwa Oktoba, dhidi ya kikomo cha ${budget('transport').limit.display}.`,
      data_ref: '/budgets',
      alt_text: `Miraba mitatu ya bajeti kwa Oktoba hadi sasa. Mboga na chakula ${budget('groceries').spent.display} kati ya ${budget('groceries').limit.display}, makadirio ${budget('groceries').projected.display}. Usafiri ${budget('transport').spent.display} kati ya ${budget('transport').limit.display}, makadirio ${budget('transport').projected.display}. Kula nje ${budget('eating_out').spent.display} kati ya ${budget('eating_out').limit.display}, makadirio ${budget('eating_out').projected.display}.`,
    },
    {
      type: 'insights',
      title: 'Yafaa kujua',
      items: [
        {
          insight_id: 'ci_w_07',
          headline: 'Malipo mawili ya Safaricom ndani ya dakika moja',
          body: 'Ununuzi mbili za bando za kiasi kile kile ziliingia dakika moja baada ya nyingine Alhamisi. Kama moja ilikuwa kosa, Safaricom wanaweza kuirudisha.',
          drilldown: { kind: 'transactions', filter: { transaction_ids: ['tx_w_021', 'tx_w_022'] } },
        },
        {
          insight_id: 'ci_w_05',
          headline: `Fuliza ilikugharimu ${f.overdraft.fuliza_cost.display}`,
          body: `Ulichukua ${f.overdraft.fuliza_drawdown.display} kwa Fuliza na ukalipa ${f.overdraft.fuliza_repaid.display}. Siku mbili za deni ziligharimu ${f.overdraft.fuliza_cost.display}.`,
          drilldown: null,
        },
        {
          insight_id: 'ci_w_06',
          headline: `${f.people[0]!.sent.display} zilitumwa kwa Mama`,
          body: 'Pesa ulizotuma kwa familia na marafiki ziliongezeka maradufu ikilinganishwa na wiki iliyopita. Zinahesabiwa kama matumizi, si uhamisho.',
          drilldown: null,
        },
        {
          insight_id: 'ci_w_08',
          headline: 'Sehemu mpya: Quickmart Kangemi',
          body: `Mara ya kwanza Hesabu kuona Quickmart Kangemi. ${f.merchants[7]!.out.display} kwa ziara mbili, chini ya mboga na chakula.`,
          drilldown: null,
        },
        {
          insight_id: 'ci_w_09',
          headline: `${t.cash_withdrawn.display} zilitolewa taslimu`,
          body: 'Pesa taslimu zinaonyeshwa kama uhamisho. Nauli za matatu na boda unazoongeza mwenyewe zinaonekana chini ya usafiri.',
          drilldown: null,
        },
        {
          insight_id: 'ci_w_10',
          headline: `Uliweka akiba ${t.savings_rate.display} ya zilizoingia`,
          body: `${t.savings_out.display} zilienda M-Shwari kati ya ${t.in.display} ulizopokea. Akiba haihesabiwi kama matumizi.`,
          drilldown: null,
        },
      ],
    },
    {
      type: 'chart',
      chart_id: 'balance_mpesa',
      chart_type: 'balance_sparkline',
      title: `M-Pesa ilifunga wiki na ${mpesa.balance!.display}`,
      takeaway: null,
      data_ref: '/accounts/0/balance_series',
      alt_text: `Salio la M-Pesa wiki nzima, kutoka ${f.daily[0]!.out.display} zilizotumika Jumatatu hadi salio la mwisho la ${mpesa.balance!.display} Jumapili.`,
    },
    {
      type: 'watch',
      title: 'Mambo matatu ya kuangalia wiki ijayo',
      items: [
        `Safaricom Home Fibre inatarajiwa tarehe 15 Oktoba, kwa kawaida ${f.recurring[1]!.typical_amount.display}.`,
        `Usafiri unakadiriwa kufikia ${budget('transport').projected.display}, zaidi ya bajeti yake ya ${budget('transport').limit.display}.`,
        `Salio lako la M-Pesa ni ${mpesa.balance!.display}. Fuliza itaanza tena likiisha kabla ya Ijumaa.`,
      ],
    },
    {
      type: 'callout',
      tone: 'neutral',
      body: `Jumbe ${f.unknown_messages.display} hazikusomeka. Fungua Hesabu uifundishe zilikuwa nini.`,
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
      `Ulitumia *${t.out.display}*, ${d.out.display} (${d.out.pct.display}) ikilinganishwa na wiki iliyopita.`,
      `Ziliingia ${t.in.display}. Ada ${t.fees.display}. Salio ${t.net.display}.`,
      '',
      `Mboga na chakula zilichukua ${cat('groceries').share.display}. Ijumaa ulitumia zaidi, ${spendiest.out.display}.`,
      `Fuliza iligharimu ${f.overdraft.fuliza_cost.display}. ${t.savings_out.display} zilienda M-Shwari.`,
      '',
      '_Ripoti kamili, maelezo ya kila nambari na PDF ziko kwenye kiungo hapa chini._',
    ].join('\n'),
    hero_chart_ids: ['categories'],
  },
  email: {
    subject: `Wiki yako kwa pesa: ${t.out.display} zilitumika, ${d.out.pct.display} zaidi`,
    preheader: `Mboga ${cat('groceries').share.display}, Ijumaa ${spendiest.out.display}, ada ${t.fees.display}. Mambo matatu ya kuangalia.`,
  },
  meta,
};
