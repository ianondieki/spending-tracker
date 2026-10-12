import { describe, expect, it } from 'vitest';

import { fixtures } from '@hesabu/report-model';

import { apiBaseUrl, devRoutesEnabled, loadPublicReport } from '../lib/report-api';

const token = 'tok_1234567890abcdefghij';
const good = { document: fixtures['weekly-en'].document, facts: fixtures['weekly-en'].facts, artefacts: { hero_png_url: null, pdf_url: 'https://cdn.test/r.pdf' } };

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch;
}

describe('loadPublicReport', () => {
  const env = { API_BASE_URL: 'https://api.test' } as unknown as NodeJS.ProcessEnv;

  it('fails closed without an API base URL', async () => {
    const r = await loadPublicReport(token, fakeFetch(200, good), {} as unknown as NodeJS.ProcessEnv);
    expect(r.kind).toBe('unavailable');
  });
  it('treats malformed tokens as not found without calling the API', async () => {
    let called = false;
    const f = (async () => {
      called = true;
      return new Response('{}');
    }) as typeof fetch;
    expect((await loadPublicReport('../x', f, env)).kind).toBe('not_found');
    expect(called).toBe(false);
  });
  it('maps 404 and 410 to not found', async () => {
    expect((await loadPublicReport(token, fakeFetch(404, ''), env)).kind).toBe('not_found');
    expect((await loadPublicReport(token, fakeFetch(410, ''), env)).kind).toBe('not_found');
  });
  it('returns the validated report and artefacts', async () => {
    const r = await loadPublicReport(token, fakeFetch(200, good), env);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.report.document.report_id).toBe('rpt_w_2026-10-05_en');
      expect(r.report.artefacts).toEqual({ hero_png_url: null, pdf_url: 'https://cdn.test/r.pdf' });
    }
  });
  it('rejects a document that does not validate', async () => {
    const r = await loadPublicReport(token, fakeFetch(200, { ...good, document: { ...good.document, sections: [] } }), env);
    expect(r.kind).toBe('unavailable');
  });
  it('rejects non-JSON and server errors', async () => {
    expect((await loadPublicReport(token, fakeFetch(200, 'not json'), env)).kind).toBe('unavailable');
    expect((await loadPublicReport(token, fakeFetch(500, {}), env)).kind).toBe('unavailable');
  });
});

describe('config', () => {
  it('normalises the base URL and rejects bad schemes', () => {
    expect(apiBaseUrl({ API_BASE_URL: 'https://api.test/' } as unknown as NodeJS.ProcessEnv)).toBe('https://api.test');
    expect(apiBaseUrl({ API_BASE_URL: 'ftp://x' } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(apiBaseUrl({} as unknown as NodeJS.ProcessEnv)).toBeNull();
  });
  it('enables dev routes outside production or when forced', () => {
    expect(devRoutesEnabled({ NODE_ENV: 'production' } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(devRoutesEnabled({ NODE_ENV: 'production', HESABU_DEV_ROUTES: '1' } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(devRoutesEnabled({ NODE_ENV: 'test' } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(devRoutesEnabled({ NODE_ENV: 'test', HESABU_DEV_ROUTES: '0' } as unknown as NodeJS.ProcessEnv)).toBe(false);
  });
});
