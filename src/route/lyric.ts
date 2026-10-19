// GET /v1/lyric

import { Code, fail } from '../core/error.ts';
import type { Source } from '../core/model.ts';
import { requiredString, sourceParam } from '../http/request.ts';
import { getProvider } from '../provider/index.ts';
import type { RouteContext, RouteResult } from '../router.ts';

export async function lyricRoute(ctx: RouteContext): Promise<RouteResult> {
  const source = sourceParam(ctx.query, false) as Source;
  const id = requiredString(ctx.query, 'id', 200);
  const provider = getProvider(source);
  if (!provider.capability.lyric) fail(Code.capability, source + ' does not support lyric');
  return { data: await provider.lyric(id), source };
}
