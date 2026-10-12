/** The facts engine: `computeFacts(input)` turns a transaction window into the FactsSheet. See README.md. */
export { computeFacts, FACTS_VERSION } from './facts/compute.js';
export type { BudgetInput, CategoryInfo, CategoryKind, FactsInput } from './facts/types.js';
export {
  CASH_TYPES, IGNORED_TYPES, LOAN_DRAWDOWN_TYPES, LOAN_REPAYMENT_TYPES, SAVINGS_TYPES, TRANSFER_TYPES,
  classify, cleanName, isIgnored, isTransfer, nameKey, type TxClass,
} from './facts/classify.js';
export { collectDisplayStrings } from './facts/display.js';
export { UNCATEGORISED } from './facts/prepare.js';
