import { describe, expect, it } from 'vitest';

import { PortableRegexError, validatePortableRegex } from './regex.js';

describe('portable regex subset', () => {
  it('accepts the constructs PROVIDER-PACKS.md allows and returns group names in order', () => {
    expect(
      validatePortableRegex(
        String.raw`^(?<code>[A-Z0-9]{10}) Confirmed\.\s*(?:Ksh)?(?<amount>[\d,]+\.\d{2})(?: sent| paid)? to (?<name>.+?)$`,
      ),
    ).toEqual(['code', 'amount', 'name']);
    expect(validatePortableRegex(String.raw`a{2,}?b*?c+?[^.]\(\)\{\}\/\-`)).toEqual([]);
  });

  it.each([
    [String.raw`(?<=x)y`, 'lookbehind'],
    [String.raw`(?<!x)y`, 'lookbehind'],
    [String.raw`(?=x)`, 'lookahead'],
    [String.raw`(?!x)`, 'lookahead'],
    [String.raw`(a)\1`, 'unnamed capturing group'],
    [String.raw`(?<a>x)\k<a>`, 'escape \\k'],
    [String.raw`\p{L}`, 'escape \\p'],
    [String.raw`a*+`, 'possessive'],
    [String.raw`a{1,2}+`, 'possessive'],
    [String.raw`(?i)abc`, 'inline flags'],
    [String.raw`(?i:abc)`, 'inline flags'],
    [String.raw`\bword\b`, 'escape \\b'],
    [String.raw`\Astart`, 'escape \\A'],
    [String.raw`end\z`, 'escape \\z'],
    ['\\u00a0', 'escape \\u'],
    [String.raw`\x41`, 'escape \\x'],
    [String.raw`[a-z&&[^b]]`, 'class intersection'],
    [String.raw`[[:alpha:]]`, 'nested character class'],
    [String.raw`(?<Amount>1)`, 'group name'],
    [String.raw`(?<a1_>1)(?<a1_>2)`, 'duplicate group name'],
    [String.raw`a{`, 'literal {'],
    [String.raw`a}`, 'literal }'],
    [String.raw`(a`, 'unnamed capturing group'],
    [String.raw`a)`, 'unbalanced )'],
    [String.raw`[abc`, 'unterminated character class'],
    ['abc\\', 'trailing backslash'],
  ])('rejects %s (%s)', (pattern, reason) => {
    expect(() => validatePortableRegex(pattern)).toThrow(PortableRegexError);
    expect(() => validatePortableRegex(pattern)).toThrow(reason);
  });
});
