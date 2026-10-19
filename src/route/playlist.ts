// GET /v1/playlist

import { Code, fail } from '../core/error.ts';
import type { Source } from '../core/model.ts';
import { requiredString, sourceParam } from '../http/request.ts';
import { getProvider } from '../provider/index.ts';
import type { RouteContext, RouteResult } from '../router.ts';

export async function playlistRoute(ctx: RouteContext): Promise<RouteResult> {
  const source = sourceParam(ctx.query, false) as Source;
  const id = requiredString(ctx.query, 'id', 200);
  const provider = getProvider(source);
  if (!provider.capability.playlist || provider.playlist === undefined) fail(Code.capability, source + ' does not support playlist');
  return { data: await provider.playlist(id), source };
}
