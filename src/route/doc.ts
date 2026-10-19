// 文档路由：GET / 与 GET /openapi.json（不包 envelope，带 ETag / Last-Modified / CDN 缓存头）。

import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { VERSION } from '../config.ts';
import { openapiDocument } from '../docs/index.ts';
import { homePage } from '../web/index.ts';
import type { RouteResult } from '../router.ts';

function etagOf(body: string): string {
  return '"' + createHash('sha256').update(body).digest('hex').slice(0, 16) + '"';
}

function mtimeOf(url: URL): Date {
  try {
    return statSync(url).mtime;
  } catch {
    return new Date();
  }
}

const HOME_BODY = homePage(VERSION);
const HOME_ETAG = etagOf(HOME_BODY);
const HOME_MTIME = mtimeOf(new URL('../web/home.html', import.meta.url));

const OPENAPI_BODY = JSON.stringify(openapiDocument(VERSION));
const OPENAPI_ETAG = etagOf(OPENAPI_BODY);
const OPENAPI_MTIME = mtimeOf(new URL('../docs/openapi.json', import.meta.url));

export async function homeRoute(): Promise<RouteResult> {
  return {
    raw: {
      contentType: 'text/html; charset=utf-8',
      body: HOME_BODY,
      cacheControl: 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400',
      etag: HOME_ETAG,
      lastModified: HOME_MTIME,
    },
  };
}

export async function openapiRoute(): Promise<RouteResult> {
  return {
    raw: {
      contentType: 'application/json; charset=utf-8',
      body: OPENAPI_BODY,
      cacheControl: 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      etag: OPENAPI_ETAG,
      lastModified: OPENAPI_MTIME,
    },
  };
}
