// HTTP 服务：路由、限流、缓存、JSONP 出口、日志。

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
import { createRouter } from './router.ts';
import type { RouteDef } from './router.ts';
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

const TTL_SEARCH = 60000;
const TTL_URL = 60000;
const TTL_LYRIC = 3600000;
const TTL_STATUS = 5000;
const TTL_DEFAULT = 300000;

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
    if (key === 'callback' || key === 'cb') continue;
    entries.push([key, value]);
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return pathname + '?' + entries.map(([key, value]) => key + '=' + value).join('&');
}

export function createApp(config: Config): Server {
  const logger: Logger = createLogger(config.logLevel);
  const limiter = new TokenBucket(config.rateLimit + config.rateBurst, config.rateLimit);
  const cache = new TtlCache<unknown>(config.cacheMax);
  const router = createRouter(routes());
  const startedAt = Date.now();

  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const pathname = normalizePath(url.pathname);
    const callback = url.searchParams.get('callback') ?? url.searchParams.get('cb') ?? undefined;
    const ip = clientIp(req, config);
    const ipKey = hashIp(ip);

    function done(code: number, message: string, data: unknown, source: Source | undefined, cost: number): void {
      send(res, { code, message, data, source, cost }, callback);
      logger.info('request', { route: pathname, code, ms: Date.now() - startedAt, ip: ipKey });
    }

    if (!limiter.take(ip)) {
      done(Code.rate, 'rate limited', null, undefined, 0);
      return;
    }

    const match = router.resolve(req.method ?? 'GET', pathname);
    if (match.kind === 'notFound') {
      done(Code.notFound, 'not found', null, undefined, 0);
      return;
    }
    if (match.kind === 'methodNotAllowed') {
      done(Code.method, 'method not allowed', null, undefined, 0);
      return;
    }

    const useCache = match.route.raw !== true;
    const cacheKey = cacheKeyOf(pathname, url.searchParams);
    if (useCache) {
      const cached = cache.get(cacheKey) as { data: unknown; source?: Source } | undefined;
      if (cached !== undefined) {
        done(0, 'ok', cached.data, cached.source, 0);
        return;
      }
    }

    const started = Date.now();
    match.route
      .handler({ query: url.searchParams, config, cache, startedAt })
      .then((result) => {
        if (result.raw !== undefined) {
          sendRaw(res, result.raw);
          logger.info('request', { route: pathname, code: 0, ms: Date.now() - started, ip: ipKey });
          return;
        }
        if (useCache) cache.set(cacheKey, { data: result.data, source: result.source }, ttlFor(pathname));
        done(0, 'ok', result.data, result.source, Date.now() - started);
      })
      .catch((err: unknown) => {
        if (isAppError(err)) {
          done(err.code, err.message, null, undefined, Date.now() - started);
          return;
        }
        logger.error('unhandled', { route: pathname, message: err instanceof Error ? err.message : String(err) });
        const appErr = new AppError(Code.internal, 'internal error');
        done(appErr.code, appErr.message, null, undefined, Date.now() - started);
      });
  });
}
