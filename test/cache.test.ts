import assert from 'node:assert/strict';
import test from 'node:test';
import { TtlCache } from '../src/http/cache.ts';

test('returns value before ttl and misses after', () => {
  const cache = new TtlCache<string>(10);
  cache.set('k', 'v', 100, 1000);
  assert.equal(cache.get('k', 1050), 'v');
  assert.equal(cache.get('k', 1200), undefined);
});

test('evicts least recently used when full', () => {
  const cache = new TtlCache<string>(2);
  cache.set('a', '1', 10000, 1);
  cache.set('b', '2', 10000, 1);
  assert.equal(cache.get('a', 2), '1');
  cache.set('c', '3', 10000, 2);
  assert.equal(cache.get('b', 3), undefined);
  assert.equal(cache.get('a', 3), '1');
  assert.equal(cache.get('c', 3), '3');
});

test('stats count hits and misses', () => {
  const cache = new TtlCache<number>(4);
  cache.set('x', 1, 1000, 0);
  cache.get('x', 1);
  cache.get('y', 1);
  assert.deepEqual(cache.stats(), { size: 1, hit: 1, miss: 1 });
});
