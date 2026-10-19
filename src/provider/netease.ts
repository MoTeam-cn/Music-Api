// 网易云：匿名 /api/* 接口，不涉及 weapi 加密链路。

import { Code, fail } from '../core/error.ts';
import type {
  AlbumDetail,
  ArtistDetail,
  Lyric,
  PlaylistDetail,
  Quality,
  RankDetail,
  RankItem,
  SearchPage,
  Song,
  SongDetail,
  SongUrl,
} from '../core/model.ts';
import { cleanText, list, msToSec, num, str, uniqueArtists } from '../core/normalize.ts';
import { requestJson } from '../http/upstream.ts';
import type { Provider } from './types.ts';

const BASE = 'https://music.163.com';
const HEADERS = { Referer: 'https://music.163.com/', Cookie: 'os=pc; appver=2.9.7' };
const BITRATE: Record<Quality, number> = { standard: 128000, high: 320000, lossless: 999000 };

function isFree(fee: unknown): boolean {
  const value = num(fee, 1);
  return value === 0 || value === 8;
}

function toSong(raw: any): Song {
  const album = raw?.album ?? raw?.al ?? {};
  return {
    source: 'netease',
    id: str(raw?.id),
    name: cleanText(raw?.name),
    artist: uniqueArtists(raw?.artists ?? raw?.ar),
    album: cleanText(album?.name),
    albumId: str(album?.id) || undefined,
    duration: msToSec(raw?.duration ?? raw?.dt),
    cover: str(album?.picUrl) || undefined,
    available: isFree(raw?.fee),
    vip: !isFree(raw?.fee),
  };
}

async function fetchSongs(ids: string[]): Promise<Song[]> {
  const out: Song[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const data = await requestJson<any>(BASE + '/api/song/detail?ids=[' + chunk.join(',') + ']', { headers: HEADERS });
    for (const item of list<any>(data?.songs)) out.push(toSong(item));
  }
  return out;
}

// 搜索接口不返回封面/精确时长，用详情接口批量补齐（一次请求，失败则降级）
async function enrich(songs: Song[]): Promise<Song[]> {
  const ids = songs.map((item) => item.id).filter((id) => id !== '');
  if (ids.length === 0) return songs;
  try {
    const detailed = await fetchSongs(ids);
    const map = new Map(detailed.map((item) => [item.id, item]));
    return songs.map((song) => {
      const full = map.get(song.id);
      return full === undefined ? song : { ...song, ...full };
    });
  } catch {
    return songs;
  }
}

async function search(q: string, page: number, size: number): Promise<SearchPage> {
  const offset = (page - 1) * size;
  const url = BASE + '/api/search/get/web?csrf_token=&s=' + encodeURIComponent(q) + '&type=1&offset=' + offset + '&limit=' + size + '&total=true';
  const data = await requestJson<any>(url, { headers: HEADERS });
  const songs = await enrich(list<any>(data?.result?.songs).map(toSong));
  return { page, size, total: num(data?.result?.songCount, songs.length), failed: [], list: songs };
}

async function song(id: string): Promise<SongDetail> {
  const data = await requestJson<any>(BASE + '/api/song/detail?ids=[' + encodeURIComponent(id) + ']', { headers: HEADERS });
  const raw = list<any>(data?.songs)[0];
  if (raw === undefined) fail(Code.notFound, 'song not found');
  return { ...toSong(raw), quality: ['standard'] };
}

async function url(id: string, quality: Quality): Promise<SongUrl> {
  const br = BITRATE[quality];
  const data = await requestJson<any>(BASE + '/api/song/enhance/player/url?ids=[' + encodeURIComponent(id) + ']&br=' + br, { headers: HEADERS });
  const item = list<any>(data?.data)[0];
  const link = str(item?.url);
  // 带 os=pc Cookie 时，网易会对 VIP 曲目返回 45 秒试听片段；fee=1/4 或 freeTrialInfo 一律拒绝
  const trial = item?.freeTrialInfo !== null && item?.freeTrialInfo !== undefined;
  if (link === '' || trial || !isFree(item?.fee)) fail(Code.vip, 'vip or paid only');
  return {
    source: 'netease',
    id,
    url: link,
    quality,
    bitrate: Math.round(num(item?.br, br) / 1000),
    size: num(item?.size) || undefined,
    expireAt: num(item?.expi) || undefined,
  };
}

