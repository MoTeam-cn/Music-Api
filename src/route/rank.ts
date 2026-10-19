// GET /v1/rank：不带 id 返回榜单列表，带 id 返回榜单详情。

import { Code, fail } from '../core/error.ts';
import type { Source } from '../core/model.ts';
import { optionalString, sourceParam } from '../http/request.ts';
import { getProvider } from '../provider/index.ts';
import type { RouteContext, RouteResult } from '../router.ts';

export async function rankRoute(ctx: RouteContext): Promise<RouteResult> {
  const source = sourceParam(ctx.query, false) as Source;
  const id = optionalString(ctx.query, 'id', 200);
  const provider = getProvider(source);
  if (!provider.capability.rank) fail(Code.capability, source + ' does not support rank');
  if (id === undefined) {
    if (provider.rankList === undefined) fail(Code.capability, source + ' does not support rank list');
    return { data: { source, list: await provider.rankList() }, source };
  }
  if (provider.rank === undefined) fail(Code.capability, source + ' does not support rank detail');
  return { data: await provider.rank(id), source };
}
