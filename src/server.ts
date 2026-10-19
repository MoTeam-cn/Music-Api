// HTTP 服务：路由、限流、缓存（TTL + LRU + SWR + singleflight）、JSONP 出口、日志。

import { createServer } from 'node:http';
import type { IncomingMessage, Server } from 'node:http';
import type { Config } from './config.ts';
import { AppError, Code, isAppError } from './core/error.ts';
import type { Source } from './core/model.ts';
import { TtlCache } from './http/cache.ts';
import { TokenBucket } from './http/limit.ts';
import { createLogger, hashIp } from './http/log.ts';
import type { Logger } from './http/log.ts';
import { send, sendRaw } from './http/respond.ts';
import type { SendOptions } from './http/respond.ts';
import { createRouter } from './router.ts';
import type { RouteContext, RouteDef, RouteResult } from './router.ts';
import { albumRoute } from './route/album.ts';
import { homeRoute, openapiRoute } from './route/doc.ts';
import { artistRoute } from './route/artist.ts';
import { lyricRoute } from './route/lyric.ts';
import { playlistRoute } from './route/playlist.ts';
import { rankRoute } from './route/rank.ts';
import { searchRoute } from './route/search.ts';
import { songRoute, songUrlRoute } from './route/song.ts';
import { sourceRoute } from './route/source.ts';
import { statusRoute } from './route/status.ts';

const ORIGIN_RE = /^[A-Za-z0-9._:/-]{1,64}$/;

const TTL_SEARCH = 60000;
const TTL_URL = 60000;
const TTL_LYRIC = 3600000;
const TTL_STATUS = 5000;
const TTL_DEFAULT = 300000;

// 过期后仍可继续返回旧值并后台刷新，避免并发打爆上游
const STALE_WINDOW = 30000;

function routes(): RouteDef[] {
  return [
    { path: '/', handler: homeRoute, raw: true },
    { path: '/openapi.json', handler: openapiRoute, raw: true },
    { path: '/v1/search', handler: searchRoute },
    { path: '/v1/song', handler: songRoute },
    { path: '/v1/song/url', handler: songUrlRoute },
    { path: '/v1/lyric', handler: lyricRoute },
    { path: '/v1/album', handler: albumRoute },
    { path: '/v1/artist', handler: artistRoute },
    { path: '/v1/playlist', handler: playlistRoute },
    { path: '/v1/rank', handler: rankRoute },
    { path: '/v1/source', handler: sourceRoute },
    { path: '/v1/status', handler: statusRoute },
  ];
}

function ttlFor(pathname: string): number {
  if (pathname === '/v1/search') return TTL_SEARCH;
  if (pathname === '/v1/song/url') return TTL_URL;
  if (pathname === '/v1/lyric') return TTL_LYRIC;
  if (pathname === '/v1/status' || pathname === '/v1/source') return TTL_STATUS;
  return TTL_DEFAULT;
}

