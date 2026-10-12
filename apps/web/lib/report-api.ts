/**
 * Resolves a signed report link against the API (`GET /v1/public/reports/{token}`), validates both documents
 * against the frozen contracts and fails closed on anything unexpected. The token is never logged or echoed.
 */
import { assertFactsSheet, assertReportDocument, type FactsSheet, type ReportDocument } from '@hesabu/report-model';

export interface PublicReport {
  readonly document: ReportDocument;
  readonly facts: FactsSheet;
  readonly artefacts: { readonly hero_png_url: string | null; readonly pdf_url: string | null };
}

export type LoadResult = { readonly kind: 'ok'; readonly report: PublicReport } | { readonly kind: 'not_found' } | { readonly kind: 'unavailable'; readonly reason: string };

const TOKEN = /^[A-Za-z0-9_.-]{16,512}$/;

export function apiBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.API_BASE_URL ?? env.HESABU_API_BASE_URL ?? null;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return raw.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export async function loadPublicReport(token: string, fetchImpl: typeof fetch = fetch, env: NodeJS.ProcessEnv = process.env): Promise<LoadResult> {
  if (!TOKEN.test(token)) return { kind: 'not_found' };
  const base = apiBaseUrl(env);
  if (!base) return { kind: 'unavailable', reason: 'API_BASE_URL is not set' };
  let res: Response;
  try {
    res = await fetchImpl(`${base}/v1/public/reports/${encodeURIComponent(token)}`, { cache: 'no-store', headers: { accept: 'application/json' } });
  } catch {
    return { kind: 'unavailable', reason: 'The report service did not answer' };
  }
  if (res.status === 404 || res.status === 410) return { kind: 'not_found' };
  if (!res.ok) return { kind: 'unavailable', reason: `The report service answered ${res.status}` };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { kind: 'unavailable', reason: 'The report service sent something that was not JSON' };
  }
  if (!body || typeof body !== 'object') return { kind: 'unavailable', reason: 'The report service sent an empty answer' };
  const b = body as { document?: unknown; facts?: unknown; artefacts?: { hero_png_url?: unknown; pdf_url?: unknown } };
  try {
    const document = assertReportDocument(b.document);
    const facts = assertFactsSheet(b.facts);
    return {
      kind: 'ok',
      report: {
        document,
        facts,
        artefacts: {
          hero_png_url: typeof b.artefacts?.hero_png_url === 'string' ? b.artefacts.hero_png_url : null,
          pdf_url: typeof b.artefacts?.pdf_url === 'string' ? b.artefacts.pdf_url : null,
        },
      },
    };
  } catch (e) {
    return { kind: 'unavailable', reason: e instanceof Error ? e.message : 'The report did not validate' };
  }
}

/** Fixture routes are on outside production, or when HESABU_DEV_ROUTES=1 is set explicitly (screenshots, CI). */
export function devRoutesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.HESABU_DEV_ROUTES === '1') return true;
  if (env.HESABU_DEV_ROUTES === '0') return false;
  return env.NODE_ENV !== 'production';
}
