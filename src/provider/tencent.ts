// QQ 音乐：search_for_qq_cp + 经典 musicu.fcg（无签名），vkey 直链。

import { Code, fail } from '../core/error.ts';
import type {
  AlbumDetail,
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
import { cleanText, list, num, str, uniqueArtists } from '../core/normalize.ts';
import { requestJson } from '../http/upstream.ts';
import type { Provider } from './types.ts';

const C = 'https://c.y.qq.com';
const U = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
const HEADERS = { Referer: 'https://y.qq.com/' };

async function musicu(module: string, method: string, param: Record<string, unknown>): Promise<any> {
  const body = JSON.stringify({ comm: { ct: 24, cv: 0 }, req_1: { module, method, param } });
  const data = await requestJson<any>(U, { method: 'POST', headers: { ...HEADERS, 'Content-Type': 'application/json' }, body });
  const req = data?.req_1;
  if (req === undefined) fail(Code.upstream, 'musicu empty response');
  if (req.code !== undefined && req.code !== 0) fail(Code.upstream, 'musicu code ' + String(req.code));
  return req.data ?? {};
}

function toSong(raw: any): Song {
  const payplay = num(raw?.pay?.payplay ?? raw?.payplay, 0);
  const albumMid = str(raw?.albummid ?? raw?.album?.mid);
  return {
    source: 'tencent',
    id: str(raw?.songmid ?? raw?.mid),
    name: cleanText(raw?.songname ?? raw?.name ?? raw?.title),
    artist: uniqueArtists(raw?.singer ?? raw?.singer_list),
    album: cleanText(raw?.albumname ?? raw?.album?.name),
    albumId: albumMid === '' ? undefined : albumMid,
    duration: num(raw?.interval ?? raw?.duration),
    cover: albumMid === '' ? undefined : 'https://y.gtimg.cn/music/photo_new/T002R300x300M000' + albumMid + '.jpg',
    available: payplay === 0,
    vip: payplay !== 0,
  };
}

async function search(q: string, page: number, size: number): Promise<SearchPage> {
  const url = C + '/soso/fcgi-bin/search_for_qq_cp?format=json&w=' + encodeURIComponent(q) + '&p=' + page + '&n=' + size + '&g_tk=5381&uin=0';
  const data = await requestJson<any>(url, { headers: { ...HEADERS, Referer: 'https://m.y.qq.com/' } });
  const songs = list<any>(data?.data?.song?.list).map(toSong);
  return { page, size, total: num(data?.data?.song?.totalnum, songs.length), failed: [], list: songs };
}

async function song(id: string): Promise<SongDetail> {
  const data = await musicu('music.pf_song_detail_svr', 'get_song_detail', { song_mid: id });
  const info = data?.track_info;
  if (info === undefined) fail(Code.notFound, 'song not found');
  return { ...toSong(info), quality: ['standard', 'high'], publishAt: str(info?.time_public) || undefined };
}

async function url(id: string, quality: Quality): Promise<SongUrl> {
  const guid = String(Math.floor(Math.random() * 1000000000));
  const data = await musicu('vkey.GetVkeyServer', 'CgiGetVkey', {
    guid,
    songmid: [id],
    songtype: [0],
    uin: '0',
    loginflag: 1,
    platform: '20',
  });
  const info = list<any>(data?.midurlinfo)[0];
  const purl = str(info?.purl);
  if (purl === '') fail(Code.vip, 'vip or paid only');
  const sip = list<string>(data?.sip)[0] ?? 'https://dl.stream.qqmusic.qq.com/';
  return { source: 'tencent', id, url: sip + purl, quality, bitrate: quality === 'high' ? 320 : 128 };
}

async function lyric(id: string): Promise<Lyric> {
  const data = await requestJson<any>(C + '/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=' + encodeURIComponent(id) + '&format=json&nobase64=1', {
    headers: { ...HEADERS, Referer: 'https://y.qq.com/portal/player.html' },
  });
  const text = str(data?.lyric);
  if (text === '') fail(Code.notFound, 'lyric not found');
  const trans = str(data?.trans);
  return { source: 'tencent', id, lyric: text, translation: trans === '' ? undefined : trans };
}

async function album(id: string): Promise<AlbumDetail> {
  const data = await requestJson<any>(C + '/v8/fcg-bin/fcg_v8_album_info_cp.fcg?albummid=' + encodeURIComponent(id) + '&format=json', { headers: HEADERS });
  const item = data?.data;
  if (item === undefined) fail(Code.notFound, 'album not found');
  return {
    source: 'tencent',
    id,
    name: cleanText(item?.name),
    artist: uniqueArtists(item?.singer),
    cover: 'https://y.gtimg.cn/music/photo_new/T002R300x300M000' + id + '.jpg',
    publishAt: cleanText(item?.aDate) || undefined,
    song: list<any>(item?.list).map(toSong),
  };
}

async function playlist(id: string): Promise<PlaylistDetail> {
  const url = C + '/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=' + encodeURIComponent(id) + '&format=json';
  const data = await requestJson<any>(url, { headers: HEADERS });
  const item = list<any>(data?.cdlist)[0];
  if (item === undefined) fail(Code.notFound, 'playlist not found');
  return {
    source: 'tencent',
    id,
    name: cleanText(item?.dissname),
    cover: str(item?.logo) || undefined,
    creator: cleanText(item?.nickname) || undefined,
    count: num(item?.songnum, list<any>(item?.songlist).length),
    song: list<any>(item?.songlist).map(toSong),
  };
}

async function rankList(): Promise<RankItem[]> {
  const data = await musicu('musicToplist.ToplistInfoServer', 'GetAll', {});
  const items: RankItem[] = [];
  for (const group of list<any>(data?.group)) {
    for (const top of list<any>(group?.toplist)) {
      items.push({
        source: 'tencent',
        id: str(top?.topId),
        name: cleanText(top?.title),
        cover: str(top?.frontPicUrl) || undefined,
        updateAt: cleanText(top?.updateTime) || undefined,
      });
    }
  }
  return items;
}

async function rank(id: string): Promise<RankDetail> {
  const data = await musicu('musicToplist.ToplistInfoServer', 'GetDetail', { topId: Number(id), offset: 0, num: 50 });
  const info = data?.data ?? {};
  return {
    source: 'tencent',
    id,
    name: cleanText(info?.title),
    cover: str(info?.frontPicUrl) || undefined,
    updateAt: cleanText(info?.updateTime) || undefined,
    song: list<any>(data?.songInfoList).map(toSong),
  };
}

const provider: Provider = {
  source: 'tencent',
  capability: { search: true, song: true, url: true, lyric: true, album: true, artist: false, playlist: true, rank: true },
  search,
  song,
  url,
  lyric,
  album,
  playlist,
  rankList,
  rank,
};

export default provider;
