// 浏览器 SDK 静态资源：GET /sdk.js、GET /sdk.d.ts（不包 envelope，带 ETag / 304）。

import {
  SDK_BODY,
  SDK_ETAG,
  SDK_MTIME,
  SDK_TYPES_BODY,
  SDK_TYPES_ETAG,
  SDK_TYPES_MTIME,
} from '../sdk/index.ts';
import type { RouteResult } from '../router.ts';

// SDK 更新频率高于 openapi，缓存相对短；ETag 保证命中时只回 304。
const CACHE_CONTROL = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';

export async function sdkRoute(): Promise<RouteResult> {
  return {
    raw: {
      contentType: 'text/javascript; charset=utf-8',
      body: SDK_BODY,
      cacheControl: CACHE_CONTROL,
      etag: SDK_ETAG,
      lastModified: SDK_MTIME,
    },
  };
}

export async function sdkTypesRoute(): Promise<RouteResult> {
  return {
    raw: {
      contentType: 'text/plain; charset=utf-8',
      body: SDK_TYPES_BODY,
      cacheControl: CACHE_CONTROL,
      etag: SDK_TYPES_ETAG,
      lastModified: SDK_TYPES_MTIME,
    },
  };
}
