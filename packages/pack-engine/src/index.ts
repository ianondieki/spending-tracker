/** Bumped only with a contract change in `contracts/provider-packs/`. */
export const PACK_FORMAT_VERSION = 1 as const;

export interface ProviderPackHeader {
  readonly id: string;
  readonly provider: string;
  readonly formatVersion: number;
}

/** A pack is loadable only when its format version matches exactly; anything else is rejected (fail closed). */
export function canLoadPack(header: ProviderPackHeader): boolean {
  return header.formatVersion === PACK_FORMAT_VERSION && header.id.length > 0;
}
