export class ProviderApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body: string,
  ) {
    super(`API ${status} ${url}: ${body.slice(0, 240)}`);
    this.name = "ProviderApiError";
  }
}

export const normalizeBaseUrl = (raw: string): string => {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error(`Base URL must start with http:// or https:// (got: ${raw})`);
  }
  return trimmed;
};

export const nextLink = (linkHeader: string | null): string | null => {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
};

export const fetchJson = async <T>(
  url: string,
  headers: HeadersInit,
): Promise<{ data: T; next: string | null }> => {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new ProviderApiError(res.status, url, body);
  }
  const data = await res.json() as T;
  return { data, next: nextLink(res.headers.get("link")) };
};

export const fetchText = async (
  url: string,
  headers: HeadersInit,
): Promise<string> => {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new ProviderApiError(res.status, url, body);
  }
  return await res.text();
};

export const paginate = async <T>(
  firstUrl: string,
  headers: HeadersInit,
  maxPages = 20,
): Promise<T[]> => {
  const items: T[] = [];
  let nextUrl: string | undefined = firstUrl;
  for (let pages = 0; pages < maxPages && nextUrl; pages++) {
    const result: { data: T[]; next: string | null } = await fetchJson<T[]>(
      nextUrl,
      headers,
    );
    items.push(...result.data);
    nextUrl = result.next ?? undefined;
  }
  return items;
};

export const mapPool = async <T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let index = 0;

  const worker = async (): Promise<void> => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  };

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
};
