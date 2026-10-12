/**
 * ajv validators compiled once from the frozen contract schemas. Both documents are untrusted input at every
 * boundary (API response, queue payload, fixture file), so callers validate before rendering. Fail closed: an
 * invalid document is an error, never a best-effort render.
 */
import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import factsSheetSchema from './generated/facts-sheet.schema.json' with { type: 'json' };
import reportDocumentSchema from './generated/report-document.schema.json' with { type: 'json' };
import type { FactsSheet, ReportDocument } from './types.js';

export { factsSheetSchema, reportDocumentSchema };

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
// ajv-formats is CJS: the default import is callable at runtime but typed as the module namespace under NodeNext.
const formatsModule = addFormats as unknown as { default?: unknown };
const applyFormats = (typeof formatsModule === 'function' ? formatsModule : formatsModule.default) as (a: Ajv2020) => void;
applyFormats(ajv);

const factsFn = ajv.compile(factsSheetSchema) as ValidateFunction<FactsSheet>;
const docFn = ajv.compile(reportDocumentSchema) as ValidateFunction<ReportDocument>;

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] };

function run<T>(fn: ValidateFunction<T>, input: unknown): ValidationResult<T> {
  if (fn(input)) return { ok: true, value: input };
  return { ok: false, errors: describe(fn.errors ?? []) };
}

export function describe(errors: readonly ErrorObject[]): string[] {
  return errors.map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`);
}

export function validateFactsSheet(input: unknown): ValidationResult<FactsSheet> {
  return run(factsFn, input);
}

export function validateReportDocument(input: unknown): ValidationResult<ReportDocument> {
  return run(docFn, input);
}

export class ReportModelError extends Error {
  readonly document: 'FactsSheet' | 'ReportDocument';
  readonly problems: readonly string[];
  constructor(document: 'FactsSheet' | 'ReportDocument', problems: readonly string[]) {
    super(`${document} failed validation: ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? '; …' : ''}`);
    this.name = 'ReportModelError';
    this.document = document;
    this.problems = problems;
  }
}

export function assertFactsSheet(input: unknown): FactsSheet {
  const r = validateFactsSheet(input);
  if (!r.ok) throw new ReportModelError('FactsSheet', r.errors);
  return r.value;
}

export function assertReportDocument(input: unknown): ReportDocument {
  const r = validateReportDocument(input);
  if (!r.ok) throw new ReportModelError('ReportDocument', r.errors);
  return r.value;
}
