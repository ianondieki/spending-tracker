/**
 * English and Kiswahili message catalogues, insight templates and the one substitution routine reports use.
 *
 * Templates use `{name}` placeholders. Substitution fails closed: a placeholder without a value throws, and an
 * insight template that names a param the analytics engine never emits throws, so a typo cannot ship a report
 * with a hole in it. A missing Kiswahili entry falls back to English so a report is never blank.
 */
import type { InsightKind } from '@hesabu/analytics';

import enInsights from './insights/en.json' with { type: 'json' };
import swInsights from './insights/sw.json' with { type: 'json' };
import { INSIGHT_PARAMS } from './insight-params.js';
import en from './locales/en.json' with { type: 'json' };
import sw from './locales/sw.json' with { type: 'json' };

export { INSIGHT_PARAMS, VARIANT_PARAM_VALUES, type InsightParamName } from './insight-params.js';

export const LOCALES = ['en', 'sw'] as const;
export type Locale = (typeof LOCALES)[number];
export type MessageKey = keyof typeof en;

/** Values substituted into templates. Display strings and names only; `null`/`undefined` count as missing. */
export type TemplateParams = Readonly<Record<string, string | number | boolean | null | undefined>>;

export interface InsightCopy {
  readonly headline: string;
  readonly body: string;
}

/** A catalogue entry: base copy plus optional variants chosen by the value of `variant_param`. */
export interface InsightTemplate extends InsightCopy {
  readonly variant_param?: string;
  readonly variants?: Readonly<Record<string, InsightCopy>>;
}

type Catalog = Readonly<Partial<Record<string, string>>>;
type InsightCatalog = Readonly<Partial<Record<string, InsightTemplate>>>;

const messages: Readonly<Record<Locale, Catalog>> = { en, sw };
const insightCatalogs: Readonly<Record<Locale, InsightCatalog>> = {
  en: enInsights,
  sw: swInsights,
};

/** Thrown when a template cannot be filled safely. */
export class TemplateError extends Error {
  override readonly name = 'TemplateError';
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Resolves `key` in `primary`, else in `fallback`; throws when neither has it. Exported for tests. */
export function lookupMessage(primary: Catalog, fallback: Catalog, key: string): string {
  const value = primary[key] ?? fallback[key];
  if (value === undefined) throw new TemplateError(`unknown message key: ${key}`);
  return value;
}

/** Looks a message up by key; falls back to English so a missing translation never blanks a report. */
export function t(locale: Locale, key: MessageKey): string {
  return lookupMessage(messages[locale], messages.en, key);
}

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** Placeholder names in a template, in order of appearance (duplicates kept). */
export function placeholdersOf(template: string): string[] {
  return Array.from(template.matchAll(PLACEHOLDER), (m) => m[1] ?? '');
}

/**
 * Replaces `{name}` with `params[name]`. Throws when a placeholder has no value, or when `allowed` is given and
 * the placeholder is not in it. Single pass, so a value that itself contains `{x}` is never expanded.
 */
export function substitute(
  template: string,
  params: TemplateParams,
  allowed?: readonly string[],
): string {
  return template.replace(PLACEHOLDER, (_match, name: string) => {
    if (allowed !== undefined && !allowed.includes(name)) {
      throw new TemplateError(`placeholder {${name}} is not allowed in this template`);
    }
    const value = Object.hasOwn(params, name) ? params[name] : undefined;
    if (value === undefined || value === null) {
      throw new TemplateError(`no value for placeholder {${name}}`);
    }
    return String(value);
  });
}

/** `t()` plus substitution. */
export function renderTemplate(
  locale: Locale,
  key: MessageKey,
  params: TemplateParams = {},
): string {
  return substitute(t(locale, key), params);
}

export function isInsightKind(value: unknown): value is InsightKind {
  return typeof value === 'string' && Object.hasOwn(INSIGHT_PARAMS, value);
}

/** The catalogue entry for `kind` in `locale`, falling back to English. Throws for an unknown kind. */
export function insightTemplate(locale: Locale, kind: InsightKind): InsightTemplate {
  if (!isInsightKind(kind)) throw new TemplateError(`unknown insight kind: ${String(kind)}`);
  const template = insightCatalogs[locale][kind] ?? insightCatalogs.en[kind];
  if (template === undefined) throw new TemplateError(`no template for insight kind: ${kind}`);
  return template;
}

/** Picks the variant named by the template's `variant_param`, or the base copy. */
export function selectInsightCopy(template: InsightTemplate, params: TemplateParams): InsightCopy {
  if (template.variant_param === undefined || template.variants === undefined) return template;
  const value = params[template.variant_param];
  if (typeof value === 'string' && Object.hasOwn(template.variants, value)) {
    return template.variants[value] ?? template;
  }
  return template;
}

/**
 * Renders a candidate insight from the engine's params. Only the params the engine emits for `kind` may appear
 * as placeholders, and each one used must have a value; anything else throws.
 */
export function renderInsight(
  locale: Locale,
  kind: InsightKind,
  params: TemplateParams,
): InsightCopy {
  const template = insightTemplate(locale, kind);
  const allowed: readonly string[] = INSIGHT_PARAMS[kind];
  const copy = selectInsightCopy(template, params);
  return {
    headline: substitute(copy.headline, params, allowed),
    body: substitute(copy.body, params, allowed),
  };
}

/** Every catalogue, for tests and tooling (read-only). */
export const CATALOGS = { messages, insights: insightCatalogs } as const;
