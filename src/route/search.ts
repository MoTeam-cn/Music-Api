// GET /v1/search：单源或 source=all 并发聚合。

import { Code, fail } from '../core/error.ts';
import type { SearchPage, Song, Source } from '../core/model.ts';
import { intParam, optionalString, requiredString, sourceParam } from '../http/request.ts';
import { getProvider, listProviders } from '../provider/index.ts';
import type { RouteContext, RouteResult } from '../router.ts';

export async function searchRoute(ctx: RouteContext): Promise<RouteResult> {
  const q = requiredString(ctx.query, 'q', 80);
  const page = intParam(ctx.query, 'page', 1, 1, 50);
  const size = intParam(ctx.query, 'size', 20, 1, 50);
  const type = optionalString(ctx.query, 'type') ?? 'song';
  if (type !== 'song') fail(Code.capability, 'search type not implemented: ' + type);

  const source = sourceParam(ctx.query, true);
  if (source !== 'all') {
    const provider = getProvider(source);
    if (!provider.capability.search) fail(Code.capability, source + ' does not support search');
    return { data: await provider.search(q, page, size), source };
  }

  const targets = listProviders().filter((provider) => provider.capability.search);
  const settled = await Promise.allSettled(targets.map((provider) => provider.search(q, page, size)));
  const list: Song[] = [];
  const failed: Source[] = [];
  let total = 0;
  settled.forEach((result, index) => {
    const provider = targets[index];
    if (result.status === 'fulfilled') {
      list.push(...result.value.list);
      total += result.value.total;
    } else {
      failed.push(provider.source);
    }
  });
  const data: SearchPage = { page, size, total, failed, list };
  return { data };
}
