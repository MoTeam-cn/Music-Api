// 酷狗：song_search_v2 搜索 + m.kugou.com 老播放接口 + mobilecdn 榜单/歌单（HTTP）。

import { createHash } from 'node:crypto';
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
import { cleanText, list, num, splitArtists, str } from '../core/normalize.ts';
import { requestJson } from '../http/upstream.ts';
import type { Provider } from './types.ts';

const SEARCH = 'https://songsearch.kugou.com/song_search_v2';
const PLAY = 'http://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=';
const CDN = 'http://mobilecdn.kugou.com/api/v3';
const MID = createHash('md5').update(String(Date.now()) + Math.random().toString(36).slice(2)).digest('hex');
const HEADERS = { Referer: 'https://www.kugou.com/', Cookie: 'kg_mid=' + MID + '; kg_dfid=-' };
const CDN_OPTIONS = { headers: HEADERS, allowHttp: true };
const PLAY_OPTIONS = { headers: HEADERS, allowHttp: true };

function splitFilename(value: string): { artist: string[]; name: string } {
  const raw = cleanText(value);
  const index = raw.indexOf(' - ');
  if (index < 0) return { artist: [], name: raw };
  return { artist: splitArtists(raw.slice(0, index)), name: raw.slice(index + 3) };
}

function imageUrl(value: unknown): string | undefined {
  const raw = str(value);
  if (raw === '') return undefined;
  return raw.replace('{size}', '240');
}

function toSong(raw: any): Song {
  const filename = str(raw?.filename ?? raw?.FileName);
  const parsed = filename === '' ? { artist: [] as string[], name: '' } : splitFilename(filename);
  const pay = num(raw?.PayType ?? raw?.pay_type ?? raw?.privilege ?? 0);
  return {
    source: 'kugou',
    id: str(raw?.FileHash ?? raw?.hash ?? raw?.Hash),
    name: cleanText(raw?.SongName ?? raw?.songname ?? parsed.name),
    artist: parsed.artist.length > 0 ? parsed.artist : splitArtists(raw?.SingerName ?? raw?.singername),
    album: cleanText(raw?.AlbumName ?? raw?.album_name),
    albumId: str(raw?.AlbumID ?? raw?.album_id) || undefined,
    duration: num(raw?.Duration ?? raw?.duration),
    cover: imageUrl(raw?.Image ?? raw?.imgurl ?? raw?.img ?? raw?.album_img),
    available: pay === 0,
    vip: pay !== 0,
  };
}

async function search(q: string, page: number, size: number): Promise<SearchPage> {
  const params = new URLSearchParams({
    keyword: q,
    page: String(page),
    pagesize: String(size),
    platform: 'WebFilter',
    userid: '-1',
    clientver: '2000',
    iscorrection: '1',
    privilege_filter: '0',
    filter: '10',
    area_code: '1',
    token: '',
    appid: '1014',
  });
  const data = await requestJson<any>(SEARCH + '?' + params.toString(), { headers: HEADERS });
  const songs = list<any>(data?.data?.lists).map(toSong);
  return { page, size, total: num(data?.data?.total, songs.length), failed: [], list: songs };
}

async function song(id: string): Promise<SongDetail> {
  const data = await requestJson<any>(PLAY + encodeURIComponent(id), PLAY_OPTIONS);
  if (data === undefined || data === null || str(data?.fileName) === '') fail(Code.notFound, 'song not found');
  const parsed = splitFilename(str(data?.fileName));
  const base: Song = {
    source: 'kugou',
    id,
    name: parsed.name,
    artist: parsed.artist,
    duration: num(data?.timeLength),
    cover: imageUrl(data?.album_img),
    available: num(data?.pay_type, 0) === 0,
    vip: num(data?.pay_type, 0) !== 0,
  };
  return { ...base, quality: ['standard', 'high'] };
}

async function url(id: string, quality: Quality): Promise<SongUrl> {
  const data = await requestJson<any>(PLAY + encodeURIComponent(id), PLAY_OPTIONS);
  const link = str(data?.url);
  if (link === '') fail(Code.vip, 'vip or paid only');
  return {
    source: 'kugou',
    id,
    url: link,
    quality,
    bitrate: num(data?.bitRate, 128),
    size: num(data?.fileSize) || undefined,
  };
}

