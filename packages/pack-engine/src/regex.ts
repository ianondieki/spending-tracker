/**
 * The portable regex subset of PROVIDER-PACKS.md. Both `java.util.regex` and JavaScript `RegExp` (no `u` flag) must
 * behave identically, so a pattern may use only: named groups `(?<name>…)`, non-capturing groups `(?:…)`,
 * alternation, character classes with `\d \s \w \D \S \W`, the quantifiers `? * + {m,n}` (greedy and lazy),
 * the anchors `^ $`, the dot and escapes of punctuation. Anything else is rejected at load time, before the pattern
 * is ever compiled, so a pack that would behave differently on Android never loads here either.
 */

export const GROUP_NAME = /^[a-z][a-z0-9_]*$/;

/** Letter escapes whose meaning is the same in Java and JavaScript. */
const ALLOWED_LETTER_ESCAPES = new Set(['d', 'D', 's', 'S', 'w', 'W', 't', 'n', 'r']);

export class PortableRegexError extends Error {
  constructor(
    readonly pattern: string,
    readonly offset: number,
    reason: string,
  ) {
    super(`non-portable regex at offset ${offset}: ${reason} in /${pattern}/`);
    this.name = 'PortableRegexError';
  }
}

/**
 * Validates a pattern against the subset and returns the named groups it declares, in order.
 * Throws PortableRegexError on the first violation.
 */
export function validatePortableRegex(pattern: string): string[] {
  const names: string[] = [];
  let i = 0;
  let depth = 0;
  let inClass = false;
  const fail = (reason: string, at = i): never => {
    throw new PortableRegexError(pattern, at, reason);
  };

  while (i < pattern.length) {
    const c = pattern[i]!;
    if (c === '\\') {
      const next = pattern[i + 1];
      if (next === undefined) fail('trailing backslash');
      if (/[A-Za-z0-9]/.test(next!)) {
        if (!ALLOWED_LETTER_ESCAPES.has(next!)) {
          fail(
            `escape \\${next} is not portable (allowed: \\d \\D \\s \\S \\w \\W \\t \\n \\r and escaped punctuation)`,
          );
        }
      }
      i += 2;
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      else if (c === '[') fail('nested character class / POSIX class is not portable');
      else if (c === '&' && pattern[i + 1] === '&') fail('class intersection && is Java-only');
      i += 1;
      continue;
    }
    switch (c) {
      case '[':
        inClass = true;
        i += 1;
        if (pattern[i] === '^') i += 1;
        // A leading ']' is a literal in Java but closes the class in JS: reject it.
        if (pattern[i] === ']') fail('a leading ] inside a class is not portable');
        continue;
      case '(': {
        depth += 1;
        if (pattern[i + 1] !== '?') fail('unnamed capturing group; use (?<name>…) or (?:…)');
        const tail = pattern.slice(i + 2);
        if (tail.startsWith(':')) {
          i += 3;
          continue;
        }
        if (tail.startsWith('<=') || tail.startsWith('<!')) fail('lookbehind is not portable');
        if (tail.startsWith('=') || tail.startsWith('!'))
          fail('lookahead is outside the portable subset');
        if (tail.startsWith('<')) {
          const close = tail.indexOf('>');
          if (close < 0) fail('unterminated group name');
          const name = tail.slice(1, close);
          if (!GROUP_NAME.test(name)) fail(`group name "${name}" must match [a-z][a-z0-9_]*`);
          if (names.includes(name)) fail(`duplicate group name "${name}"`);
          names.push(name);
          i += 2 + close + 1;
          continue;
        }
        fail('inline flags and other (?…) constructs are not portable');
        break;
      }
      case ')':
        if (depth === 0) fail('unbalanced )');
        depth -= 1;
        i += 1;
        continue;
      case '*':
      case '+':
      case '?': {
        const next = pattern[i + 1];
        if (next === '+') fail('possessive quantifier is Java-only');
        i += next === '?' ? 2 : 1;
        continue;
      }
      case '{': {
        const m = /^\{(\d+)(,(\d*))?\}/.exec(pattern.slice(i));
        if (!m) return fail('a literal { must be escaped as \\{');
        i += m[0].length;
        if (pattern[i] === '+') fail('possessive quantifier is Java-only');
        if (pattern[i] === '?') i += 1;
        continue;
      }
      case '}':
        fail('a literal } must be escaped as \\}');
        break;
      default:
        i += 1;
    }
  }
  if (inClass) fail('unterminated character class', pattern.length);
  if (depth !== 0) fail('unbalanced (', pattern.length);
  return names;
}

/** Compiles a validated pattern the way both engines must: case-insensitive, no `u`, no multiline. */
export function compilePortableRegex(pattern: string): RegExp {
  validatePortableRegex(pattern);
  return new RegExp(pattern, 'i');
}
