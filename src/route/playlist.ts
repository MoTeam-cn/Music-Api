// GET /v1/playlist：歌单详情 + 分页；with_url=1 时直接补播放地址。

import { Code, fail } from '../core/error.ts';
import type { Source } from '../core/model.ts';
import { intParam, qualityParam, requiredString, sourceParam } from '../http/request.ts';
import { attachUrls } from '../provider/attach.ts';
import { getProvider } from '../provider/index.ts';
import type { RouteContext, RouteResult } from '../router.ts';

const WITH_URL_TTL = 60000;

export async function playlistRoute(ctx: RouteContext): Promise<RouteResult> {
  const source = sourceParam(ctx.query, false) as Source;
  const id = requiredString(ctx.query, 'id', 200);
  const page = intParam(ctx.query, 'page', 1, 1, 1000);
  const size = intParam(ctx.query, 'size', 50, 1, 100);
  const withUrl = (ctx.query.get('with_url') ?? ctx.query.get('url') ?? '') === '1';
  const quality = qualityParam(ctx.query);

  const provider = getProvider(source);
  if (!provider.capability.playlist || provider.playlist === undefined) fail(Code.capability, source + ' does not support playlist');

  const detail = await provider.playlist(id, page, size);
  detail.hasMore = page * size < detail.total;
  if (withUrl) await attachUrls(provider, detail.song, quality);
  return { data: detail, source, ttlMs: withUrl ? WITH_URL_TTL : undefined };
}
