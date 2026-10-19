// 给歌曲列表批量补播放地址：优先用 provider 的批量接口，其余并发单曲补。

import type { Quality, Song, SongUrl } from '../core/model.ts';
import { Semaphore } from '../http/limit.ts';
import type { Provider } from './types.ts';

const CONCURRENCY = 6;
const ACQUIRE_TIMEOUT = 8000;

export async function attachUrls(provider: Provider, songs: Song[], quality: Quality): Promise<void> {
  const ids = songs.filter((song) => song.available).map((song) => song.id);
  let batch = new Map<string, SongUrl | null>();
  if (provider.urls !== undefined && ids.length > 0) {
    try {
      batch = await provider.urls(ids, quality);
    } catch {
      batch = new Map();
    }
  }

  const gate = new Semaphore(CONCURRENCY);
  await Promise.all(
    songs.map(async (song) => {
      if (!song.available) {
        song.url = null;
        return;
      }
      if (batch.has(song.id)) {
        const hit = batch.get(song.id);
        song.url = hit === null || hit === undefined ? null : hit.url;
        return;
      }
      const release = await gate.acquire(ACQUIRE_TIMEOUT).catch(() => undefined);
      if (release === undefined) {
        song.url = null;
        return;
      }
      try {
        const got = await provider.url(song.id, quality);
        song.url = got.url;
      } catch {
        song.url = null;
      } finally {
        release();
      }
    }),
  );
}
