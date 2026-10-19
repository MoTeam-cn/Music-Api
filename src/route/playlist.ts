// GET /v1/playlist：歌单详情 + 分页；每首歌带 available / vip 供前端预先过滤。

import { Code, fail } from '../core/error.ts';
import type { Source } from '../core/model.ts';
import { intParam, requiredString, sourceParam } from '../http/request.ts';
import { getProvider } from '../provider/index.ts';
import type { RouteContext, RouteResult } from '../router.ts';

export async function playlistRoute(ctx: RouteContext): Promise<RouteResult> {
  const source = sourceParam(ctx.query, false) as Source;
  const id = requiredString(ctx.query, 'id', 200);
  const page = intParam(ctx.query, 'page', 1, 1, 1000);
  const size = intParam(ctx.query, 'size', 50, 1, 100);

  const provider = getProvider(source);
  if (!provider.capability.playlist || provider.playlist === undefined) fail(Code.capability, source + ' does not support playlist');

  const detail = await provider.playlist(id, page, size);
  detail.hasMore = page * size < detail.total;
  return { data: detail, source };
}