function cacheControlFor(ttlMs: number): string {
  const sec = Math.max(1, Math.floor(ttlMs / 1000));
  return 'public, max-age=' + sec + ', s-maxage=' + sec + ', stale-while-revalidate=30';
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

function clientIp(req: IncomingMessage, config: Config): string {
  if (config.trustProxy) {
    const header = req.headers['x-forwarded-for'];
    if (typeof header === 'string' && header.trim() !== '') return header.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function cacheKeyOf(pathname: string, params: URLSearchParams): string {
  const entries: Array<[string, string]> = [];
  for (const [key, value] of params) {
    if (key === 'callback' || key === 'cb' || key === 'origin') continue;
    entries.push([key, value]);
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return pathname + '?' + entries.map(([key, value]) => key + '=' + value).join('&');
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' ? value : undefined;
}

function uaBlocked(ua: string, block: string[]): boolean {
  const raw = ua.trim();
  if (raw === '') return true;
  const lower = raw.toLowerCase();
  return block.some((token) => lower.includes(token));
}

export function createApp(config: Config): Server {
  const logger: Logger = createLogger(config.logLevel);
  const limiter = new TokenBucket(config.rateLimit + config.rateBurst, config.rateLimit);
  const cache = new TtlCache<unknown>(config.cacheMax);
  const inflight = new Map<string, Promise<RouteResult>>();
  const router = createRouter(routes());
  const startedAt = Date.now();

  // 同一个 key 的并发请求只打一次上游；结果写缓存后由所有等待者共享
  function startFetch(cacheKey: string, route: RouteDef, ctx: RouteContext, ttlMs: number): Promise<RouteResult> {
    const pending = route.handler(ctx);
    inflight.set(cacheKey, pending);
    pending
      .then((result) => {
        if (result.raw === undefined) {
          const ttl = result.ttlMs ?? ttlMs;
          cache.set(cacheKey, { data: result.data, source: result.source, ttlMs: ttl }, ttl, STALE_WINDOW);
        }
      })
      .catch(() => {
        cache.delete(cacheKey);
      })
      .finally(() => {
        if (inflight.get(cacheKey) === pending) inflight.delete(cacheKey);
      });
    return pending;
  }

  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const pathname = normalizePath(url.pathname);
    const callback = url.searchParams.get('callback') ?? url.searchParams.get('cb') ?? undefined;
    const ip = clientIp(req, config);
    const ipKey = hashIp(ip);
    const head = req.method === 'HEAD';
    const method = head ? 'GET' : (req.method ?? 'GET');
    const acceptEncoding = headerValue(req, 'accept-encoding');
    const ua = headerValue(req, 'user-agent') ?? '';
    const origin = (url.searchParams.get('origin') ?? '').trim();

    function done(code: number, message: string, data: unknown, source: Source | undefined, cost: number, opts: SendOptions = {}): void {
      send(res, { code, message, data, source, cost }, callback, { head, acceptEncoding, ...opts });
      logger.info('request', { route: pathname, code, ms: Date.now() - startedAt, ip: ipKey, origin: origin === '' ? undefined : origin, cache: opts.cacheState });
    }

    function fail(code: number, message: string): void {
      done(code, message, null, undefined, 0, { cacheControl: 'no-store' });
    }

    if (config.uaFilter && uaBlocked(ua, config.uaBlock)) {
      fail(Code.blocked, 'client blocked');
      return;
    }

    if (!limiter.take(ip)) {
      fail(Code.rate, 'rate limited');
      return;
    }

    const match = router.resolve(method, pathname);
    if (match.kind === 'notFound') {
      fail(Code.notFound, 'not found');
      return;
    }
    if (match.kind === 'methodNotAllowed') {
      fail(Code.method, 'method not allowed');
      return;
    }

    if (match.route.raw !== true && config.requireOrigin && !ORIGIN_RE.test(origin)) {
      fail(Code.param, 'missing or invalid param: origin');
      return;
    }

    const ctx: RouteContext = { query: url.searchParams, config, cache, startedAt };

    if (match.route.raw === true) {
      const rawStarted = Date.now();
      match.route
        .handler(ctx)
        .then((result) => {
          if (result.raw === undefined) {
            fail(Code.internal, 'invalid raw response');
            return;
          }
          sendRaw(res, result.raw, {
            head,
            acceptEncoding,
            ifNoneMatch: headerValue(req, 'if-none-match'),
            ifModifiedSince: headerValue(req, 'if-modified-since'),
          });
          logger.info('request', { route: pathname, code: 0, ms: Date.now() - rawStarted, ip: ipKey, cache: 'STATIC' });
        })
        .catch((err: unknown) => {
          logger.error('raw failed', { route: pathname, message: err instanceof Error ? err.message : String(err) });
          fail(Code.internal, 'internal error');
        });
      return;
    }

    const ttl = ttlFor(pathname);
    const cacheKey = cacheKeyOf(pathname, url.searchParams);
    type Cached = { data: unknown; source?: Source; ttlMs: number };
    const entry = cache.getWithMeta(cacheKey) as { value: Cached; stale: boolean } | undefined;

    if (entry !== undefined) {
      const cached = entry.value;
      if (entry.stale) {
        // 先返回旧值，后台刷新（失败则丢弃旧值，下次请求重新取）
        startFetch(cacheKey, match.route, ctx, ttl).catch(() => cache.delete(cacheKey));
      }
      done(0, 'ok', cached.data, cached.source, 0, {
        cacheControl: cacheControlFor(cached.ttlMs),
        cacheState: entry.stale ? 'STALE' : 'HIT',
      });
      return;
    }

    const fetchStarted = Date.now();
    const existing = inflight.get(cacheKey);
    const pending = existing ?? startFetch(cacheKey, match.route, ctx, ttl);
    const shared = existing !== undefined;

    pending
      .then((result) => {
        if (result.raw !== undefined) {
          fail(Code.internal, 'invalid response');
          return;
        }
        done(0, 'ok', result.data, result.source, shared ? 0 : Date.now() - fetchStarted, {
          cacheControl: cacheControlFor(result.ttlMs ?? ttl),
          cacheState: shared ? 'SHARED' : 'MISS',
        });
      })
      .catch((err: unknown) => {
        if (isAppError(err)) {
          done(err.code, err.message, null, undefined, Date.now() - fetchStarted, { cacheControl: 'no-store' });
          return;
        }
        logger.error('unhandled', { route: pathname, message: err instanceof Error ? err.message : String(err) });
        fail(Code.internal, 'internal error');
      });
  });
}
