// 进程内 TTL + LRU + stale-while-revalidate 缓存。只缓存成功结果，重启即失效。

export interface CacheStats {
  size: number;
  hit: number;
  miss: number;
  staleHit: number;
  evict: number;
  hitRate: number;
}

interface Entry<V> {
  value: V;
  expireAt: number;
  staleUntil: number;
}

export interface CacheValue<V> {
  value: V;
  stale: boolean;
}

export class TtlCache<V> {
  private map = new Map<string, Entry<V>>();
  private max: number;
  private hits = 0;
  private misses = 0;
  private staleHits = 0;
  private evicts = 0;

  constructor(max: number) {
    this.max = max;
  }

  /** 只返回未过期的值；过期条目保留给 stale 读取，不立即删除。 */
  get(key: string, now: number = Date.now()): V | undefined {
    const entry = this.map.get(key);
    if (entry === undefined || entry.expireAt <= now) {
      this.misses += 1;
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, entry);
    this.hits += 1;
    return entry.value;
  }

  /** 返回未过期（fresh）或过期但仍在 stale 窗口内的值。 */
  getWithMeta(key: string, now: number = Date.now()): CacheValue<V> | undefined {
    const entry = this.map.get(key);
    if (entry === undefined || entry.staleUntil <= now) {
      if (entry !== undefined) this.map.delete(key);
      this.misses += 1;
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, entry);
    if (entry.expireAt > now) {
      this.hits += 1;
      return { value: entry.value, stale: false };
    }
    this.staleHits += 1;
    return { value: entry.value, stale: true };
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  set(key: string, value: V, ttlMs: number, staleMs: number = 0, now: number = Date.now()): void {
    if (ttlMs <= 0) return;
    this.map.delete(key);
    this.map.set(key, { value, expireAt: now + ttlMs, staleUntil: now + ttlMs + Math.max(0, staleMs) });
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next();
      if (oldest.done === true) break;
      this.map.delete(oldest.value);
      this.evicts += 1;
    }
  }

  stats(): CacheStats {
    const total = this.hits + this.misses + this.staleHits;
    return {
      size: this.map.size,
      hit: this.hits,
      miss: this.misses,
      staleHit: this.staleHits,
      evict: this.evicts,
      hitRate: total === 0 ? 0 : Math.round(((this.hits + this.staleHits) / total) * 1000) / 1000,
    };
  }
}
