// 上游连通性探针：直接调用 provider，打真网输出四源能力结果。
// 用法：npm run probe（需要网络；不走本地服务）

import type { Provider } from '../src/provider/types.ts';
import { listProviders } from '../src/provider/index.ts';

const FIXTURE: Record<string, Record<string, string>> = {
  netease: { playlist: '3778678', rank: '19723756' },
  tencent: { album: '000MkMni19ClKG', playlist: '7011264340' },
  kugou: { artist: '3520', rank: '8888' },
  baidu: { artist: 'A10273267' },
};

async function timed<T>(label: string, run: () => Promise<T>, summary: (value: T) => string): Promise<boolean> {
  const started = Date.now();
  try {
    const value = await run();
    console.log('OK   ' + label.padEnd(26) + String(Date.now() - started).padStart(5) + 'ms  ' + summary(value));
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log('FAIL ' + label.padEnd(26) + String(Date.now() - started).padStart(5) + 'ms  ' + message.slice(0, 80));
    return false;
  }
}

async function probeSource(provider: Provider): Promise<void> {
  const source = provider.source;
  const fixture = FIXTURE[source] ?? {};
  console.log('\n== ' + source + ' ==');

  let firstId = '';
  let firstAlbum = '';
  await timed('search', () => provider.search('晴天', 1, 5), (page) => {
    const pick = page.list.find((item) => item.available) ?? page.list[0];
    firstId = pick?.id ?? '';
    firstAlbum = pick?.albumId ?? '';
    return 'n=' + page.list.length + ' first=' + JSON.stringify(pick?.name ?? '') + ' avail=' + String(pick?.available);
  });

  if (firstId !== '') {
    await timed('song', () => provider.song(firstId), (song) => JSON.stringify(song.name) + ' dur=' + song.duration);
    await timed('url', () => provider.url(firstId, 'standard'), (item) => item.url.slice(0, 48));
    await timed('lyric', () => provider.lyric(firstId), (item) => 'len=' + item.lyric.length);
  }

  const albumId = fixture.album ?? firstAlbum;
  const album = provider.album;
  if (provider.capability.album && album !== undefined && albumId !== '') {
    await timed('album', () => album(albumId), (item) => JSON.stringify(item.name) + ' n=' + item.song.length);
  }

  const playlist = provider.playlist;
  const playlistId = fixture.playlist;
  if (provider.capability.playlist && playlist !== undefined && playlistId !== undefined) {
    await timed('playlist', () => playlist(playlistId), (item) => 'n=' + item.song.length);
  }

  const rankList = provider.rankList;
  if (provider.capability.rank && rankList !== undefined) {
    await timed('rankList', () => rankList(), (items) => 'n=' + items.length);
  }

  const rank = provider.rank;
  const rankId = fixture.rank;
  if (provider.capability.rank && rank !== undefined && rankId !== undefined) {
    await timed('rank', () => rank(rankId), (item) => JSON.stringify(item.name) + ' n=' + item.song.length);
  }

  const artist = provider.artist;
  const artistId = fixture.artist;
  if (provider.capability.artist && artist !== undefined && artistId !== undefined) {
    await timed('artist', () => artist(artistId), (item) => JSON.stringify(item.name) + ' n=' + item.song.length);
  }
}

for (const provider of listProviders()) {
  await probeSource(provider);
}
