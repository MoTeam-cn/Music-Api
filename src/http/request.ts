// 查询参数解析与校验：缺参/越界一律 1001。

import { Code, fail } from '../core/error.ts';
import { QUALITIES, SOURCES } from '../core/model.ts';
import type { Quality, Source } from '../core/model.ts';

export function requiredString(query: URLSearchParams, name: string, max: number = 120): string {
  const raw = (query.get(name) ?? '').trim();
  if (raw === '') fail(Code.param, 'missing param: ' + name);
  if (raw.length > max) fail(Code.param, 'param too long: ' + name);
  return raw;
}

export function optionalString(query: URLSearchParams, name: string, max: number = 120): string | undefined {
  const raw = query.get(name);
  if (raw === null) return undefined;
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  if (trimmed.length > max) fail(Code.param, 'param too long: ' + name);
  return trimmed;
}

export function intParam(query: URLSearchParams, name: string, def: number, min: number, max: number): number {
  const raw = query.get(name);
  if (raw === null || raw.trim() === '') return def;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || String(n) !== raw.trim()) fail(Code.param, 'invalid int: ' + name);
  if (n < min || n > max) fail(Code.param, 'out of range: ' + name);
  return n;
}

export function sourceParam(query: URLSearchParams, allowAll: boolean): Source | 'all' {
  const raw = (query.get('source') ?? '').trim();
  if (raw === '') return allowAll ? 'all' : 'netease';
  if (allowAll && raw === 'all') return 'all';
  if ((SOURCES as string[]).includes(raw)) return raw as Source;
  fail(Code.source, 'unsupported source: ' + raw);
}

export function qualityParam(query: URLSearchParams): Quality {
  const raw = (query.get('quality') ?? '').trim();
  if (raw === '') return 'standard';
  if ((QUALITIES as string[]).includes(raw)) return raw as Quality;
  fail(Code.param, 'unsupported quality: ' + raw);
}
