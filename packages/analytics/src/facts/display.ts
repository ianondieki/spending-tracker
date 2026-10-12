/**
 * The fact-checker's allow-list: every display string in the sheet, collected by walking the finished sheet
 * (so nothing can be missed), de-duplicated in first-seen order.
 */
const LABEL_KEYS: ReadonlySet<string> = new Set(['label_en', 'label_sw', 'weekday_en', 'weekday_sw']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function collectDisplayStrings(sheet: unknown): string[] {
  const seen = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!isRecord(node)) return;
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string') {
        if (key === 'display' || LABEL_KEYS.has(key)) seen.add(value);
      } else if (key === 'params' && isRecord(value)) {
        for (const p of Object.values(value)) if (typeof p === 'string') seen.add(p);
      } else {
        visit(value);
      }
    }
  };
  visit(sheet);
  return [...seen];
}
