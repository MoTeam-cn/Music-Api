import assert from 'node:assert/strict';
import test from 'node:test';
import { TtlCache } from '../src/http/cache.ts';

test('returns value before ttl and misses after', () => {
  const cache = new TtlCache<string>(10);
  cache.set('k', 'v', 100, 0, 1000);
  assert.equal(cache.get('k', 1050), 'v');
  assert.equal(cache.get('k', 1200), undefined);
});

test('evicts least recently used when full', () => {
  const cache = new TtlCache<string>(2);
  cache.set('a', '1', 10000, 0, 1);
  cache.set('b', '2', 10000, 0, 1);
  assert.equal(cache.get('a', 2), '1');
  cache.set('c', '3', 10000, 0, 2);
  assert.equal(cache.get('b', 3), undefined);
  assert.equal(cache.get('a', 3), '1');
  assert.equal(cache.get('c', 3), '3');
});

test('serves stale within stale window and drops after it', () => {
  const cache = new TtlCache<string>(4);
  cache.set('k', 'v', 100, 500, 0);
  assert.deepEqual(cache.getWithMeta('k', 50), { value: 'v', stale: false });
  assert.deepEqual(cache.getWithMeta('k', 200), { value: 'v', stale: true });
  assert.equal(cache.getWithMeta('k', 700), undefined);
});

test('stats count hits, misses and stale hits', () => {
  const cache = new TtlCache<number>(4);
  cache.set('x', 1, 1000, 0, 0);
  cache.get('x', 1);
  cache.get('y', 1);
  const stats = cache.stats();
  assert.equal(stats.size, 1);
  assert.equal(stats.hit, 1);
  assert.equal(stats.miss, 1);
  assert.equal(stats.staleHit, 0);
  assert.equal(stats.hitRate, 0.5);
});