async function lyric(id: string): Promise<Lyric> {
  const searchData = await requestJson<any>('https://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=&duration=&hash=' + encodeURIComponent(id), { headers: HEADERS });
  const candidate = list<any>(searchData?.candidates)[0];
  if (candidate === undefined) fail(Code.notFound, 'lyric not found');
  const dl = await requestJson<any>(
    'https://lyrics.kugou.com/download?ver=1&client=pc&id=' + encodeURIComponent(str(candidate?.id)) + '&accesskey=' + encodeURIComponent(str(candidate?.accesskey)) + '&fmt=lrc&charset=utf8',
    { headers: HEADERS },
  );
  const text = Buffer.from(str(dl?.content), 'base64').toString('utf8');
  if (text.trim() === '') fail(Code.notFound, 'lyric not found');
  return { source: 'kugou', id, lyric: text };
}

async function rankList(): Promise<RankItem[]> {
  const data = await requestJson<any>(CDN + '/rank/list?format=json&withsong=1', CDN_OPTIONS);
  return list<any>(data?.data?.info).map((item: any) => ({
    source: 'kugou' as const,
    id: str(item?.rankid),
    name: cleanText(item?.rankname),
    cover: str(item?.imgurl) || undefined,
    updateAt: cleanText(item?.update_frequency) || undefined,
  }));
}

async function rank(id: string): Promise<RankDetail> {
  const data = await requestJson<any>(CDN + '/rank/song?rankid=' + encodeURIComponent(id) + '&page=1&pagesize=50&format=json', CDN_OPTIONS);
  const meta = (await rankList()).find((item) => item.id === id);
  return {
    source: 'kugou',
    id,
    name: meta?.name ?? '',
    cover: meta?.cover,
    updateAt: meta?.updateAt,
    song: list<any>(data?.data?.info).map(toSong),
  };
}

async function playlist(id: string): Promise<PlaylistDetail> {
  const data = await requestJson<any>(CDN + '/special/song?specialid=' + encodeURIComponent(id) + '&page=1&pagesize=50&format=json', CDN_OPTIONS);
  const info = await requestJson<any>(CDN + '/special/info?specialid=' + encodeURIComponent(id) + '&format=json', CDN_OPTIONS);
  const meta = info?.data ?? {};
  const songs = list<any>(data?.data?.info).map(toSong);
  return {
    source: 'kugou',
    id,
    name: cleanText(meta?.specialname),
    cover: imageUrl(meta?.imgurl),
    creator: cleanText(meta?.nickname) || undefined,
    count: num(meta?.songcount, num(data?.data?.total, songs.length)),
    song: songs,
  };
}

async function album(id: string): Promise<AlbumDetail> {
  const data = await requestJson<any>(CDN + '/album/song?albumid=' + encodeURIComponent(id) + '&page=1&pagesize=50&format=json', CDN_OPTIONS);
  const info = await requestJson<any>(CDN + '/album/info?albumid=' + encodeURIComponent(id) + '&format=json', CDN_OPTIONS);
  const meta = info?.data ?? {};
  const songs = list<any>(data?.data?.info).map(toSong);
  return {
    source: 'kugou',
    id,
    name: cleanText(meta?.albumname),
    artist: splitArtists(meta?.singername),
    cover: imageUrl(meta?.imgurl),
    publishAt: cleanText(meta?.publishtime).slice(0, 10) || undefined,
    song: songs,
  };
}

async function artist(id: string): Promise<ArtistDetail> {
  const data = await requestJson<any>(CDN + '/singer/info?singerid=' + encodeURIComponent(id), CDN_OPTIONS);
  const info = data?.data;
  if (info === undefined) fail(Code.notFound, 'artist not found');
  const songs = await requestJson<any>(CDN + '/singer/song?singerid=' + encodeURIComponent(id) + '&page=1&pagesize=20&format=json', CDN_OPTIONS);
  return {
    source: 'kugou',
    id,
    name: cleanText(info?.singername),
    avatar: str(info?.imgurl) || undefined,
    song: list<any>(songs?.data?.info).map(toSong),
  };
}

const provider: Provider = {
  source: 'kugou',
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
