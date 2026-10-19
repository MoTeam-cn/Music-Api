import assert from 'node:assert/strict';
import test from 'node:test';
import { Semaphore, TokenBucket } from '../src/http/limit.ts';

test('token bucket blocks when exhausted and refills', () => {
  const bucket = new TokenBucket(2, 60);
  assert.equal(bucket.take('ip', 1000), true);
  assert.equal(bucket.take('ip', 1000), true);
  assert.equal(bucket.take('ip', 1000), false);
  assert.equal(bucket.take('ip', 2000), true);
});

test('token bucket isolates keys', () => {
  const bucket = new TokenBucket(1, 60);
  assert.equal(bucket.take('a', 0), true);
  assert.equal(bucket.take('b', 0), true);
});

test('semaphore limits concurrency and releases', async () => {
  const sem = new Semaphore(1);
  const release = await sem.acquire(100);
  let second = false;
  const pending = sem.acquire(200).then((fn) => {
    second = true;
    fn();
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(second, false);
  release();
  await pending;
  assert.equal(second, true);
});

test('semaphore times out while waiting', async () => {
  const sem = new Semaphore(1);
  await sem.acquire(1000);
  await assert.rejects(sem.acquire(10), /timeout/);
});
