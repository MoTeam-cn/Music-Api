// GET /v1/song、GET /v1/song/url

import { Code, fail } from '../core/error.ts';
import type { Source } from '../core/model.ts';
import { qualityParam, requiredString, sourceParam } from '../http/request.ts';
import { getProvider } from '../provider/index.ts';
import type { RouteContext, RouteResult } from '../router.ts';

export async function songRoute(ctx: RouteContext): Promise<RouteResult> {
  const source = sourceParam(ctx.query, false) as Source;
  const id = requiredString(ctx.query, 'id', 200);
  const provider = getProvider(source);
  if (!provider.capability.song) fail(Code.capability, source + ' does not support song');
  return { data: await provider.song(id), source };
}

export async function songUrlRoute(ctx: RouteContext): Promise<RouteResult> {
  const source = sourceParam(ctx.query, false) as Source;
  const id = requiredString(ctx.query, 'id', 200);
  const quality = qualityParam(ctx.query);
  const provider = getProvider(source);
  if (!provider.capability.url) fail(Code.capability, source + ' does not support url');
  return { data: await provider.url(id, quality), source };
}