async function lyric(id: string): Promise<Lyric> {
  const data = await requestJson<any>(BASE + '/api/song/lyric?id=' + encodeURIComponent(id) + '&lv=-1&kv=-1&tv=-1', { headers: HEADERS });
  const text = str(data?.lrc?.lyric);
  if (text === '') fail(Code.notFound, 'lyric not found');
  const translation = str(data?.tlyric?.lyric);
  return { source: 'netease', id, lyric: text, translation: translation === '' ? undefined : translation };
}

async function album(id: string): Promise<AlbumDetail> {
  const data = await requestJson<any>(BASE + '/api/album/' + encodeURIComponent(id), { headers: HEADERS });
  const item = data?.album;
  if (item === undefined) fail(Code.notFound, 'album not found');
  const publish = num(item?.publishTime);
  return {
    source: 'netease',
    id,
    name: cleanText(item?.name),
    artist: uniqueArtists(item?.artists),
    cover: str(item?.picUrl) || undefined,
    publishAt: publish > 0 ? new Date(publish).toISOString().slice(0, 10) : undefined,
    song: list<any>(item?.songs).map(toSong),
  };
}

async function artist(id: string): Promise<ArtistDetail> {
  const data = await requestJson<any>(BASE + '/api/artist/' + encodeURIComponent(id), { headers: HEADERS });
  const item = data?.artist;
  if (item === undefined) fail(Code.notFound, 'artist not found');
  return {
    source: 'netease',
    id,
    name: cleanText(item?.name),
    avatar: str(item?.picUrl) || undefined,
    song: list<any>(data?.hotSongs).map(toSong),
  };
}

async function playlist(id: string, page: number, size: number): Promise<PlaylistDetail> {
  const data = await requestJson<any>(BASE + '/api/v6/playlist/detail', {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'id=' + encodeURIComponent(id),
  });
  const item = data?.playlist;
  if (item === undefined) fail(Code.notFound, 'playlist not found');
  const trackIds = list<any>(item?.trackIds).map((entry: any) => str(entry?.id)).filter((v: string) => v !== '');
  const total = num(item?.trackCount, trackIds.length);
  const start = (page - 1) * size;
  const ids = trackIds.slice(start, start + size);
  const songs = ids.length > 0 ? await fetchSongs(ids) : list<any>(item?.tracks).slice(0, size).map(toSong);
  return {
    source: 'netease',
    id,
    name: cleanText(item?.name),
    cover: str(item?.coverImgUrl) || undefined,
    creator: cleanText(item?.creator?.nickname) || undefined,
    count: total,
    page,
    size,
    total,
    song: songs,
  };
}

async function rankList(): Promise<RankItem[]> {
  const data = await requestJson<any>(BASE + '/api/toplist', { headers: HEADERS });
  return list<any>(data?.list).map((item: any) => ({
    source: 'netease' as const,
    id: str(item?.id),
    name: cleanText(item?.name),
    cover: str(item?.coverImgUrl) || undefined,
    updateAt: cleanText(item?.updateFrequency) || undefined,
  }));
}

async function rank(id: string): Promise<RankDetail> {
  const detail = await playlist(id, 1, 100);
  return { source: 'netease', id, name: detail.name, cover: detail.cover, song: detail.song };
}

const provider: Provider = {
  source: 'netease',
  capability: { search: true, song: true, url: true, lyric: true, album: true, artist: true, playlist: true, rank: true },
  search,
  song,
  url,
  lyric,
  album,
  artist,
  playlist,
  rankList,
  rank,
};

export default provider;
