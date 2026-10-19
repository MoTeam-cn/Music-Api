import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanText, msToSec, num, splitArtists, str, uniqueArtists } from '../src/core/normalize.ts';

test('cleanText strips tags and decodes entities', () => {
  assert.equal(cleanText('<b>晴天</b> &amp; 雨天'), '晴天 & 雨天');
  assert.equal(cleanText('  a   b  '), 'a b');
  assert.equal(cleanText(undefined), '');
});

test('msToSec handles ms and seconds', () => {
  assert.equal(msToSec(269000), 269);
  assert.equal(msToSec(269), 269);
  assert.equal(msToSec(0), 0);
});

test('splitArtists splits common separators', () => {
  assert.deepEqual(splitArtists('周杰伦、方文山'), ['周杰伦', '方文山']);
  assert.deepEqual(splitArtists('A & B'), ['A', 'B']);
  assert.deepEqual(splitArtists(''), []);
});

test('uniqueArtists dedupes and keeps order', () => {
  assert.deepEqual(uniqueArtists([{ name: 'A' }, { name: 'B' }, { name: 'A' }]), ['A', 'B']);
});

test('num and str narrow safely', () => {
  assert.equal(num('12'), 12);
  assert.equal(num('x', 3), 3);
  assert.equal(str(5), '5');
  assert.equal(str(null, 'd'), 'd');
});
