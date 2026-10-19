// GET /v1/source：能力矩阵 + 禁用列表。

import { capabilityMatrix } from '../provider/index.ts';
import type { RouteContext, RouteResult } from '../router.ts';

export async function sourceRoute(ctx: RouteContext): Promise<RouteResult> {
  return {
    data: {
      capability: capabilityMatrix(),
      disable: ctx.config.sourceDisable,
    },
  };
}
