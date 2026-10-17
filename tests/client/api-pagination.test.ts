import { expect, it } from 'bun:test';
import { readApiPages } from '../../src/services/auth/readApiPages';

it('keeps records after the first server page and preserves query filters', async () => {
  const urls: string[] = [];
  const records = await readApiPages('/api/bookings?status=CONFIRMED', async url => {
    urls.push(url);
    return urls.length === 1
      ? { data: [{ id: 'first' }], hasMore: true, nextCursor: 'after space/&' }
      : { data: [{ id: 'second' }], hasMore: false };
  });
  expect(records.map(record => record.id)).toEqual(['first', 'second']);
  const second = new URL(urls[1], 'http://localhost');
  expect(second.searchParams.get('status')).toBe('CONFIRMED');
  expect(second.searchParams.get('cursor')).toBe('after space/&');
});

it('rejects broken pagination instead of looping or silently truncating', async () => {
  await expect(readApiPages('/api/leads', async () => ({ data: [], hasMore: true }))).rejects.toThrow('did not advance');
  await expect(readApiPages('/api/leads', async () => ({ data: [], hasMore: true, nextCursor: 'same' }))).rejects.toThrow('did not advance');
});
