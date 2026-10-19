// provider 注册表：source -> 适配器。

import type { Source } from '../core/model.ts';
import { SOURCES } from '../core/model.ts';
import baidu from './baidu.ts';
import kugou from './kugou.ts';
import netease from './netease.ts';
import tencent from './tencent.ts';
import type { Capability, Provider } from './types.ts';

const PROVIDERS: Record<Source, Provider> = { netease, tencent, kugou, baidu };

export function getProvider(source: Source): Provider {
  return PROVIDERS[source];
}

export function listProviders(): Provider[] {
  return SOURCES.map((source) => PROVIDERS[source]);
}

export function capabilityMatrix(): Record<string, Record<Capability, boolean>> {
  const out: Record<string, Record<Capability, boolean>> = {};
  for (const provider of listProviders()) out[provider.source] = { ...provider.capability };
  return out;
}

export type { Capability, Provider };
