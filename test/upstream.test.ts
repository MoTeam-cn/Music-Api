import assert from 'node:assert/strict';
import test from 'node:test';
import { parseJsonText, requestJson } from '../src/http/upstream.ts';

test('parses plain json', () => {
  assert.deepEqual(parseJsonText('{"a":1}'), { a: 1 });
});

test('unwraps jsonp wrapper', () => {
  assert.deepEqual(parseJsonText('MusicJsonCallback({"a":2})'), { a: 2 });
  assert.deepEqual(parseJsonText('cb({ "a": 3 });'), { a: 3 });
});

test('rejects invalid body with 2003', () => {
  assert.throws(() => parseJsonText('<html>no</html>'), /parse failed/);
});

test('blocks hosts outside whitelist before any network io', async () => {
  await assert.rejects(requestJson('https://evil.example.com/api'), /host not allowed/);
  await assert.rejects(requestJson('http://music.163.com/api/x'), /protocol not allowed/);
});
