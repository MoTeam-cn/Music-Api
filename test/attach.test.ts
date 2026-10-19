import assert from 'node:assert/strict';
import test from 'node:test';
import type { Song } from '../src/core/model.ts';
import { attachUrls } from '../src/provider/attach.ts';
import type { Provider } from '../src/provider/types.ts';

function song(id: string, available = true): Song {
  return { source: 'netease', id, name: id, artist: [], duration: 0, available, vip: !available };
}

test('attachUrls prefers batch results and only falls back for missing ids', async () => {
  const calls: string[] = [];
  const provider = {
    urls: async () =>
      new Map([
        ['a', { source: 'netease' as const, id: 'a', url: 'batch-a', quality: 'standard' as const, bitrate: 128 }],
        ['b', null],
      ]),
    url: async (id: string) => {
      calls.push(id);
      return { source: 'netease' as const, id, url: 'single-' + id, quality: 'standard' as const, bitrate: 128 };
    },
  } as unknown as Provider;

  const songs = [song('a'), song('b'), song('c'), song('vip', false)];
  await attachUrls(provider, songs, 'standard');

  assert.equal(songs[0].url, 'batch-a');
  assert.equal(songs[1].url, null);
  assert.equal(songs[2].url, 'single-c');
  assert.equal(songs[3].url, null);
  assert.deepEqual(calls, ['c']);
});

test('attachUrls falls back to single requests when batch throws', async () => {
  const calls: string[] = [];
  const provider = {
    urls: async () => {
      throw new Error('batch failed');
    },
    url: async (id: string) => {
      calls.push(id);
      return { source: 'netease' as const, id, url: 'single-' + id, quality: 'standard' as const, bitrate: 128 };
    },
  } as unknown as Provider;

  const songs = [song('a'), song('b')];
  await attachUrls(provider, songs, 'standard');
  assert.deepEqual(calls.sort(), ['a', 'b']);
  assert.equal(songs[0].url, 'single-a');
  assert.equal(songs[1].url, 'single-b');
});
