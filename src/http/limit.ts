// 令牌桶限流（按 IP）+ 每源并发闸门。

interface Bucket {
  tokens: number;
  last: number;
}

export class TokenBucket {
  private capacity: number;
  private perMs: number;
  private buckets = new Map<string, Bucket>();

  constructor(capacity: number, perMinute: number) {
    this.capacity = capacity;
    this.perMs = perMinute / 60000;
  }

  take(key: string, now: number = Date.now()): boolean {
    let bucket = this.buckets.get(key);
    if (bucket === undefined) {
      bucket = { tokens: this.capacity, last: now };
      this.buckets.set(key, bucket);
    }
    const elapsed = now - bucket.last;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.perMs);
    bucket.last = now;
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    if (this.buckets.size > 20000) this.prune(now);
    return true;
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.last > 600000) this.buckets.delete(key);
    }
  }
}

interface Waiter {
  grant: () => void;
  timer: ReturnType<typeof setTimeout>;
}

export class Semaphore {
  private free: number;
  private waiters: Waiter[] = [];

  constructor(size: number) {
    this.free = size;
  }

  acquire(timeoutMs: number): Promise<() => void> {
    if (this.free > 0) {
      this.free -= 1;
      return Promise.resolve(this.releaseFn());
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        grant: () => {
          resolve(this.releaseFn());
        },
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(new Error('semaphore timeout'));
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  private releaseFn(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiters.shift();
      if (next !== undefined) {
        clearTimeout(next.timer);
        next.grant();
      } else {
        this.free += 1;
      }
    };
  }
}
