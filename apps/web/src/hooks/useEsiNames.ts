import { useQuery } from '@tanstack/react-query';

interface EsiNameEntry {
  id: number;
  name: string;
  category: string;
}

async function resolveEsiNames(ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (ids.length === 0) return map;

  const unique = [...new Set(ids)].filter((id) => id > 0);
  const CHUNK = 80;

  for (let i = 0; i < unique.length; i += CHUNK) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1000));
    const chunk = unique.slice(i, i + CHUNK);
    try {
      const resp = await fetch(
        'https://esi.evetech.net/latest/universe/names/?datasource=tranquility',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(chunk),
        },
      );
      if (resp.status === 429 || resp.status === 420) {
        const retryAfter = parseInt(resp.headers.get('Retry-After') ?? '60', 10);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        i -= CHUNK;
        continue;
      }
      if (resp.ok) {
        const data: EsiNameEntry[] = await resp.json();
        for (const entry of data) {
          map.set(entry.id, entry.name);
        }
      }
    } catch {
      // ESI down, return empty — shimmers will stay until next refetch
    }
  }
  return map;
}

export function useEsiNames(ids: number[]) {
  const sortedKey = [...new Set(ids)].sort((a, b) => a - b);
  return useQuery({
    queryKey: ['esi-names', ...sortedKey],
    queryFn: () => resolveEsiNames(sortedKey),
    enabled: sortedKey.length > 0,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });
}
