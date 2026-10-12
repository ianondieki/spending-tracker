import { it } from 'vitest';

it('writes fixtures/*.json', async () => {
  await import('./write-fixtures.js');
});
