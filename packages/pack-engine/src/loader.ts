/**
 * Pack loading: JSON-schema validation against the frozen contract, then the engine's own checks (portable regex
 * subset, every mapped field names a declared group, datetime formats compile, examples are well-formed). A pack
 * that fails any check never produces a transaction: fail closed.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ajv2020 } from 'ajv/dist/2020.js';

import { compileDatetimeFormat } from './normalise.js';
import { compilePortableRegex, validatePortableRegex } from './regex.js';
import type { Family, ProviderPack } from './types.js';

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/** `contracts/` lives two levels above `packages/pack-engine`. */
export const CONTRACTS_DIR = path.resolve(packageRoot, '..', '..', 'contracts');
export const PACKS_DIR = path.join(CONTRACTS_DIR, 'provider-packs');
export const SCHEMA_PATH = path.join(CONTRACTS_DIR, 'provider-pack.schema.json');

export class PackLoadError extends Error {
  constructor(
    readonly packId: string | null,
    readonly problems: readonly string[],
  ) {
    super(`pack ${packId ?? '(unknown)'} rejected:\n  - ${problems.join('\n  - ')}`);
    this.name = 'PackLoadError';
  }
}

export interface CompiledFamily {
  readonly family: Family;
  readonly regex: RegExp;
  readonly groupNames: readonly string[];
  readonly allOf: readonly string[];
  readonly noneOf: readonly string[];
}

export interface CompiledPack {
  readonly pack: ProviderPack;
  readonly senderIds: ReadonlySet<string>;
  readonly families: readonly CompiledFamily[];
}

let validator: ((data: unknown) => boolean) & { errors?: { instancePath: string; message?: string }[] | null };

function schemaValidator() {
  if (!validator) {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as object;
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    validator = ajv.compile(schema) as typeof validator;
  }
  return validator;
}

/** Validates and compiles a pack object. Throws PackLoadError listing every problem found. */
export function compilePack(data: unknown): CompiledPack {
  const validate = schemaValidator();
  const problems: string[] = [];
  if (!validate(data)) {
    for (const err of validate.errors ?? []) problems.push(`schema: ${err.instancePath || '/'} ${err.message ?? ''}`);
    throw new PackLoadError(packIdOf(data), problems);
  }
  const pack = data as ProviderPack;

  for (const format of pack.datetime_formats) {
    try {
      compileDatetimeFormat(format);
    } catch (e) {
      problems.push(`datetime_formats: ${(e as Error).message}`);
    }
  }
  const seenFamilies = new Set<string>();
  const compiled: CompiledFamily[] = [];
  for (const family of pack.families) {
    const where = `family ${family.family_id}`;
    if (seenFamilies.has(family.family_id)) problems.push(`${where}: duplicate family_id`);
    seenFamilies.add(family.family_id);
    let groupNames: string[];
    try {
      groupNames = validatePortableRegex(family.pattern);
    } catch (e) {
      problems.push(`${where}: ${(e as Error).message}`);
      continue;
    }
    for (const group of Object.keys(family.fields)) {
      if (!groupNames.includes(group)) problems.push(`${where}: fields maps group "${group}" that the pattern does not declare`);
    }
    const targets = Object.values(family.fields).map((f) => f.to);
    const dupTargets = targets.filter((t, i) => targets.indexOf(t) !== i);
    if (dupTargets.length) problems.push(`${where}: two groups map to the same field ${[...new Set(dupTargets)].join(', ')}`);
    if (!family.ignore && !targets.includes('amount')) problems.push(`${where}: a non-ignore family must map an amount`);
    try {
      const prefilter = family.prefilter ?? {};
      compiled.push({
        family,
        regex: compilePortableRegex(family.pattern),
        groupNames,
        allOf: (prefilter.all_of ?? []).map((s) => s.toLowerCase()),
        noneOf: (prefilter.none_of ?? []).map((s) => s.toLowerCase()),
      });
    } catch (e) {
      problems.push(`${where}: ${(e as Error).message}`);
    }
  }
  if (problems.length) throw new PackLoadError(pack.pack_id, problems);
  return {
    pack,
    senderIds: new Set(pack.sender_ids.map((s) => s.trim().toLowerCase())),
    families: compiled,
  };
}

export function loadPackFile(file: string): CompiledPack {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new PackLoadError(null, [`${file}: ${(e as Error).message}`]);
  }
  return compilePack(data);
}

/** Loads every `*.json` pack in `contracts/provider-packs/` (sorted by file name). */
export function loadAllPacks(dir: string = PACKS_DIR): CompiledPack[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => loadPackFile(path.join(dir, f)));
}

function packIdOf(data: unknown): string | null {
  if (data && typeof data === 'object' && typeof (data as { pack_id?: unknown }).pack_id === 'string') {
    return (data as { pack_id: string }).pack_id;
  }
  return null;
}
