/** Chart chrome strings in both locales. Copy is ordinary product copy [[COPY-REVIEW]]. */
import type { Locale } from '@hesabu/report-model';

export interface ChartLabels {
  readonly showTable: string;
  readonly hideTable: string;
  readonly total: string;
  readonly average: string;
  readonly new: string;
  readonly other: string;
  readonly in: string;
  readonly out: string;
  readonly net: string;
  readonly fees: string;
  readonly thisPeriod: string;
  readonly lastPeriod: string;
  readonly income: string;
  readonly spent: string;
  readonly limit: string;
  readonly projected: string;
  readonly over: string;
  readonly balance: string;
  readonly ofSpending: string;
  readonly day: string;
  readonly amount: string;
  readonly category: string;
  readonly share: string;
  readonly merchant: string;
  readonly month: string;
  readonly date: string;
  readonly weekdays: readonly string[]; // Monday first, two letters
  readonly chartData: string;
}

const EN: ChartLabels = {
  showTable: 'Show the numbers',
  hideTable: 'Hide the numbers',
  total: 'Total',
  average: 'Average',
  new: 'New',
  other: 'Other',
  in: 'In',
  out: 'Out',
  net: 'Net',
  fees: 'Fees',
  thisPeriod: 'This period',
  lastPeriod: 'Last period',
  income: 'Income',
  spent: 'Spent',
  limit: 'Limit',
  projected: 'Projected',
  over: 'Over',
  balance: 'Balance',
  ofSpending: 'of spending',
  day: 'Day',
  amount: 'Amount',
  category: 'Category',
  share: 'Share',
  merchant: 'Merchant',
  month: 'Month',
  date: 'Date',
  weekdays: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
  chartData: 'Chart data',
};

const SW: ChartLabels = {
  showTable: 'Onyesha nambari',
  hideTable: 'Ficha nambari',
  total: 'Jumla',
  average: 'Wastani',
  new: 'Mpya',
  other: 'Mengineyo',
  in: 'Zilizoingia',
  out: 'Zilizotoka',
  net: 'Salio',
  fees: 'Ada',
  thisPeriod: 'Kipindi hiki',
  lastPeriod: 'Kipindi kilichopita',
  income: 'Mapato',
  spent: 'Zilizotumika',
  limit: 'Kikomo',
  projected: 'Makadirio',
  over: 'Imepita',
  balance: 'Salio',
  ofSpending: 'ya matumizi',
  day: 'Siku',
  amount: 'Kiasi',
  category: 'Kategoria',
  share: 'Sehemu',
  merchant: 'Duka',
  month: 'Mwezi',
  date: 'Tarehe',
  weekdays: ['Jmt', 'Jmn', 'Jtn', 'Alh', 'Iju', 'Jms', 'Jpl'],
  chartData: 'Data ya chati',
};

export function chartLabels(locale: Locale): ChartLabels {
  return locale === 'sw' ? SW : EN;
}
