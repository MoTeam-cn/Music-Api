// 上游数据清洗：类型收窄、文本清理、时长换算。

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

export function str(value: unknown, fallback: string = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return fallback;
}

export function num(value: unknown, fallback: number = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function bool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

export function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function cleanText(value: unknown): string {
  let out = str(value).replace(/<[^>]*>/g, '');
  for (const [entity, char] of Object.entries(ENTITIES)) {
    out = out.split(entity).join(char);
  }
  return out.replace(/\s+/g, ' ').trim();
}

export function msToSec(value: unknown): number {
  const n = num(value);
  if (n <= 0) return 0;
  return Math.round(n > 10000 ? n / 1000 : n);
}

export function splitArtists(value: unknown): string[] {
  const raw = cleanText(value);
  if (raw === '') return [];
  return raw.split(/[、,，/&]/).map((s) => s.trim()).filter((s) => s.length > 0);
}

export function uniqueArtists(value: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of list<{ name?: unknown }>(value)) {
    const n = cleanText(name?.name);
    if (n !== '' && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}
