// 极简路由：静态路径表，全部 GET；未知路径 404，方法不符 405。

import type { Config } from './config.ts';
import type { Source } from './core/model.ts';
import type { TtlCache } from './http/cache.ts';
import type { RawResponse } from './http/respond.ts';

export interface RouteContext {
  query: URLSearchParams;
  config: Config;
  cache: TtlCache<unknown>;
  startedAt: number;
}

export type RawResult = RawResponse;

export interface RouteResult {
  data?: unknown;
  source?: Source;
  raw?: RawResult;
}

export type RouteHandler = (ctx: RouteContext) => Promise<RouteResult>;

export interface RouteDef {
  path: string;
  handler: RouteHandler;
  raw?: boolean;
}

export type Match =
  | { kind: 'ok'; route: RouteDef }
  | { kind: 'notFound' }
  | { kind: 'methodNotAllowed' };

export function createRouter(routes: RouteDef[]): { resolve(method: string, pathname: string): Match } {
  const table = new Map<string, RouteDef>();
  for (const route of routes) table.set(route.path, route);
  return {
    resolve(method: string, pathname: string): Match {
      const route = table.get(pathname);
      if (route === undefined) return { kind: 'notFound' };
      if (method !== 'GET') return { kind: 'methodNotAllowed' };
      return { kind: 'ok', route };
    },
  };
}
