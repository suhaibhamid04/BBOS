interface ApiListPage<T> {
  data: T[];
  hasMore?: boolean;
  nextCursor?: string | null;
}

/** Consumers that need a full registry must follow the server's scoped cursor. */
export async function readApiPages<T>(
  endpoint: string,
  readPage: (url: string) => Promise<ApiListPage<T>>,
): Promise<T[]> {
  const result: T[] = [];
  const cursors = new Set<string>();
  let url = endpoint;
  while (true) {
    const page = await readPage(url);
    if (!Array.isArray(page.data)) throw new Error('API list response is malformed.');
    result.push(...page.data);
    if (page.hasMore !== true) return result;
    if (typeof page.nextCursor !== 'string' || !page.nextCursor || cursors.has(page.nextCursor)) {
      throw new Error('API pagination did not advance. Please retry.');
    }
    cursors.add(page.nextCursor);
    const next = new URL(endpoint, 'http://bbos.local');
    next.searchParams.set('cursor', page.nextCursor);
    url = `${next.pathname}${next.search}`;
  }
}
