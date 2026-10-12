/**
 * @hesabu/pack-engine — the TypeScript reference implementation of `contracts/PROVIDER-PACKS.md`.
 *
 * Load a pack (schema + portable-regex validation), parse messages, post-process (dedupe, transfer pairs, balance
 * chain). The Kotlin engine in `android/` implements the same semantics; both run the same corpus in CI.
 */
export const PACK_FORMAT_VERSION = 1 as const;

export type * from './types.js';
export { PortableRegexError, validatePortableRegex, compilePortableRegex, GROUP_NAME } from './regex.js';
export {
  normaliseAmount,
  normaliseDatetime,
  normaliseText,
  normalisePhone,
  normaliseCode,
  normaliseDigits,
  maskAccountRef,
  maskMiddle,
  compileDatetimeFormat,
} from './normalise.js';
export { sha256Hex, deterministicUuid } from './hash.js';
export {
  compilePack,
  loadPackFile,
  loadAllPacks,
  PackLoadError,
  CONTRACTS_DIR,
  PACKS_DIR,
  SCHEMA_PATH,
  type CompiledPack,
  type CompiledFamily,
} from './loader.js';
export { parseMessage, parseWithPacks, senderMatches, renderAccountRef, matchableBody, type EngineOptions } from './engine.js';
export {
  dedupe,
  dedupeKey,
  matchTransfers,
  checkBalanceChain,
  postProcess,
  type DedupeResult,
  type TransferPair,
  type BalanceBreak,
  type BalanceChainResult,
  type PostProcessResult,
} from './postprocess.js';
export {
  readJsonl,
  runCorpus,
  packForSender,
  isAllowedUnknown,
  CORPUS_DIR,
  type CorpusLine,
  type CorpusRunResult,
  type UnknownMessage,
} from './corpus.js';
export { runExamples, type ExampleFailure, flattenForExpect } from './examples.js';
