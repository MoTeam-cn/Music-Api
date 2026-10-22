// 运行配置：全部来自环境变量，缺省值面向本机自用。

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Config {
  port: number;
  host: string;
  logLevel: LogLevel;
  timeoutMs: number;
  rateLimit: number;
  rateBurst: number;
  cacheMax: number;
  sourceDisable: string[];
  trustProxy: boolean;
  enableStreamProxy: boolean;
  requireOrigin: boolean;
  uaFilter: boolean;
  uaBlock: string[];
  version: string;
}

export const VERSION = '0.2.0';

// 常见 HTTP 客户端库默认 UA：直接拦截（curl/wget 保留，便于调试）
export const DEFAULT_UA_BLOCK = [
  'okhttp',
  'python-requests',
  'python-urllib',
  'aiohttp',
  'scrapy',
  'go-http-client',
  'java/',
  'libwww-perl',
  'node-fetch',
  'undici',
  'axios',
  'postmanruntime',
  'insomnia',
  'httpie',
  'reqwest',
  'dart:io',
];

export const NOTICE = 'For technical research and learning only. Public data only. No VIP/paid content, no audio storage, no CORS.';

const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

function intEnv(env: Record<string, string | undefined>, key: string, def: number, min: number, max: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return def;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return def;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function boolEnv(env: Record<string, string | undefined>, key: string, def: boolean): boolean {
  const raw = (env[key] ?? '').trim().toLowerCase();
  if (raw === '') return def;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function listEnv(env: Record<string, string | undefined>, key: string, def: string[]): string[] {
  const raw = (env[key] ?? '').trim();
  if (raw === '') return def;
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

function levelEnv(env: Record<string, string | undefined>): LogLevel {
  const raw = (env.LOG_LEVEL ?? '').trim().toLowerCase() as LogLevel;
  return LEVELS.includes(raw) ? raw : 'info';
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const disable = (env.SOURCE_DISABLE ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return {
    port: intEnv(env, 'PORT', 8802, 1, 65535),
    host: (env.HOST ?? '127.0.0.1').trim() || '127.0.0.1',
    logLevel: levelEnv(env),
    timeoutMs: intEnv(env, 'TIMEOUT_MS', 6000, 1000, 30000),
    rateLimit: intEnv(env, 'RATE_LIMIT', 60, 1, 10000),
    rateBurst: intEnv(env, 'RATE_BURST', 10, 0, 1000),
    cacheMax: intEnv(env, 'CACHE_MAX', 500, 10, 100000),
    sourceDisable: disable,
    trustProxy: boolEnv(env, 'TRUST_PROXY', false),
    enableStreamProxy: boolEnv(env, 'ENABLE_STREAM_PROXY', false),
    requireOrigin: boolEnv(env, 'ORIGIN_REQUIRED', true),
    uaFilter: boolEnv(env, 'UA_FILTER', true),
    uaBlock: listEnv(env, 'UA_BLOCK', DEFAULT_UA_BLOCK),
    version: VERSION,
  };
}
