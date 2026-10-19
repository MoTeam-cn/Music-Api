// 统一领域模型：所有 provider 的输出都收敛到这里。

export type Source = 'netease' | 'tencent' | 'kugou' | 'baidu';
export type Quality = 'standard' | 'high' | 'lossless';

export const SOURCES: Source[] = ['netease', 'tencent', 'kugou', 'baidu'];
export const QUALITIES: Quality[] = ['standard', 'high', 'lossless'];

export interface Song {
  source: Source;
  id: string;
  name: string;
  artist: string[];
  album?: string;
  albumId?: string;
  duration: number;
  cover?: string;
  available: boolean;
  vip: boolean;
}

export interface SongDetail extends Song {
  quality: Quality[];
  publishAt?: string;
}

export interface SongUrl {
  source: Source;
  id: string;
  url: string;
  quality: Quality;
  bitrate: number;
  size?: number;
  expireAt?: number;
}

export interface Lyric {
  source: Source;
  id: string;
  lyric: string;
  translation?: string;
}

export interface AlbumDetail {
  source: Source;
  id: string;
  name: string;
  artist: string[];
  cover?: string;
  publishAt?: string;
  song: Song[];
}

export interface ArtistDetail {
  source: Source;
  id: string;
  name: string;
  avatar?: string;
  song: Song[];
}

export interface PlaylistDetail {
  source: Source;
  id: string;
  name: string;
  cover?: string;
  creator?: string;
  count: number;
  song: Song[];
}

export interface RankItem {
  source: Source;
  id: string;
  name: string;
  cover?: string;
  updateAt?: string;
}

export interface RankDetail {
  source: Source;
  id: string;
  name: string;
  cover?: string;
  updateAt?: string;
  song: Song[];
}

export interface SearchPage {
  page: number;
  size: number;
  total: number;
  failed: Source[];
  list: Song[];
}
