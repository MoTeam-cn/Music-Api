// GET /v1/album

import { Code, fail } from '../core/error.ts';
import type { Source } from '../core/model.ts';
import { requiredString, sourceParam } from '../http/request.ts';
import { getProvider } from '../provider/index.ts';
import type { RouteContext, RouteResult } from '../router.ts';

export async function albumRoute(ctx: RouteContext): Promise<RouteResult> {
  const source = sourceParam(ctx.query, false) as Source;
  const id = requiredString(ctx.query, 'id', 200);
  const provider = getProvider(source);
  if (!provider.capability.album || provider.album === undefined) fail(Code.capability, source + ' does not support album');
  return { data: await provider.album(id), source };
}
