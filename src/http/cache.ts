// 进程内 TTL + LRU 缓存。只缓存成功结果，重启即失效。

interface Entry<V> {
  value: V;
  expireAt: number;
}

export class TtlCache<V> {
  private map = new Map<string, Entry<V>>();
  private max: number;
  private hits = 0;
  private misses = 0;

  constructor(max: number) {
    this.max = max;
  }

  get(key: string, now: number = Date.now()): V | undefined {
    const entry = this.map.get(key);
    if (entry === undefined) {
      this.misses += 1;
      return undefined;
    }
    if (entry.expireAt <= now) {
      this.map.delete(key);
      this.misses += 1;
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, entry);
    this.hits += 1;
    return entry.value;
  }

  set(key: string, value: V, ttlMs: number, now: number = Date.now()): void {
    if (ttlMs <= 0) return;
    this.map.delete(key);
    this.map.set(key, { value, expireAt: now + ttlMs });
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next();
      if (oldest.done === true) break;
      this.map.delete(oldest.value);
    }
  }

  stats(): { size: number; hit: number; miss: number } {
    return { size: this.map.size, hit: this.hits, miss: this.misses };
  }
}
