// 百度音乐（千千音乐 / 91q）：公开 web 接口，签名 = md5(排序参数 + 固定 secret)。

import { createHash } from 'node:crypto';
import { Code, fail } from '../core/error.ts';
import type {
  ArtistDetail,
  Lyric,
  Quality,
  SearchPage,
  Song,
  SongDetail,
  SongUrl,
} from '../core/model.ts';
import { bool, cleanText, list, num, str, uniqueArtists } from '../core/normalize.ts';
import { requestJson, requestText } from '../http/upstream.ts';
import type { Provider } from './types.ts';

const BASE = 'https://api-qianqian.taihe.com';
const APPID = '16073360';
const SECRET = '0b50b02fd0d73a9c4c8c3a781c30845f';
const HEADERS = { Referer: 'https://music.taihe.com/' };

function signedQuery(params: Record<string, string>): string {
  const all: Record<string, string> = { ...params, appid: APPID, timestamp: String(Math.floor(Date.now() / 1000)) };
  const keys = Object.keys(all).sort();
  const raw = keys.map((key) => key + '=' + all[key]).join('&') + SECRET;
  const sign = createHash('md5').update(raw).digest('hex');
  const query = Object.entries(all)
    .map(([key, value]) => key + '=' + encodeURIComponent(value))
    .join('&');
  return query + '&sign=' + sign;
}

async function api(path: string, params: Record<string, string>): Promise<any> {
  const data = await requestJson<any>(BASE + path + '?' + signedQuery(params), { headers: HEADERS });
  if (data?.state === false) {
    const errno = num(data?.errno);
    if (errno === 23001 || errno === 22001) fail(Code.notFound, 'baidu not found: ' + errno);
    fail(Code.upstream, 'baidu errno ' + errno);
  }
  return data;
}

function toSong(raw: any): Song {
  const vip = bool(raw?.isVip) || bool(raw?.isPaid);
  return {
    source: 'baidu',
    id: str(raw?.TSID ?? raw?.id),
    name: cleanText(raw?.title),
    artist: uniqueArtists(raw?.artist),
    album: cleanText(raw?.albumTitle),
    albumId: str(raw?.albumAssetCode) || undefined,
    duration: num(raw?.duration),
    cover: str(raw?.pic) || undefined,
    available: !vip,
    vip,
  };
}

async function search(q: string, page: number, size: number): Promise<SearchPage> {
  const data = await api('/v1/search', { word: q, type: '1', pageNo: String(page), pageSize: String(size) });
  const songs = list<any>(data?.data?.typeTrack).map(toSong);
  return { page, size, total: num(data?.data?.total, songs.length), failed: [], list: songs };
}

async function song(id: string): Promise<SongDetail> {
  const data = await api('/v1/song/info', { TSID: id });
  const raw = list<any>(data?.data)[0];
  if (raw === undefined) fail(Code.notFound, 'song not found');
  return { ...toSong(raw), quality: ['standard', 'high'], publishAt: str(raw?.releaseDate).slice(0, 10) || undefined };
}

async function url(id: string, quality: Quality): Promise<SongUrl> {
  const data = await api('/v1/song/tracklink', { TSID: id });
  const raw = data?.data ?? {};
  const link = str(raw?.path);
  if (link === '' || bool(raw?.isVip) || bool(raw?.isPaid)) fail(Code.vip, 'vip or paid only');
  return {
    source: 'baidu',
    id,
    url: link,
    quality,
    bitrate: num(raw?.rate, 128),
    size: num(raw?.size) || undefined,
    expireAt: num(raw?.expireTime) || undefined,
  };
}

async function lyric(id: string): Promise<Lyric> {
  const data = await api('/v1/song/tracklink', { TSID: id });
  const url = str(data?.data?.lyric);
  if (url === '') fail(Code.notFound, 'lyric not found');
  const text = await requestText(url, { headers: HEADERS });
  if (text.trim() === '') fail(Code.notFound, 'lyric not found');
  return { source: 'baidu', id, lyric: text };
}

async function artist(id: string): Promise<ArtistDetail> {
  const info = await api('/v1/artist/info', { artistCode: id });
  const songs = await api('/v1/artist/song', { artistCode: id, pageNo: '1', pageSize: '20' });
  return {
    source: 'baidu',
    id,
    name: cleanText(info?.data?.name),
    avatar: str(info?.data?.pic) || undefined,
    song: list<any>(songs?.data?.result).map(toSong),
  };
}

const provider: Provider = {
  source: 'baidu',
  capability: { search: true, song: true, url: true, lyric: true, album: false, artist: true, playlist: false, rank: false },
  search,
  song,
  url,
  lyric,
  artist,
};

export default provider;
