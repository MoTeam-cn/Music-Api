// GET /v1/status：版本、运行时长、缓存命中、免责声明摘要。

import { NOTICE } from '../config.ts';
import type { RouteContext, RouteResult } from '../router.ts';

export async function statusRoute(ctx: RouteContext): Promise<RouteResult> {
  return {
    data: {
      version: ctx.config.version,
      uptime: Math.floor((Date.now() - ctx.startedAt) / 1000),
      cache: ctx.cache.stats(),
      notice: NOTICE,
    },
  };
}
